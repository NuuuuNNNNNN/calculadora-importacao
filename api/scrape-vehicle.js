export default async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Missing url' });
    }

    console.log('[API] Scraping:', url);

    // Fetch HTML from ScrapingBee with premium proxy
    const params = new URLSearchParams({
      api_key: 'NT61UK632R6F88RCS1YL7SM4L5Y6YWBRITBSU97QS4GDUX16CIOB0ETA1D16ESKO3UQ5ZK4QCUFA0IAL',
      url: url,
      premium_proxy: 'true'
    });

    const response = await fetch('https://app.scrapingbee.com/api/v1/?' + params.toString());
    const html = await response.text();

    console.log('[API] HTML received, length:', html.length);

    // Extract JSON from window.__INITIAL_STATE__
    const startIdx = html.indexOf('window.__INITIAL_STATE__ = {');
    if (startIdx === -1) {
      return res.status(500).json({ error: 'Could not find vehicle data in page' });
    }

    // Find the matching closing brace for the JSON
    let braceCount = 0;
    let endIdx = startIdx + 'window.__INITIAL_STATE__ = '.length;
    let inString = false;
    let escaped = false;

    for (let i = endIdx; i < html.length && i < endIdx + 500000; i++) {
      const char = html[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        escaped = true;
        continue;
      }
      
      if (char === '"' && !escaped) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIdx = i + 1;
            break;
          }
        }
      }
    }

    const jsonStr = html.substring(startIdx + 'window.__INITIAL_STATE__ = '.length, endIdx);
    
    let initialState;
    try {
      initialState = JSON.parse(jsonStr);
    } catch (e) {
      console.error('[API] JSON parse error:', e.message);
      return res.status(500).json({ error: 'Failed to parse vehicle data JSON', details: e.message });
    }

    // Navigate to vehicle data
    const vehicleData = parseVehicleFromJSON(initialState, url);
    
    console.log('[API] Parsed data:', vehicleData);

    res.status(200).json(vehicleData);

  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to scrape',
      message: error.message 
    });
  }
};

function parseVehicleFromJSON(initialState, url) {
  const data = {
    url: url,
    title: null,
    price: null,
    mileage: null,
    year: null,
    transmission: null,
    fuelType: null,
    power: null,
    co2: null,
    image: null
  };

  try {
    // Navigate through the JSON structure
    // The vehicle data is in: search.vip.ads[adId].data.ad
    const vipAds = initialState?.search?.vip?.ads;
    if (!vipAds) return data;

    // Get the first (and usually only) ad
    const adData = Object.values(vipAds)[0]?.data?.ad;
    if (!adData) return data;

    console.log('[API] Found ad data');

    // Extract basic info
    data.title = adData.shortTitle || null;
    if (adData.subTitle) {
      data.title = (data.title + ' ' + adData.subTitle).trim();
    }

    // Price
    if (adData.price?.grossAmount) {
      data.price = adData.price.grossAmount;
    }

    // Find mileage, year, transmission, fuel in attributes array
    if (Array.isArray(adData.attributes)) {
      for (const attr of adData.attributes) {
        switch(attr.tag) {
          case 'mileage':
            const mileageStr = attr.value?.replace(/[^\d]/g, '');
            if (mileageStr) data.mileage = parseInt(mileageStr);
            break;
          case 'firstRegistration':
            const yearMatch = attr.value?.match(/(\d{4})/);
            if (yearMatch) data.year = parseInt(yearMatch[1]);
            break;
          case 'transmission':
            data.transmission = attr.value?.includes('Automatik') ? 'Automatic' : 'Manual';
            break;
          case 'fuel':
            const fuelValue = attr.value || '';
            if (fuelValue.includes('Diesel')) data.fuelType = 'Diesel';
            else if (fuelValue.includes('Hybrid')) data.fuelType = 'Hybrid';
            else if (fuelValue.includes('Elektro')) data.fuelType = 'Electric';
            else if (fuelValue.includes('Benzin')) data.fuelType = 'Petrol';
            break;
          case 'power':
            const powerStr = attr.value?.match(/([\d]+)\s*kW/);
            if (powerStr) data.power = parseInt(powerStr[1]);
            break;
          case 'envkv.co2Emissions':
            const co2Str = attr.value?.match(/([\d]+)\s*g/);
            if (co2Str) data.co2 = parseInt(co2Str[1]);
            break;
        }
      }
    }

    // Image
    if (adData.ogImage?.src) {
      data.image = adData.ogImage.src;
    } else if (Array.isArray(adData.galleryImages) && adData.galleryImages.length > 0) {
      data.image = adData.galleryImages[0].src;
    }

  } catch (parseError) {
    console.error('[API] Parse error:', parseError.message);
  }

  return data;
}
