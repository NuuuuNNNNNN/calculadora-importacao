import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  try {
    const sql = neon(process.env.POSTGRES_URL);
    await sql`ALTER TABLE simulation_events ADD COLUMN IF NOT EXISTS vehicle_title TEXT`;
    await sql`ALTER TABLE simulation_events ADD COLUMN IF NOT EXISTS vehicle_price NUMERIC`;
    res.status(200).json({ ok: true, message: 'Columns added' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
