import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { visitor_id, referral_code, vehicle_url, vehicle_title, vehicle_price } = req.body;
    if (!visitor_id) return res.status(400).json({ error: 'visitor_id required' });

    const sql = neon(process.env.POSTGRES_URL);
    await sql`INSERT INTO simulation_events (visitor_id, referral_code, vehicle_url, vehicle_title, vehicle_price)
              VALUES (${visitor_id}, ${referral_code || null}, ${vehicle_url || null}, ${vehicle_title || null}, ${vehicle_price || null})`;

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Track error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
}
