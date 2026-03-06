const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).json({ error: 'session_id required' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    return res.json({
      status: session.payment_status,
      customer_name: session.customer_details?.name || '',
      customer_email: session.customer_details?.email || '',
      vehicle_title: session.metadata?.vehicle_title || '',
      vehicle_price: session.metadata?.vehicle_price || '',
      referral_code: session.metadata?.referral_code || '',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to retrieve session' });
  }
};
