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
      
      console.log('=== 🎉 RESERVA CONFIRMADA ===');
      console.log('Cliente:', session.customer_details?.name || meta.customer_name);
      console.log('Email:', session.customer_details?.email || '');
      console.log('Telefone:', meta.customer_phone || '');
      console.log('Veículo:', meta.vehicle_title);
      console.log('Preço:', meta.vehicle_price ? meta.vehicle_price + '€' : '');
      console.log('URL:', meta.vehicle_url);
      console.log('Referral:', meta.referral_code || 'Directo');
      console.log('Pagamento: 250€');
      console.log('Stripe Session:', session.id);
      console.log('==============================');

      // Send WhatsApp alert to team
      const customerName = session.customer_details?.name || meta.customer_name || 'Cliente';
      const vehicleTitle = meta.vehicle_title || 'Veículo';
      const vehiclePrice = meta.vehicle_price ? Number(meta.vehicle_price).toLocaleString('pt-PT') + '€' : '';
      const phone = meta.customer_phone || '';
      const email = session.customer_details?.email || '';
      
      const whatsappMsg = encodeURIComponent(
        '🎉 NOVA RESERVA!\n\n' +
        '👤 ' + customerName + '\n' +
        (email ? '📧 ' + email + '\n' : '') +
        (phone ? '📱 ' + phone + '\n' : '') +
        '🚗 ' + vehicleTitle + '\n' +
        (vehiclePrice ? '💰 ' + vehiclePrice + '\n' : '') +
        '✅ Pré-reserva: 250€ paga\n' +
        (meta.referral_code ? '🔗 Referência: ' + meta.referral_code + '\n' : '') +
        '\n' + (meta.vehicle_url || '')
      );
      
      // Log the WhatsApp alert URL (can be used to trigger via automation later)
      console.log('WhatsApp Alert URL: https://wa.me/351935711561?text=' + whatsappMsg);

      // Also save to database as a lead with reservation status
      try {
        const { neon } = require('@neondatabase/serverless');
        if (process.env.POSTGRES_URL) {
          const sql = neon(process.env.POSTGRES_URL);
          await sql`INSERT INTO referral_leads (name, email, phone, referral_code, my_referral_code, referred_by, vehicle_url, vehicle_title, vehicle_price, import_cost, conversion_status, notes)
            VALUES (${customerName}, ${email}, ${phone}, ${meta.referral_code || null}, ${meta.my_referral_code || ''}, ${''}, ${meta.vehicle_url || ''}, ${vehicleTitle}, ${Number(meta.vehicle_price) || 0}, ${0}, ${'reserva'}, ${'Pré-reserva 250€ paga via Stripe. Session: ' + session.id})`;
        }
      } catch (dbErr) {
        console.log('DB save failed (non-blocking):', dbErr.message);
      }
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(400).json({ error: error.message });
  }
};
