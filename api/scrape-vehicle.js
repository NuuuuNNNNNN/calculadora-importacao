export default async (req, res) => {
  try {
    console.log('[DEBUG] req.body type:', typeof req.body);
    console.log('[DEBUG] req.body:', JSON.stringify(req.body).substring(0, 100));
    console.log('[DEBUG] process.env.SCRAPINGBEE_API_KEY exists:', !!process.env.SCRAPINGBEE_API_KEY);
    console.log('[DEBUG] API key first 20 chars:', process.env.SCRAPINGBEE_API_KEY?.substring(0, 20));
    
    const { url } = req.body || {};
    
    console.log('[DEBUG] Extracted URL:', url);
    
    if (!url) {
      return res.status(400).json({ error: 'Missing url', debug: { bodyType: typeof req.body, bodyKeys: Object.keys(req.body || {}) } });
    }

    console.log('[API] Scraping:', url);

    // Try ScrapingBee first (premium_proxy required for mobile.de)
    let html = null;
    let usedScrapingBee = false;
    
    try {
      console.log('[API] Attempting ScrapingBee...');
      const params = new URLSearchParams({
        api_key: process.env.SCRAPINGBEE_API_KEY,
        url: url,
        render_js: 'true'  // Enable JavaScript rendering
      });

      const response = await fetch('https://app.scrapingbee.com/api/v1/?' + params.toString(), {
        timeout: 50000 // 50 second timeout
      });
      
      const text = await response.text();
      
      // Check if we hit the monthly limit
      if (text.includes('Monthly API calls limit reached')) {
        console.log('[API] ScrapingBee limit reached, using fallback...');
        throw new Error('API_LIMIT_REACHED');
      }
      
      if (!response.ok) {
        throw new Error(`ScrapingBee HTTP ${response.status}`);
      }
      
      html = text;
      usedScrapingBee = true;
      console.log('[API] ScrapingBee success, HTML length:', html.length);
    // DEBUG: Return HTML snippet to see if we're getting data
    if (process.env.DEBUG_MODE) {
      return res.status(200).json({
        debug: 'HTML_SAMPLE',
        htmlLength: html.length,
        htmlSnippet: html.substring(0, 500)
      });
    }
    } catch (sbError) {
      console.log('[API] ScrapingBee failed:', sbError.message);
      console.log('[API] Falling back to direct fetch...');
      
      // Fallback: direct fetch with user-agent
      try {
        const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache'
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const fallbackResponse = await fetch(url, {
          headers,
          signal: controller.signal,
          redirect: 'follow'
        });
        
        clearTimeout(timeout);

        if (!fallbackResponse.ok) {
          throw new Error(`Direct fetch HTTP ${fallbackResponse.status}`);
        }

        html = await fallbackResponse.text();
        console.log('[API] Direct fetch success, HTML length:', html.length);
      } catch (fallbackError) {
        throw new Error(`All methods failed: ${sbError.message}, fallback: ${fallbackError.message}`);
      }
    }

    // Parse vehicle data using regex patterns
    const vehicleData = parseVehicleData(html, url);
    
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

function parseVehicleData(html, url) {
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
    // Title from page title tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      data.title = titleMatch[1].replace(/\s*für\s*[\d.,]+\s*€.*/, '').trim();
    }

    // Price pattern: "73.680 €" or "73680€"
    const priceMatch = html.match(/"grossAmount":\s*(\d+)/);
    if (priceMatch) {
      data.price = parseInt(priceMatch[1]);
    }

    // Mileage: "159.000 km" - looks for grossAmount or mileage value
    const mileageMatch = html.match(/"tag":"mileage","value":"([\d.]+)/);
    if (mileageMatch) {
      data.mileage = parseInt(mileageMatch[1].replace(/\./g, ''));
    }

    // Year: look for MM/YYYY format (e.g., "09/2020")
    let yearMatch = html.match(/"firstRegistration"[^}]*"value":"(\d{2})\/(\d{4})/);
    if (yearMatch && yearMatch[2]) {
      const year = parseInt(yearMatch[2]);
      if (year >= 1990 && year <= 2030) {
        data.year = year;
      }
    }
    
    // Fallback: generic MM/YYYY search
    if (!data.year) {
      yearMatch = html.match(/(\d{2})\/(\d{4})/);
      if (yearMatch && yearMatch[2]) {
        const year = parseInt(yearMatch[2]);
        if (year >= 1990 && year <= 2030) {
          data.year = year;
        }
      }
    }

    // Transmission (look more carefully)
    if (html.includes('"tag":"transmission"')) {
      const transMatch = html.match(/"tag":"transmission"[^}]*"value":"([^"]+)"/);
      if (transMatch) {
        data.transmission = transMatch[1].includes('Automatik') ? 'Automatic' : 'Manual';
      }
    }
    if (!data.transmission) {
      if (html.includes('Automatik')) {
        data.transmission = 'Automatic';
      } else if (html.includes('Schaltgetriebe')) {
        data.transmission = 'Manual';
      }
    }

    // Fuel type
    if (html.includes('"tag":"fuel"')) {
      const fuelMatch = html.match(/"tag":"fuel"[^}]*"value":"([^"]+)"/);
      if (fuelMatch) {
        const fuelStr = fuelMatch[1];
        if (fuelStr.includes('Diesel')) data.fuelType = 'Diesel';
        else if (fuelStr.includes('Hybrid')) data.fuelType = 'Hybrid';
        else if (fuelStr.includes('Elektro')) data.fuelType = 'Electric';
        else if (fuelStr.includes('Benzin')) data.fuelType = 'Petrol';
      }
    }
    if (!data.fuelType) {
      if (html.includes('Diesel')) data.fuelType = 'Diesel';
      else if (html.includes('Hybrid')) data.fuelType = 'Hybrid';
      else if (html.includes('Elektro')) data.fuelType = 'Electric';
      else if (html.includes('Benzin')) data.fuelType = 'Petrol';
    }

    // Power: look for kW value
    const powerMatch = html.match(/"tag":"power"[^}]*"value":"([\d]+)\s*kW/);
    if (powerMatch) {
      data.power = parseInt(powerMatch[1]);
    }
    if (!data.power) {
      const powerMatch2 = html.match(/([\d]+)\s*kW\s*\([^)]+\)/);
      if (powerMatch2) data.power = parseInt(powerMatch2[1]);
    }

    // CO2
    const co2Match = html.match(/"tag":"envkv\.co2Emissions"[^}]*"value":"([\d]+)\s*g/);
    if (co2Match) {
      data.co2 = parseInt(co2Match[1]);
    }

    // Image: "ogImage":{"src":"https://img.classistatic.de/..."
    const imageMatch = html.match(/"ogImage":\s*{\s*"src":\s*"([^"]+)"/);
    if (imageMatch) {
      data.image = imageMatch[1];
    }

  } catch (parseError) {
    console.error('[API] Parse error:', parseError.message);
  }

  return data;
}
