export default async function handler(req, res) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing url in request body' });
  }

  // Check API key (with fallback)
  const apiKey = process.env.SCRAPINGBEE_API_KEY || 'NT61UK632R6F88RCS1YL7SM4L5Y6YWBRITBSU97QS4GDUX16CIOB0ETA1D16ESKO3UQ5ZK4QCUFA0IAL';
  if (!apiKey) {
    console.error('SCRAPINGBEE_API_KEY not configured');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'ScrapingBee API key not configured'
    });
  }

  console.log('[API] URL received:', url);
  console.log('[API] API Key configured:', apiKey.substring(0, 10) + '...');

  try {
    // Extract ad key from URL
    const urlObj = new URL(url);
    const adKey = urlObj.searchParams.get('id');
    
    if (!adKey) {
      return res.status(400).json({ error: 'Invalid mobile.de URL - no id parameter' });
    }

    const listingUrl = `https://suchen.mobile.de/fahrzeuge/details.html?id=${adKey}`;
    console.log('[API] Scraping URL:', listingUrl);

    // Call ScrapingBee API
    const scrapingBeeUrl = 'https://api.scrapingbee.com/api/v1/';
    
    const params = new URLSearchParams({
      api_key: apiKey,
      url: listingUrl,
      render_javascript: 'true',
      timeout: '30000',
      premium_proxy: 'true'
    });

    console.log('[API] Calling ScrapingBee...');
    const response = await fetch(scrapingBeeUrl + '?' + params.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = await response.text();
    console.log('[API] ScrapingBee response status:', response.status);
    console.log('[API] HTML length:', html.length);

    if (!response.ok) {
      console.error('[API] ScrapingBee error:', html.substring(0, 500));
      return res.status(response.status).json({
        error: 'Failed to scrape from ScrapingBee',
        message: html.substring(0, 200),
        status: response.status
      });
    }

    // Parse vehicle data from HTML
    const vehicleData = parseVehicleData(html, adKey);
    
    return res.status(200).json({
      success: true,
      data: vehicleData,
      debug: {
        htmlLength: html.length,
        adKey: adKey
      }
    });
  } catch (error) {
    console.error('[API] Error:', error.message);
    return res.status(500).json({
      error: 'Failed to scrape vehicle data',
      message: error.message
    });
  }
}

function parseVehicleData(html, adKey) {
  const data = {
    adKey: adKey,
    brand: null,
    model: null,
    year: null,
    price: null,
    mileage: null,
    fuelType: null,
    co2Emissions: null,
    transmission: null,
    power: null,
    images: []
  };

  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1];
    console.log('[Parser] Title:', title);
  }

  // Extract price
  const priceMatch = html.match(/€\s*([\d.,]+)/);
  if (priceMatch) {
    const priceStr = priceMatch[1].replace(/\./g, '').replace(',', '');
    data.price = parseInt(priceStr);
    console.log('[Parser] Price:', data.price);
  }

  // Extract mileage
  const mileageMatch = html.match(/(\d+[\s.]?\d*)\s*km/i);
  if (mileageMatch) {
    data.mileage = parseInt(mileageMatch[1].replace(/\s|\./, ''));
    console.log('[Parser] Mileage:', data.mileage);
  }

  // Extract fuel type
  if (html.match(/Diesel|diesel/i)) {
    data.fuelType = 'Diesel';
  } else if (html.match(/Benzin|Petrol|gasoline/i)) {
    data.fuelType = 'Gasoline';
  }

  // Extract CO2
  const co2Match = html.match(/(\d+)\s*g\/km|CO2.*?(\d+)\s*g/i);
  if (co2Match) {
    data.co2Emissions = parseInt(co2Match[1] || co2Match[2]);
  }

  // Default CO2 if not found
  if (!data.co2Emissions) {
    data.co2Emissions = 140;
  }

  // Extract images
  const imgMatches = html.match(/src="([^"]*\.jpg)"/gi) || [];
  data.images = imgMatches.slice(0, 5).map(m => m.replace(/src="|"/g, ''));

  return data;
}
