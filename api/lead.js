module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, email, phone, vehicle, price, url, timestamp, referralCode } = req.body;

    // Log the lead (visible in Vercel Function Logs)
    console.log('=== NEW LEAD ===');
    console.log(JSON.stringify({ name, email, phone, vehicle, price, url, timestamp, referralCode }, null, 2));
    if (referralCode) console.log('REFERRAL: ' + referralCode);
    console.log('================');

    return res.status(200).json({ success: true, message: 'Lead captured' });
  } catch (error) {
    console.error('Lead capture error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
