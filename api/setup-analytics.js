import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  try {
    const sql = neon(process.env.POSTGRES_URL);
    await sql`CREATE TABLE IF NOT EXISTS simulation_events (
      id SERIAL PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      referral_code TEXT,
      vehicle_url TEXT,
      vehicle_title TEXT,
      vehicle_price NUMERIC,
      created_at TIMESTAMP DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sim_visitor ON simulation_events(visitor_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sim_referral ON simulation_events(referral_code)`;
    res.status(200).json({ ok: true, message: 'simulation_events table ready' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
