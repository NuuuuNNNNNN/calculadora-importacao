import axios from 'axios';

export default async function handler(req, res) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing url in request body' });
  }

  console.log('[API] URL received:', url);

  try {
    // Extract ad key from URL
    const urlObj = new URL(url);
    const adKey = urlObj.searchParams.get('id');
    
    if (!adKey) {
      return res.status(400).json({ error: 'Invalid mobile.de URL - no id parameter' });
    }

    // Call ScrapingBee API using axios (as per their documentation)
    const SCRAPINGBEE_API_KEY = 'NT61UK632R6F88RCS1YL7SM4L5Y6YWBRITBSU97QS4GDUX16CIOB0ETA1D16ESKO3UQ5ZK4QCUFA0IAL';
    
    console.log('[API] Calling ScrapingBee with axios...');
    
    const response = await axios.get('https://app.scrapingbee.com/api/v1/', {
      params: {
        api_key: SCRAPINGBEE_API_KEY,
        url: url,
        render_javascript: 'false',
        premium_proxy: 'true'
      }
    });

    console.log('[API] ScrapingBee response received');

    // Parse HTML response
    const html = response.data;
    
    // Extract vehicle data from HTML (simplified parsing)
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const priceMatch = html.match(/€\s*([\d,.]+)/);
    const mileageMatch = html.match(/(\d+)\s*km/i);
    const yearMatch = html.match(/(\d{4})\s*\/\s*(\d{1,2})/);
    
    const vehicleData = {
      title: titleMatch ? titleMatch[1].trim() : 'Unknown Vehicle',
      price: priceMatch ? parseInt(priceMatch[1].replace(/\D/g, '')) : null,
      mileage: mileageMatch ? parseInt(mileageMatch[1]) : null,
      year: yearMatch ? parseInt(yearMatch[1]) : null,
      url: url
    };

    console.log('[API] Vehicle data extracted:', vehicleData);

    res.status(200).json(vehicleData);

  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(500).json({
      error: 'Failed to scrape vehicle data',
      message: error.message
    });
  }
}
