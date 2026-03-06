module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, email, phone, vehicle, price, url, timestamp, referralCode, myReferralCode, referredBy, import_cost } = req.body;

    // ANTI-EXPLOIT: Block self-referral at backend level
    if (referralCode && myReferralCode && referralCode === myReferralCode) {
      console.log('=== SELF-REFERRAL BLOCKED ===');
      console.log(`Code: ${referralCode}, IP: ${req.headers['x-forwarded-for'] || 'unknown'}`);
      return res.status(400).json({ error: 'self_referral', message: 'Auto-referência não permitida' });
    }

    // Log the lead
    console.log('=== NEW LEAD ===');
    console.log(JSON.stringify({ name, email, phone, vehicle, price, url, timestamp, referralCode, myReferralCode, referredBy, import_cost }, null, 2));
    if (referralCode) console.log('REFERRAL: ' + referralCode + ' | Own code: ' + (myReferralCode || 'none') + ' | Chain: ' + (referredBy || 'direct'));
    console.log('================');

    // Also send to referral-track API for database storage
    try {
      const trackUrl = (req.headers['x-forwarded-proto'] || 'https') + '://' + req.headers.host + '/api/referral-track';
      await fetch(trackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'lead',
          name, email, phone,
          referral_code: referralCode || null,
          my_referral_code: myReferralCode || '',
          referred_by: referredBy || '',
          vehicle_url: url || '',
          vehicle_title: vehicle || '',
          vehicle_price: price || 0,
          import_cost: import_cost || 0
        })
      });
    } catch (trackErr) {
      console.log('Track relay failed (non-blocking):', trackErr.message);
    }

    return res.status(200).json({ success: true, message: 'Lead captured' });
  } catch (error) {
    console.error('Lead capture error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
