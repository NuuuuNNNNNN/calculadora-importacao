const { neon } = require('@neondatabase/serverless');

async function initDb(sql) {
  // Partners table (registered users)
  await sql`CREATE TABLE IF NOT EXISTS referral_partners (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50) NOT NULL,
    referral_code VARCHAR(20) NOT NULL UNIQUE,
    access_token VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  // Events table
  await sql`CREATE TABLE IF NOT EXISTS referral_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    referral_code VARCHAR(20),
    my_referral_code VARCHAR(20) DEFAULT '',
    vehicle_url TEXT DEFAULT '',
    vehicle_title TEXT DEFAULT '',
    vehicle_price NUMERIC DEFAULT 0,
    source_page VARCHAR(50) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  // Leads table
  await sql`CREATE TABLE IF NOT EXISTS referral_leads (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    referral_code VARCHAR(20),
    vehicle_url TEXT DEFAULT '',
    vehicle_title TEXT DEFAULT '',
    vehicle_price NUMERIC DEFAULT 0,
    import_cost NUMERIC DEFAULT 0,
    cashback_amount NUMERIC DEFAULT 0,
    conversion_status VARCHAR(30) DEFAULT 'lead',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TS';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 48; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
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

  // ─── POST ───
  if (req.method === 'POST') {
    const b = req.body || {};

    // ── REGISTER: Create partner account ──
    if (b.action === 'register') {
      const name = (b.name || '').trim();
      const email = (b.email || '').trim().toLowerCase();
      const phone = (b.phone || '').trim();
      if (!name || !email || !phone) return res.status(400).json({ error: 'missing_fields', message: 'Nome, email e telefone são obrigatórios.' });
      if (phone.length < 6) return res.status(400).json({ error: 'invalid_phone', message: 'Número de telefone inválido.' });

      // Check if email already registered
      const existing = await sql`SELECT * FROM referral_partners WHERE email = ${email}`;
      if (existing.length > 0) {
        return res.json({
          ok: true, already_registered: true,
          referral_code: existing[0].referral_code,
          access_token: existing[0].access_token,
          name: existing[0].name,
          message: 'Conta já existente. Bem-vindo de volta!'
        });
      }

      // Generate unique code
      let code, codeExists;
      do {
        code = generateCode();
        codeExists = await sql`SELECT id FROM referral_partners WHERE referral_code = ${code}`;
      } while (codeExists.length > 0);

      const token = generateToken();
      await sql`INSERT INTO referral_partners (name, email, phone, referral_code, access_token)
        VALUES (${name}, ${email}, ${phone}, ${code}, ${token})`;

      return res.json({
        ok: true, already_registered: false,
        referral_code: code,
        access_token: token,
        name: name,
        message: 'Conta criada com sucesso!'
      });
    }

    // ── LOGIN: Authenticate partner ──
    if (b.action === 'login') {
      const email = (b.email || '').trim().toLowerCase();
      const phone_last4 = (b.phone_last4 || '').trim();
      if (!email) return res.status(400).json({ error: 'missing_email', message: 'Email é obrigatório.' });
      if (!phone_last4 || phone_last4.length !== 4) return res.status(400).json({ error: 'invalid_phone', message: 'Últimos 4 dígitos do telefone são obrigatórios.' });

      const partner = await sql`SELECT * FROM referral_partners WHERE email = ${email}`;
      if (partner.length === 0) return res.status(404).json({ error: 'not_found', message: 'Email não encontrado. Registe-se primeiro na calculadora.' });

      // Verify last 4 digits of phone
      const storedPhone = partner[0].phone.replace(/\D/g, '');
      if (!storedPhone.endsWith(phone_last4)) {
        return res.status(401).json({ error: 'invalid_credentials', message: 'Dados de verificação incorrectos.' });
      }

      return res.json({
        ok: true,
        referral_code: partner[0].referral_code,
        access_token: partner[0].access_token,
        name: partner[0].name,
      });
    }

    // ── LEAD: Submit lead ──
    if (b.action === 'lead') {
      if (b.referral_code && b.my_referral_code && b.referral_code === b.my_referral_code) {
        return res.status(400).json({ error: 'self_referral', message: 'Auto-referência não permitida' });
      }
      // Anti-exploit: check if lead email matches partner email for same referral code
      if (b.referral_code && b.email) {
        const partnerCheck = await sql`SELECT email FROM referral_partners WHERE referral_code = ${b.referral_code}`;
        if (partnerCheck.length > 0 && partnerCheck[0].email === b.email.trim().toLowerCase()) {
          return res.status(400).json({ error: 'self_referral', message: 'Não pode usar o seu próprio código de referência.' });
        }
      }
      const ic = Number(b.import_cost) || 0;
      const cb = (ic && b.referral_code) ? Math.round(ic * 0.05) : 0;
      await sql`INSERT INTO referral_leads (name, email, phone, referral_code, vehicle_url, vehicle_title, vehicle_price, import_cost, cashback_amount)
        VALUES (${b.name||''}, ${b.email||''}, ${b.phone||''}, ${b.referral_code||null}, ${b.vehicle_url||''}, ${b.vehicle_title||''}, ${Number(b.vehicle_price)||0}, ${ic}, ${cb})`;
      return res.json({ ok: true, cashback: cb });
    }

    // ── EVENT: Track generic event ──
    await sql`INSERT INTO referral_events (event_type, referral_code, my_referral_code, vehicle_url, vehicle_title, vehicle_price, source_page)
      VALUES (${b.event_type||'view'}, ${b.referral_code||null}, ${b.my_referral_code||''}, ${b.vehicle_url||''}, ${b.vehicle_title||''}, ${Number(b.vehicle_price)||0}, ${b.source_page||''})`;
    return res.json({ ok: true });
  }

  // ─── PATCH: Admin update ───
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
  const { code, token, key, period } = req.query || {};

  // ── Partner dashboard (by token or code) ──
  if (token || code) {
    let partnerCode = code;
    let partnerName = '';

    // If token provided, validate it
    if (token) {
      const partner = await sql`SELECT * FROM referral_partners WHERE access_token = ${token}`;
      if (partner.length === 0) return res.status(401).json({ error: 'invalid_token', message: 'Sessão inválida. Faça login novamente.' });
      partnerCode = partner[0].referral_code;
      partnerName = partner[0].name;
    } else if (code) {
      // Code-based access — verify partner exists
      const partner = await sql`SELECT name FROM referral_partners WHERE referral_code = ${code}`;
      if (partner.length > 0) partnerName = partner[0].name;
    }

    const shares = await sql`SELECT COUNT(*) as c FROM referral_events WHERE referral_code = ${partnerCode} AND event_type = 'share'`;
    const views = await sql`SELECT COUNT(*) as c FROM referral_events WHERE referral_code = ${partnerCode} AND event_type = 'referral_view'`;
    const leads = await sql`SELECT * FROM referral_leads WHERE referral_code = ${partnerCode} ORDER BY created_at DESC`;
    const totalCB = leads.reduce((s, l) => s + (Number(l.cashback_amount) || 0), 0);
    const pendingCB = leads.filter(l => l.conversion_status === 'completed').reduce((s, l) => s + (Number(l.cashback_amount) || 0), 0);
    const paidCB = leads.filter(l => l.conversion_status === 'paid').reduce((s, l) => s + (Number(l.cashback_amount) || 0), 0);

    const vehicles = await sql`SELECT vehicle_title, vehicle_price, vehicle_url, COUNT(*) as shares, MAX(created_at) as last_shared
      FROM referral_events WHERE referral_code = ${partnerCode} AND event_type = 'share' AND vehicle_title IS NOT NULL AND vehicle_title != ''
      GROUP BY vehicle_title, vehicle_price, vehicle_url ORDER BY shares DESC LIMIT 20`;

    const viewedVehicles = await sql`SELECT vehicle_title, vehicle_price, vehicle_url, COUNT(*) as views, MAX(created_at) as last_viewed
      FROM referral_events WHERE referral_code = ${partnerCode} AND event_type = 'referral_view' AND vehicle_title IS NOT NULL AND vehicle_title != ''
      GROUP BY vehicle_title, vehicle_price, vehicle_url ORDER BY views DESC LIMIT 20`;

    const viewPrices = await sql`SELECT DISTINCT vehicle_url, vehicle_price
      FROM referral_events WHERE referral_code = ${partnerCode} AND event_type = 'referral_view' AND vehicle_price > 0`;
    let viewPotentialCB = 0;
    viewPrices.forEach(v => {
      const price = Number(v.vehicle_price) || 0;
      const serviceFee = Math.max(1500, Math.min(30000, price * 0.05));
      viewPotentialCB += serviceFee * 0.05;
    });
    const totalPotentialCB = Math.max(totalCB, viewPotentialCB);

    const totalShares = Number(shares[0]?.c || 0);
    const totalViews = Number(views[0]?.c || 0);

    return res.json({
      code: partnerCode,
      partner_name: partnerName,
      total_shares: Math.max(totalShares, totalViews),
      total_views: totalViews,
      total_leads: leads.length,
      leads_by_status: {
        lead: leads.filter(l => l.conversion_status === 'lead').length,
        reserva: leads.filter(l => l.conversion_status === 'reserva').length,
        negotiating: leads.filter(l => l.conversion_status === 'negotiating').length,
        completed: leads.filter(l => l.conversion_status === 'completed').length,
        paid: leads.filter(l => l.conversion_status === 'paid').length,
      },
      cashback: { potential: totalPotentialCB, pending: pendingCB, paid: paidCB },
      potential_business: {
        unique_vehicles: viewPrices.length,
        total_value: viewPrices.reduce((s, v) => s + (Number(v.vehicle_price) || 0), 0),
        estimated_cashback: viewPotentialCB,
      },
      leads: leads.map(l => ({
        id: l.id, name: l.name, vehicle_title: l.vehicle_title,
        vehicle_price: Number(l.vehicle_price), import_cost: Number(l.import_cost),
        cashback_amount: Number(l.cashback_amount), status: l.conversion_status, created_at: l.created_at,
      })),
      vehicles,
      viewed_vehicles: viewedVehicles,
    });
  }

  // ── Admin dashboard ──
  const days = period === '7d' ? 7 : period === '90d' ? 90 : period === 'all' ? 3650 : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const evStats = await sql`SELECT event_type, COUNT(*) as c FROM referral_events WHERE created_at >= ${since} GROUP BY event_type`;
  const evMap = {};
  evStats.forEach(s => evMap[s.event_type] = Number(s.c));

  const leadsAll = await sql`SELECT * FROM referral_leads WHERE created_at >= ${since} ORDER BY created_at DESC LIMIT 50`;
  const refLeads = leadsAll.filter(l => l.referral_code);
  const uniqueRefs = new Set(refLeads.map(l => l.referral_code)).size;

  // Include partner info in top referrers
  const topReferrers = await sql`SELECT re.referral_code,
    COUNT(DISTINCT CASE WHEN re.event_type='referral_view' THEN re.id END) as views,
    (SELECT COUNT(*) FROM referral_leads rl WHERE rl.referral_code = re.referral_code) as leads,
    MAX(re.created_at) as last_activity
    FROM referral_events re WHERE re.referral_code IS NOT NULL AND re.created_at >= ${since}
    GROUP BY re.referral_code ORDER BY views DESC LIMIT 10`;

  // Enrich with partner names
  const enrichedReferrers = [];
  for (const r of topReferrers) {
    const partner = await sql`SELECT name, email, phone FROM referral_partners WHERE referral_code = ${r.referral_code}`;
    enrichedReferrers.push({
      ...r, views: Number(r.views), leads: Number(r.leads),
      partner_name: partner[0]?.name || 'Não registado',
      partner_email: partner[0]?.email || '',
      partner_phone: partner[0]?.phone || '',
    });
  }

  // All registered partners
  const allPartners = await sql`SELECT id, name, email, phone, referral_code, created_at FROM referral_partners ORDER BY created_at DESC`;

  const topVehicles = await sql`SELECT vehicle_title, vehicle_price, COUNT(*) as shares,
    (SELECT COUNT(*) FROM referral_leads rl WHERE rl.vehicle_title = re.vehicle_title) as leads
    FROM referral_events re WHERE re.event_type = 'share' AND re.vehicle_title IS NOT NULL AND re.vehicle_title != '' AND re.created_at >= ${since}
    GROUP BY re.vehicle_title, re.vehicle_price ORDER BY shares DESC LIMIT 10`;

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
      registered_partners: allPartners.length,
    },
    dailyActivity,
    topReferrers: enrichedReferrers,
    partners: allPartners.map(p => ({
      id: p.id, name: p.name, email: p.email, phone: p.phone,
      referral_code: p.referral_code, created_at: p.created_at,
    })),
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
