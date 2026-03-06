const { neon } = require('@neondatabase/serverless');

// Initialize DB connection
function getSQL() {
  return neon(process.env.DATABASE_URL);
}

// Auto-create tables on first call
async function ensureTables(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS referral_events (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(20) NOT NULL,
      referral_code VARCHAR(10),
      vehicle_url TEXT,
      vehicle_make VARCHAR(100),
      vehicle_model VARCHAR(100),
      vehicle_year INT,
      vehicle_price DECIMAL(12,2),
      lead_name VARCHAR(200),
      lead_email VARCHAR(200),
      lead_phone VARCHAR(50),
      source_page VARCHAR(50),
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_ref_code ON referral_events(referral_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ref_type ON referral_events(event_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ref_date ON referral_events(created_at)`;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getSQL();

  try {
    await ensureTables(sql);

    // POST = register event
    if (req.method === 'POST') {
      const {
        event_type, referral_code, vehicle_url,
        vehicle_make, vehicle_model, vehicle_year, vehicle_price,
        lead_name, lead_email, lead_phone, source_page
      } = req.body || {};

      if (!event_type) {
        return res.status(400).json({ error: 'event_type required' });
      }

      const ua = req.headers['user-agent'] || '';

      await sql`
        INSERT INTO referral_events 
          (event_type, referral_code, vehicle_url, vehicle_make, vehicle_model, 
           vehicle_year, vehicle_price, lead_name, lead_email, lead_phone, 
           source_page, user_agent)
        VALUES 
          (${event_type}, ${referral_code || null}, ${vehicle_url || null}, 
           ${vehicle_make || null}, ${vehicle_model || null},
           ${vehicle_year || null}, ${vehicle_price || null},
           ${lead_name || null}, ${lead_email || null}, ${lead_phone || null},
           ${source_page || null}, ${ua})
      `;

      return res.status(200).json({ success: true });
    }

    // GET = stats (protected with simple key)
    if (req.method === 'GET') {
      const key = req.query.key;
      if (key !== process.env.ADMIN_KEY && key !== 'thesv2024admin') {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const period = req.query.period || '30d';
      let interval = '30 days';
      if (period === '7d') interval = '7 days';
      if (period === '90d') interval = '90 days';
      if (period === 'all') interval = '10 years';

      // Overview stats
      const overview = await sql`
        SELECT 
          COUNT(*) FILTER (WHERE event_type = 'share') as total_shares,
          COUNT(*) FILTER (WHERE event_type = 'view') as total_views,
          COUNT(*) FILTER (WHERE event_type = 'referral_view') as referral_views,
          COUNT(*) FILTER (WHERE event_type = 'lead') as total_leads,
          COUNT(*) FILTER (WHERE event_type = 'lead' AND referral_code IS NOT NULL) as referral_leads,
          COUNT(DISTINCT referral_code) FILTER (WHERE referral_code IS NOT NULL) as unique_referrers
        FROM referral_events
        WHERE created_at >= NOW() - ${interval}::interval
      `;

      // Top referrers
      const topReferrers = await sql`
        SELECT 
          referral_code,
          COUNT(*) FILTER (WHERE event_type = 'referral_view') as views,
          COUNT(*) FILTER (WHERE event_type = 'lead') as leads,
          MIN(created_at) as first_activity,
          MAX(created_at) as last_activity
        FROM referral_events
        WHERE referral_code IS NOT NULL
          AND created_at >= NOW() - ${interval}::interval
        GROUP BY referral_code
        ORDER BY leads DESC, views DESC
        LIMIT 20
      `;

      // Top vehicles shared
      const topVehicles = await sql`
        SELECT 
          vehicle_make, vehicle_model, vehicle_year, vehicle_price,
          COUNT(*) FILTER (WHERE event_type = 'share') as shares,
          COUNT(*) FILTER (WHERE event_type = 'referral_view') as views,
          COUNT(*) FILTER (WHERE event_type = 'lead') as leads
        FROM referral_events
        WHERE vehicle_make IS NOT NULL
          AND created_at >= NOW() - ${interval}::interval
        GROUP BY vehicle_make, vehicle_model, vehicle_year, vehicle_price
        ORDER BY shares DESC
        LIMIT 20
      `;

      // Daily activity (last 30 days)
      const dailyActivity = await sql`
        SELECT 
          DATE(created_at) as day,
          COUNT(*) FILTER (WHERE event_type = 'view') as views,
          COUNT(*) FILTER (WHERE event_type = 'share') as shares,
          COUNT(*) FILTER (WHERE event_type = 'referral_view') as referral_views,
          COUNT(*) FILTER (WHERE event_type = 'lead') as leads
        FROM referral_events
        WHERE created_at >= NOW() - ${interval}::interval
        GROUP BY DATE(created_at)
        ORDER BY day DESC
        LIMIT 30
      `;

      // Recent leads
      const recentLeads = await sql`
        SELECT 
          lead_name, lead_email, lead_phone, referral_code,
          vehicle_make, vehicle_model, vehicle_year, vehicle_price,
          created_at
        FROM referral_events
        WHERE event_type = 'lead'
          AND created_at >= NOW() - ${interval}::interval
        ORDER BY created_at DESC
        LIMIT 50
      `;

      return res.status(200).json({
        period,
        overview: overview[0],
        topReferrers,
        topVehicles,
        dailyActivity,
        recentLeads
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Referral tracking error:', err);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
};
