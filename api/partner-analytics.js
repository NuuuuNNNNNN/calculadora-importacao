import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Referral code required' });

  try {
    const sql = neon(process.env.POSTGRES_URL);

    // Get simulation stats for this referral code
    const stats = await sql`
      SELECT 
        COUNT(*) as total_simulations,
        COUNT(DISTINCT visitor_id) as unique_visitors,
        COUNT(DISTINCT vehicle_url) as unique_vehicles,
        MIN(created_at) as first_simulation,
        MAX(created_at) as last_simulation
      FROM simulation_events 
      WHERE referral_code = ${code}
    `;

    // Get recent simulations (last 20) with distinct visitors
    const recent = await sql`
      SELECT visitor_id, vehicle_title, vehicle_price, vehicle_url, created_at
      FROM simulation_events
      WHERE referral_code = ${code}
      ORDER BY created_at DESC
      LIMIT 20
    `;

    // Get leads for this referral code
    const leads = await sql`
      SELECT id, name, conversion_status, vehicle_title, created_at
      FROM referral_leads
      WHERE referral_code = ${code}
      ORDER BY created_at DESC
    `;

    // Build visitor summary (group simulations by visitor)
    const visitors = await sql`
      SELECT 
        visitor_id,
        COUNT(*) as simulations,
        COUNT(DISTINCT vehicle_url) as vehicles_checked,
        MIN(created_at) as first_visit,
        MAX(created_at) as last_visit
      FROM simulation_events
      WHERE referral_code = ${code}
      GROUP BY visitor_id
      ORDER BY last_visit DESC
    `;

    res.status(200).json({
      ok: true,
      summary: {
        unique_visitors: Number(stats[0]?.unique_visitors || 0),
        total_simulations: Number(stats[0]?.total_simulations || 0),
        unique_vehicles: Number(stats[0]?.unique_vehicles || 0),
        leads: leads.length,
        conversions: leads.filter(l => l.conversion_status === 'completed' || l.conversion_status === 'paid').length,
        first_activity: stats[0]?.first_simulation,
        last_activity: stats[0]?.last_simulation
      },
      visitors: visitors.map(v => ({
        id: v.visitor_id.substring(0, 8) + '...',
        simulations: Number(v.simulations),
        vehicles_checked: Number(v.vehicles_checked),
        first_visit: v.first_visit,
        last_visit: v.last_visit
      })),
      recent_simulations: recent.map(r => ({
        visitor: r.visitor_id.substring(0, 8) + '...',
        vehicle: r.vehicle_title,
        price: r.vehicle_price,
        date: r.created_at
      })),
      leads: leads.map(l => ({
        name: l.name,
        status: l.conversion_status,
        vehicle: l.vehicle_title,
        date: l.created_at
      }))
    });
  } catch (e) {
    console.error('Analytics error:', e);
    res.status(500).json({ error: 'Internal error', detail: e.message });
  }
}
