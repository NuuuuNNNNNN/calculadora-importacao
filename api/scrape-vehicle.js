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
      // Build URL manually to avoid double-encoding issues
      const apiKey = encodeURIComponent(process.env.SCRAPINGBEE_API_KEY);
      const encodedUrl = encodeURIComponent(url);
      const fullUrl = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encodedUrl}&block_resources=false&premium_proxy=true`;
      console.log('[API] Full URL (last 100 chars):', fullUrl.substring(fullUrl.length - 100));

      const response = await fetch(fullUrl, {
        timeout: 50000 // 50 second timeout
      });
      
      const text = await response.text();
      
      console.log('[API] ScrapingBee response status:', response.status);
      console.log('[API] ScrapingBee response length:', text.length);
      
      // Check if we hit the monthly limit
      if (text.includes('Monthly API calls limit reached')) {
        console.log('[API] ScrapingBee limit reached, using fallback...');
        throw new Error('API_LIMIT_REACHED');
      }
      
      if (!response.ok) {
        // Return error details
        return res.status(200).json({
          error: 'Failed to scrape',
          message: `ScrapingBee HTTP ${response.status}`,
          debug: {
            responseLength: text.length,
            responseStart: text.substring(0, 200)
          }
        });
      }
      
      html = text;
      usedScrapingBee = true;
      console.log('[API] ScrapingBee success, HTML length:', html.length);
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
    registrationMonth: null,
    transmission: null,
    fuelType: null,
    power: null,
    displacement: null,
    co2: null,
    image: null,
    sellerCountry: null,
    vatDeductible: null
  };

  try {
    // Title from page title tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      data.title = titleMatch[1]
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s*für\s*[\d.,\s]+€.*/, '')
        .replace(/\s*-\s*mobile\.de.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
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

    // Year + Month: look for MM/YYYY format (e.g., "09/2020")
    let yearMatch = html.match(/"firstRegistration"[^}]*"value":"(\d{2})\/(\d{4})/);
    if (yearMatch && yearMatch[1] && yearMatch[2]) {
      data.registrationMonth = parseInt(yearMatch[1]);
      const year = parseInt(yearMatch[2]);
      if (year >= 1990 && year <= 2030) {
        data.year = year;
      }
    }
    
    // Fallback: generic MM/YYYY search
    if (!data.year) {
      yearMatch = html.match(/(\d{2})\/(\d{4})/);
      if (yearMatch && yearMatch[2]) {
        data.registrationMonth = parseInt(yearMatch[1]);
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

    // Fuel type with Plug-In Hybrid detection
    if (html.includes('"tag":"fuel"')) {
      const fuelMatch = html.match(/"tag":"fuel"[^}]*"value":"([^"]+)"/);
      if (fuelMatch) {
        const fuelStr = fuelMatch[1];
        if (fuelStr.includes('Diesel')) data.fuelType = 'Diesel';
        else if (fuelStr.includes('Plug-In') || fuelStr.includes('PlugIn')) data.fuelType = 'PlugIn Hybrid';
        else if (fuelStr.includes('Hybrid') || fuelStr.includes('Elektro/Benzin') || fuelStr.includes('Benzin/Elektro')) {
          data.fuelType = 'Hybrid';
        }
        else if (fuelStr.includes('Elektro') || fuelStr.includes('Electric')) data.fuelType = 'Electric';
        else if (fuelStr.includes('Benzin') || fuelStr.includes('Petrol')) data.fuelType = 'Petrol';
        else if (fuelStr.includes('Erdgas') || fuelStr.includes('CNG')) data.fuelType = 'CNG';
        else if (fuelStr.includes('Autogas') || fuelStr.includes('LPG')) data.fuelType = 'LPG';
      }
    }
    if (!data.fuelType) {
      if (html.includes('Diesel')) data.fuelType = 'Diesel';
      else if (html.includes('Plug-In') && html.includes('Hybrid')) data.fuelType = 'PlugIn Hybrid';
      else if (html.includes('Hybrid')) data.fuelType = 'Hybrid';
      else if (html.includes('Elektro')) data.fuelType = 'Electric';
      else if (html.includes('Benzin')) data.fuelType = 'Petrol';
    }

    // Enhanced Plug-In Hybrid detection: check title and HTML for plug-in indicators
    if (data.fuelType === 'Hybrid') {
      const plugInPatterns = [
        /Plug-?In/i,
        /PHEV/i,
        /\be-?Hybrid\b/i,
        /"plugIn"\s*:\s*true/i,
        /"isPlugIn"\s*:\s*true/i,
        /Plug-In-Hybrid/i
      ];
      const isPlugIn = plugInPatterns.some(p => p.test(html));
      if (isPlugIn) {
        data.fuelType = 'PlugIn Hybrid';
        console.log('[API] Detected Plug-In Hybrid from HTML patterns');
      }
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

    // Displacement (Hubraum/cubic capacity)
    const dispMatch = html.match(/"tag":"cubicCapacity"[^}]*"value":"([\d.,]+)/);
    if (dispMatch) {
      data.displacement = parseInt(dispMatch[1].replace(/\./g, '').replace(',', ''));
    }
    if (!data.displacement) {
      // Try "Hubraum" pattern: "2.979 cm³" or "2979 ccm"
      const dispMatch2 = html.match(/([\d.,]+)\s*(?:cm³|ccm)/i);
      if (dispMatch2) {
        data.displacement = parseInt(dispMatch2[1].replace(/\./g, '').replace(',', ''));
      }
    }
    if (!data.displacement) {
      // Try generic pattern in JSON: "cubicCapacity":2979
      const dispMatch3 = html.match(/"cubicCapacity"[:\s]*(\d+)/);
      if (dispMatch3) {
        data.displacement = parseInt(dispMatch3[1]);
      }
    }

    // CO2
    const co2Match = html.match(/"tag":"envkv\.co2Emissions"[^}]*"value":"([\d]+)\s*g/);
    if (co2Match) {
      data.co2 = parseInt(co2Match[1]);
    }

    // Seller country detection
    const countryMatch = html.match(/"sellerAddress"[^}]*"countryCode"\s*:\s*"([^"]+)"/);
    if (countryMatch) {
      data.sellerCountry = countryMatch[1].toUpperCase();
    }
    if (!data.sellerCountry) {
      // Try other patterns for country
      const countryMatch2 = html.match(/"country"\s*:\s*"([A-Z]{2})"/);
      if (countryMatch2) data.sellerCountry = countryMatch2[1];
    }
    if (!data.sellerCountry) {
      // Try location-based detection
      const locationMatch = html.match(/"location"[^}]*"country(?:Code)?"\s*:\s*"([^"]+)"/);
      if (locationMatch) data.sellerCountry = locationMatch[1].toUpperCase();
    }
    if (!data.sellerCountry) {
      // Default for mobile.de: most sellers are in Germany
      if (html.includes('mobile.de')) data.sellerCountry = 'DE';
    }

    // VAT (MwSt.) deductibility detection
    if (html.includes('MwSt. ausweisbar') || html.includes('mwst_ausweisbar') || html.includes('MwSt ausweisbar')) {
      data.vatDeductible = true;
    } else if (html.includes('differenzbesteuert') || html.includes('Differenzbesteuert')) {
      data.vatDeductible = false; // Margin scheme - no VAT to reclaim
    } else if (html.match(/"vatType"\s*:\s*"[^"]*regular/i)) {
      data.vatDeductible = true;
    } else if (html.match(/"vatType"\s*:\s*"[^"]*margin/i)) {
      data.vatDeductible = false;
    }
    // Also check for gross/net price indicators
    if (data.vatDeductible === null) {
      if (html.includes('Netto') || html.includes('"netAmount"')) {
        data.vatDeductible = true;
      }
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
