const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const { vehicleTitle, vehiclePrice, vehicleUrl, imageUrl, referralCode, myReferralCode, customerName, customerEmail, customerPhone } = req.body;

    if (!vehicleTitle) {
      return res.status(400).json({ error: 'Vehicle information required' });
    }

    const baseUrl = (req.headers['x-forwarded-proto'] || 'https') + '://' + req.headers.host;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'multibanco'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Pré-Reserva de Importação',
            description: vehicleTitle + (vehiclePrice ? ' — ' + Number(vehiclePrice).toLocaleString('pt-PT') + ' €' : ''),
            images: imageUrl ? [imageUrl] : [],
          },
          unit_amount: 25000, // 250.00€ in cents
        },
        quantity: 1,
      }],
      metadata: {
        vehicle_title: vehicleTitle || '',
        vehicle_price: String(vehiclePrice || ''),
        vehicle_url: vehicleUrl || '',
        referral_code: referralCode || '',
        my_referral_code: myReferralCode || '',
        customer_name: customerName || '',
        customer_phone: customerPhone || '',
      },
      customer_email: customerEmail || undefined,
      success_url: baseUrl + '/reserva-confirmada?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: baseUrl + '?url=' + encodeURIComponent(vehicleUrl || '') + (referralCode ? '&ref=' + referralCode : ''),
      locale: 'pt',
      // Allow customer to enter billing address
      billing_address_collection: 'required',
      // Auto-expire after 30 minutes
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    });

    return res.status(200).json({ 
      sessionId: session.id, 
      url: session.url 
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return res.status(500).json({ error: error.message || 'Payment error' });
  }
};
