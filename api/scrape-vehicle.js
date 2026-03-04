let axios;
try {
  axios = require('axios');
} catch (e) {
  console.log('axios not available, using fetch');
}

export default async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Missing url' });
    }

    console.log('[API] Calling ScrapingBee for:', url);

    // Try axios first
    if (axios) {
      console.log('[API] Using axios');
      const response = await axios.get('https://app.scrapingbee.com/api/v1/', {
        params: {
          api_key: 'NT61UK632R6F88RCS1YL7SM4L5Y6YWBRITBSU97QS4GDUX16CIOB0ETA1D16ESKO3UQ5ZK4QCUFA0IAL',
          url: url
        }
      });
      return res.status(200).json({ success: true, data: response.data.substring(0, 200) });
    }

    // Fallback to fetch with premium proxy
    console.log('[API] Using fetch with premium_proxy');
    const params = new URLSearchParams({
      api_key: 'NT61UK632R6F88RCS1YL7SM4L5Y6YWBRITBSU97QS4GDUX16CIOB0ETA1D16ESKO3UQ5ZK4QCUFA0IAL',
      url: url,
      block_resources: 'false',
      premium_proxy: 'true'
    });
    const response = await fetch('https://app.scrapingbee.com/api/v1/?' + params.toString());
    const html = await response.text();
    return res.status(200).json({ success: true, data: html.substring(0, 200) });

  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
