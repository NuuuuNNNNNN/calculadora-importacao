const { neon } = require('@neondatabase/serverless');

async function initDb(sql) {
  await sql`CREATE TABLE IF NOT EXISTS referral_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    referral_code VARCHAR(20),
    vehicle_url TEXT,
    vehicle_title TEXT,
    vehicle_price NUMERIC,
    source_page VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS referral_leads (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    referral_code VARCHAR(20),
    vehicle_url TEXT,
    vehicle_title TEXT,
    vehicle_price NUMERIC,
    import_cost NUMERIC DEFAULT 0,
    cashback_amount NUMERIC DEFAULT 0,
    conversion_status VARCHAR(30) DEFAULT 'lead',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  try { await sql`ALTER TABLE referral_events ADD COLUMN IF NOT EXISTS vehicle_url TEXT DEFAULT ''`; } catch(e) {}
  try { await sql`ALTER TABLE referral_events ADD COLUMN IF NOT EXISTS vehicle_title TEXT DEFAULT ''`; } catch(e) {}
  try { await sql`ALTER TABLE referral_events ADD COLUMN IF NOT EXISTS vehicle_price NUMERIC DEFAULT 0`; } catch(e) {}
  try { await sql`ALTER TABLE referral_events ADD COLUMN IF NOT EXISTS source_page VARCHAR(50) DEFAULT ''`; } catch(e) {}
  try { await sql`ALTER TABLE referral_leads ADD COLUMN IF NOT EXISTS vehicle_url TEXT DEFAULT ''`; } catch(e) {}
  try { await sql`ALTER TABLE referral_leads ADD COLUMN IF NOT EXISTS vehicle_title TEXT DEFAULT ''`; } catch(e) {}
  try { await sql`ALTER TABLE referral_leads ADD COLUMN IF NOT EXISTS vehicle_price NUMERIC DEFAULT 0`; } catch(e) {}
  try { await sql`ALTER TABLE referral_leads ADD COLUMN IF NOT EXISTS import_cost NUMERIC DEFAULT 0`; } catch(e) {}
  try { await sql`ALTER TABLE referral_leads ADD COLUMN IF NOT EXISTS cashback_amount NUMERIC DEFAULT 0`; } catch(e) {}
  try { await sql`ALTER TABLE referral_leads ADD COLUMN IF NOT EXISTS conversion_status VARCHAR(30) DEFAULT 'lead'`; } catch(e) {}
  try { await sql`ALTER TABLE referral_leads ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`; } catch(e) {}
  try { await sql`ALTER TABLE referral_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`; } catch(e) {}
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
  if (!process.env.POSTGRES_URL) return res.status(500).json({ error: 'POSTGRES_URL not configured' });
  const sql = neon(process.env.POSTGRES_URL);
  await initDb(sql);

  // ─── POST: Track event or submit lead ───
  if (req.method === 'POST') {
    const b = req.body || {};
    if (b.action === 'lead') {
      // ANTI-EXPLOIT: Block if referral_code === my_referral_code (self-referral)
      if (b.referral_code && b.my_referral_code && b.referral_code === b.my_referral_code) {
        return res.status(400).json({ error: 'self_referral', message: 'Auto-referência não permitida' });
      }
      const ic = Number(b.import_cost) || 0;
      const cb = (ic && b.referral_code) ? Math.round(ic * 0.05) : 0;
      await sql`INSERT INTO referral_leads (name, email, phone, referral_code, vehicle_url, vehicle_title, vehicle_price, import_cost, cashback_amount)
        VALUES (${b.name||''}, ${b.email||''}, ${b.phone||''}, ${b.referral_code||null}, ${b.vehicle_url||''}, ${b.vehicle_title||''}, ${Number(b.vehicle_price)||0}, ${ic}, ${cb})`;
      return res.json({ ok: true, cashback: cb });
    }
    await sql`INSERT INTO referral_events (event_type, referral_code, my_referral_code, vehicle_url, vehicle_title, vehicle_price, source_page)
      VALUES (${b.event_type||'view'}, ${b.referral_code||null}, ${b.my_referral_code||''}, ${b.vehicle_url||''}, ${b.vehicle_title||''}, ${Number(b.vehicle_price)||0}, ${b.source_page||''})`;
    return res.json({ ok: true });
  }

  // ─── PATCH: Admin update lead status ───
  if (req.method === 'PATCH') {
    const key = req.query?.key || req.headers?.authorization?.replace('Bearer ','');
    if (key !== 'thesv2024admin') return res.status(401).json({ error: 'Unauthorized' });
    const { lead_id, conversion_status, notes } = req.body || {};
    if (!lead_id) return res.status(400).json({ error: 'lead_id required' });
    if (conversion_status) await sql`UPDATE referral_leads SET conversion_status = ${conversion_status}, updated_at = NOW() WHERE id = ${lead_id}`;
    if (notes !== undefined) await sql`UPDATE referral_leads SET notes = ${notes}, updated_at = NOW() WHERE id = ${lead_id}`;
    return res.json({ ok: true });
  }

  // ─── GET ───
  const { period, code, key } = req.query || {};

  // Client portal - stats for specific referral code
  if (code) {
    const shares = await sql`SELECT COUNT(*) as c FROM referral_events WHERE referral_code = ${code} AND event_type = 'share'`;
    const views = await sql`SELECT COUNT(*) as c FROM referral_events WHERE referral_code = ${code} AND event_type = 'referral_view'`;
    const leads = await sql`SELECT * FROM referral_leads WHERE referral_code = ${code} ORDER BY created_at DESC`;
    const totalCB = leads.reduce((s, l) => s + (Number(l.cashback_amount) || 0), 0);
    const pendingCB = leads.filter(l => l.conversion_status === 'completed').reduce((s, l) => s + (Number(l.cashback_amount) || 0), 0);
    const paidCB = leads.filter(l => l.conversion_status === 'paid').reduce((s, l) => s + (Number(l.cashback_amount) || 0), 0);
    const vehicles = await sql`SELECT vehicle_title, vehicle_price, vehicle_url, COUNT(*) as shares, MAX(created_at) as last_shared
      FROM referral_events WHERE referral_code = ${code} AND event_type = 'share' AND vehicle_title IS NOT NULL AND vehicle_title != ''
      GROUP BY vehicle_title, vehicle_price, vehicle_url ORDER BY shares DESC LIMIT 20`;
    return res.json({
      code,
      total_shares: Number(shares[0]?.c || 0),
      total_views: Number(views[0]?.c || 0),
      total_leads: leads.length,
      leads_by_status: {
        lead: leads.filter(l => l.conversion_status === 'lead').length,
        negotiating: leads.filter(l => l.conversion_status === 'negotiating').length,
        completed: leads.filter(l => l.conversion_status === 'completed').length,
        paid: leads.filter(l => l.conversion_status === 'paid').length,
      },
      cashback: { potential: totalCB, pending: pendingCB, paid: paidCB },
      leads: leads.map(l => ({
        id: l.id, name: l.name, vehicle_title: l.vehicle_title,
        vehicle_price: Number(l.vehicle_price), import_cost: Number(l.import_cost),
        cashback_amount: Number(l.cashback_amount), status: l.conversion_status, created_at: l.created_at,
      })),
      vehicles,
    });
  }

  // Admin dashboard
  const days = period === '7d' ? 7 : period === '90d' ? 90 : period === 'all' ? 3650 : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const evStats = await sql`SELECT event_type, COUNT(*) as c FROM referral_events WHERE created_at >= ${since} GROUP BY event_type`;
  const evMap = {};
  evStats.forEach(s => evMap[s.event_type] = Number(s.c));

  const leadsAll = await sql`SELECT * FROM referral_leads WHERE created_at >= ${since} ORDER BY created_at DESC LIMIT 50`;
  const refLeads = leadsAll.filter(l => l.referral_code);
  const uniqueRefs = new Set(refLeads.map(l => l.referral_code)).size;

  const topReferrers = await sql`SELECT re.referral_code,
    COUNT(DISTINCT CASE WHEN re.event_type='referral_view' THEN re.id END) as views,
    (SELECT COUNT(*) FROM referral_leads rl WHERE rl.referral_code = re.referral_code) as leads,
    MAX(re.created_at) as last_activity
    FROM referral_events re WHERE re.referral_code IS NOT NULL AND re.created_at >= ${since}
    GROUP BY re.referral_code ORDER BY views DESC LIMIT 10`;

  const topVehicles = await sql`SELECT vehicle_title, vehicle_price, COUNT(*) as shares,
    (SELECT COUNT(*) FROM referral_leads rl WHERE rl.vehicle_title = re.vehicle_title) as leads
    FROM referral_events re WHERE re.event_type = 'share' AND re.vehicle_title IS NOT NULL AND re.vehicle_title != '' AND re.created_at >= ${since}
    GROUP BY re.vehicle_title, re.vehicle_price ORDER BY shares DESC LIMIT 10`;

  // Daily activity grouped
  const dailyRaw = await sql`SELECT DATE(created_at) as day, event_type, COUNT(*) as c
    FROM referral_events WHERE created_at >= ${since} GROUP BY DATE(created_at), event_type ORDER BY day`;
  const dailyLeads = await sql`SELECT DATE(created_at) as day, COUNT(*) as c
    FROM referral_leads WHERE created_at >= ${since} GROUP BY DATE(created_at) ORDER BY day`;

  const dayMap = {};
  dailyRaw.forEach(r => {
    if (!dayMap[r.day]) dayMap[r.day] = { day: r.day, views: 0, shares: 0, referral_views: 0, leads: 0 };
    if (r.event_type === 'view') dayMap[r.day].views = Number(r.c);
    if (r.event_type === 'share') dayMap[r.day].shares = Number(r.c);
    if (r.event_type === 'referral_view') dayMap[r.day].referral_views = Number(r.c);
  });
  dailyLeads.forEach(r => {
    if (!dayMap[r.day]) dayMap[r.day] = { day: r.day, views: 0, shares: 0, referral_views: 0, leads: 0 };
    dayMap[r.day].leads = Number(r.c);
  });
  const dailyActivity = Object.values(dayMap).sort((a, b) => a.day > b.day ? 1 : -1);

  return res.json({
    overview: {
      total_views: evMap.view || 0,
      total_shares: evMap.share || 0,
      referral_views: evMap.referral_view || 0,
      total_leads: leadsAll.length,
      referral_leads: refLeads.length,
      unique_referrers: uniqueRefs,
    },
    dailyActivity,
    topReferrers,
    topVehicles: topVehicles.map(v => ({
      vehicle_title: v.vehicle_title, vehicle_price: v.vehicle_price,
      shares: Number(v.shares), leads: Number(v.leads),
    })),
    recentLeads: leadsAll.map(l => ({
      id: l.id, created_at: l.created_at, lead_name: l.name, lead_email: l.email,
      lead_phone: l.phone, vehicle_title: l.vehicle_title, vehicle_price: l.vehicle_price,
      referral_code: l.referral_code, import_cost: Number(l.import_cost) || 0,
      cashback_amount: Number(l.cashback_amount) || 0,
      conversion_status: l.conversion_status || 'lead', notes: l.notes || '',
    })),
  });
  } catch(err) {
    console.error('referral-track error:', err);
    return res.status(500).json({ error: err.message, stack: err.stack?.split('\n').slice(0,3) });
  }
};