const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    let event;
    
    // Verify webhook signature if secret is configured
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const sig = req.headers['stripe-signature'];
      const rawBody = req.body;
      event = stripe.webhooks.constructEvent(
        typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } else {
      event = req.body;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta = session.metadata || {};
      
      const customerName = session.customer_details?.name || meta.customer_name || 'Cliente';
      const email = session.customer_details?.email || '';
      const phone = meta.customer_phone || '';
      const vehicleTitle = meta.vehicle_title || 'Veículo';
      const vehiclePrice = Number(meta.vehicle_price) || 0;
      const referralCode = meta.referral_code || null;
      
      console.log('=== 🎉 RESERVA CONFIRMADA ===');
      console.log('Cliente:', customerName);
      console.log('Email:', email);
      console.log('Telefone:', phone);
      console.log('Veículo:', vehicleTitle);
      console.log('Preço:', vehiclePrice ? vehiclePrice + '€' : '');
      console.log('URL:', meta.vehicle_url);
      console.log('Referral:', referralCode || 'Directo');
      console.log('Pagamento: 250€');
      console.log('Stripe Session:', session.id);
      console.log('==============================');

      // Calculate import cost (5% of vehicle price, min 1500€, max 30000€)
      const importCost = vehiclePrice > 0 ? Math.max(1500, Math.min(30000, Math.round(vehiclePrice * 0.05))) : 0;
      
      // Calculate cashback (5% of import cost if referred)
      const cashbackAmount = (importCost > 0 && referralCode) ? Math.round(importCost * 0.05) : 0;

      // Save to database as a lead with 'reserva' status
      try {
        const { neon } = require('@neondatabase/serverless');
        if (process.env.POSTGRES_URL) {
          const sql = neon(process.env.POSTGRES_URL);
          
          // Ensure table exists
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
          
          // Check for duplicate (same email + vehicle to avoid double entries)
          const existing = await sql`SELECT id FROM referral_leads 
            WHERE email = ${email} AND vehicle_url = ${meta.vehicle_url || ''} AND conversion_status = 'reserva'`;
          
          if (existing.length === 0) {
            await sql`INSERT INTO referral_leads (name, email, phone, referral_code, vehicle_url, vehicle_title, vehicle_price, import_cost, cashback_amount, conversion_status, notes)
              VALUES (${customerName}, ${email}, ${phone}, ${referralCode}, ${meta.vehicle_url || ''}, ${vehicleTitle}, ${vehiclePrice}, ${importCost}, ${cashbackAmount}, ${'reserva'}, ${'Pré-reserva 250€ paga via Stripe. Session: ' + session.id})`;
            
            console.log('✅ Lead criada na base de dados — Status: reserva, Import Cost:', importCost + '€, Cashback:', cashbackAmount + '€');
          } else {
            console.log('⚠️ Lead já existente para este email + veículo — ignorada');
          }
        }
      } catch (dbErr) {
        console.error('❌ DB save failed:', dbErr.message);
      }

      // Log WhatsApp alert URL for team notification
      const whatsappMsg = encodeURIComponent(
        '🎉 NOVA RESERVA!\n\n' +
        '👤 ' + customerName + '\n' +
        (email ? '📧 ' + email + '\n' : '') +
        (phone ? '📱 ' + phone + '\n' : '') +
        '🚗 ' + vehicleTitle + '\n' +
        (vehiclePrice ? '💰 ' + vehiclePrice.toLocaleString('pt-PT') + '€\n' : '') +
        '✅ Pré-reserva: 250€ paga\n' +
        (referralCode ? '🔗 Referência: ' + referralCode + '\n' : '') +
        (cashbackAmount ? '💸 Cashback parceiro: ' + cashbackAmount + '€\n' : '') +
        '\n' + (meta.vehicle_url || '')
      );
      
      console.log('WhatsApp Alert URL: https://wa.me/351935711561?text=' + whatsappMsg);
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(400).json({ error: error.message });
  }
};
