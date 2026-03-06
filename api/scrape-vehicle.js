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

    // Try ScrapingBee with automatic retry (premium_proxy required for mobile.de)
    let html = null;
    let usedScrapingBee = false;
    
    const apiKey = encodeURIComponent(process.env.SCRAPINGBEE_API_KEY);
    const encodedUrl = encodeURIComponent(url);
    
    // Retry configurations - try different params on each attempt
    const retryConfigs = [
      { params: 'block_resources=false&premium_proxy=true&wait=5000&timeout=30000', label: 'premium+wait5s' },
      { params: 'block_resources=false&premium_proxy=true&wait=8000&timeout=45000', label: 'premium+wait8s' },
      { params: 'block_resources=false&premium_proxy=true&country_code=de&wait=5000&timeout=30000', label: 'premium+DE' },
    ];
    
    let lastError = null;
    
    for (let i = 0; i < retryConfigs.length; i++) {
      const config = retryConfigs[i];
      try {
        console.log(`[API] ScrapingBee attempt ${i+1}/${retryConfigs.length} (${config.label})...`);
        const fullUrl = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encodedUrl}&${config.params}`;

        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 55000);
        
        const response = await fetch(fullUrl, { signal: controller.signal });
        clearTimeout(fetchTimeout);
        
        const text = await response.text();
        
        console.log(`[API] Attempt ${i+1} status: ${response.status}, length: ${text.length}`);
        
        // Check if we hit the monthly limit
        if (text.includes('Monthly API calls limit reached')) {
          console.log('[API] ScrapingBee limit reached');
          lastError = new Error('API_LIMIT_REACHED');
          break; // No point retrying
        }
        
        if (response.ok && text.length > 5000) {
          html = text;
          usedScrapingBee = true;
          console.log(`[API] ScrapingBee success on attempt ${i+1}, HTML length: ${html.length}`);
          break;
        }
        
        // Non-OK or too small response - log and retry
        lastError = new Error(`HTTP ${response.status}, ${text.length} bytes`);
        console.log(`[API] Attempt ${i+1} failed: ${lastError.message}`);
        
        // Wait before retry (increasing delay)
        if (i < retryConfigs.length - 1) {
          const delay = (i + 1) * 3000;
          console.log(`[API] Waiting ${delay}ms before retry...`);
          await new Promise(r => setTimeout(r, delay));
        }
      } catch (attemptError) {
        lastError = attemptError;
        console.log(`[API] Attempt ${i+1} error: ${attemptError.message}`);
        if (i < retryConfigs.length - 1) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }
    
    if (!html && lastError) {
      console.log('[API] All ScrapingBee attempts failed:', lastError.message);
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
    galleryImages: [],
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

    // Extract brand and model from title or JSON
    const brandMatch = html.match(/"make"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    const modelMatch = html.match(/"model"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    if (brandMatch) data.brand = brandMatch[1];
    if (modelMatch) data.model = modelMatch[1];
    
    // Fallback: extract from title
    if (!data.brand && data.title) {
      const titleParts = data.title.split(' ');
      // Common multi-word brands
      const multiBrands = ['Mercedes-Benz', 'Alfa Romeo', 'Aston Martin', 'Land Rover', 'Range Rover'];
      const twoWord = titleParts.slice(0, 2).join(' ');
      if (multiBrands.some(b => twoWord.toLowerCase().startsWith(b.toLowerCase()))) {
        data.brand = twoWord;
        data.model = titleParts.slice(2, 4).join(' ');
      } else {
        data.brand = titleParts[0];
        data.model = titleParts.slice(1, 3).join(' ');
      }
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
        // Check Plug-In first (before generic Hybrid/Diesel)
        if (fuelStr.includes('Plug-In') || fuelStr.includes('PlugIn')) data.fuelType = 'PlugIn Hybrid';
        // Check pure Electric before hybrid combos (Elektro alone, not Elektro/Benzin)
        else if ((fuelStr === 'Elektro' || fuelStr === 'Electric') || 
                 (fuelStr.includes('Elektro') && !fuelStr.includes('Benzin') && !fuelStr.includes('Diesel'))) {
          data.fuelType = 'Electric';
        }
        // Hybrid combos
        else if (fuelStr.includes('Hybrid') || fuelStr.includes('Elektro/Benzin') || fuelStr.includes('Benzin/Elektro') ||
                 fuelStr.includes('Elektro/Diesel') || fuelStr.includes('Diesel/Elektro')) {
          data.fuelType = 'Hybrid';
        }
        else if (fuelStr.includes('Diesel')) data.fuelType = 'Diesel';
        else if (fuelStr.includes('Benzin') || fuelStr.includes('Petrol')) data.fuelType = 'Petrol';
        else if (fuelStr.includes('Erdgas') || fuelStr.includes('CNG')) data.fuelType = 'CNG';
        else if (fuelStr.includes('Autogas') || fuelStr.includes('LPG')) data.fuelType = 'LPG';
      }
    }
    if (!data.fuelType) {
      // Check fuel tag more broadly - look in structured data first
      const fuelPatterns = [
        { regex: /Elektrofahrzeug|Elektro\/Elektro|"fuel"[^}]*Elektro(?!\/Benzin|\/Diesel)/i, type: 'Electric' },
        { regex: /Plug-In[- ]?Hybrid|PlugIn[- ]?Hybrid/i, type: 'PlugIn Hybrid' },
        { regex: /Hybrid|Elektro\/Benzin|Benzin\/Elektro|Elektro\/Diesel|Diesel\/Elektro/i, type: 'Hybrid' },
        { regex: /"fuel"[^}]*Diesel|Kraftstoff[^<]*Diesel/i, type: 'Diesel' },
        { regex: /"fuel"[^}]*Benzin|Kraftstoff[^<]*Benzin/i, type: 'Petrol' },
      ];
      for (const p of fuelPatterns) {
        if (p.regex.test(html)) {
          data.fuelType = p.type;
          break;
        }
      }
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

    // Electric vehicle overrides: always 0 displacement and 0 CO2
    if (data.fuelType === 'Electric') {
      data.displacement = 0;
      data.co2 = 0;
      console.log('[API] Electric vehicle detected - setting displacement=0, co2=0');
    }

    // Power: extract PS/cv value (not kW)
    // mobile.de shows "350 kW (476 PS)" - we want the PS value
    // Method 1: Extract PS from JSON tag
    const powerPsMatch = html.match(/"tag":"power"[^}]*"value":"[\d]+\s*kW\s*\(([\d]+)\s*PS\)/);
    if (powerPsMatch) {
      data.power = parseInt(powerPsMatch[1]);
    }
    // Method 2: Extract PS from general pattern "XXX kW (YYY PS)"
    if (!data.power) {
      const psBracketMatch = html.match(/([\d]+)\s*kW\s*\(([\d]+)\s*(?:PS|hp|CV|cv)\)/);
      if (psBracketMatch) {
        data.power = parseInt(psBracketMatch[2]); // Get the PS number, not kW
      }
    }
    // Method 3: If only kW found, convert to cv (1 kW = 1.35962 cv)
    if (!data.power) {
      const kwOnlyMatch = html.match(/"tag":"power"[^}]*"value":"([\d]+)\s*kW/);
      if (kwOnlyMatch) {
        data.power = Math.round(parseInt(kwOnlyMatch[1]) * 1.36);
      }
    }
    if (!data.power) {
      const kwMatch2 = html.match(/([\d]+)\s*kW/);
      if (kwMatch2) data.power = Math.round(parseInt(kwMatch2[1]) * 1.36);
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

    // VAT (MwSt.) deductibility detection - MUST use ad-specific data, NOT page filter config
    // The page contains "Mwst. ausweisbar" in the search filter config which is NOT ad-specific!
    // Method 1: Check GPT targeting "vat" field (most reliable) - "vat":"1" = deductible, "vat":"0" = not
    const vatTargetMatch = html.match(/"vat"\s*:\s*"(\d)"/);
    if (vatTargetMatch) {
      data.vatDeductible = vatTargetMatch[1] === '1';
    }
    // Method 2: Check price structure in ad JSON - if both gross and net exist, VAT is deductible
    if (data.vatDeductible === null) {
      const priceMatch = html.match(/"price"\s*:\s*\{[^}]*?"type"\s*:\s*"([^"]+)"/);
      if (priceMatch) {
        // FIXED type without net = gross only = no VAT deduction
        // Check if there's a separate net amount
        const hasNetPrice = html.match(/"price"\s*:\s*\{[^}]*?"net/);
        data.vatDeductible = !!hasNetPrice;
      }
    }
    // Method 3: Check ad description for explicit "no tax" language
    if (data.vatDeductible === null || data.vatDeductible === true) {
      const descMatch = html.match(/"htmlDescription"\s*:\s*"([^"]{0,5000})"/);
      if (descMatch) {
        const desc = descMatch[1].toLowerCase();
        if (desc.includes('no tax refund') || desc.includes('keine mwst') || desc.includes('no vat') || desc.includes('margin')) {
          data.vatDeductible = false;
        }
      }
    }
    // Method 4: Check for differenzbesteuert (margin scheme) in ad-specific context
    if (data.vatDeductible === null) {
      // Only check near the ad data, not in filter config
      const adDataMatch = html.match(/"ad"\s*:\s*\{[\s\S]{0,50000}?"price"/);
      if (adDataMatch) {
        const adSection = adDataMatch[0];
        if (adSection.includes('differenzbesteuert') || adSection.includes('Differenzbesteuert')) {
          data.vatDeductible = false;
        }
      }
    }

    // Image: "ogImage":{"src":"https://img.classistatic.de/..."
    const imageMatch = html.match(/"ogImage":\s*{\s*"src":\s*"([^"]+)"/);
    if (imageMatch) {
      data.image = imageMatch[1];
    }

    // Gallery: Extract all thumbnail IDs (mo-80w) from gallery strip - they all load eagerly
    const galleryIds = [];
    const seenIds = new Set();
    const thumbRegex = /https:\/\/img\.classistatic\.de\/api\/v1\/mo-prod\/images\/([a-f0-9]{2}\/[a-f0-9-]+)\?rule=mo-80w/g;
    let thumbMatch;
    while ((thumbMatch = thumbRegex.exec(html)) !== null) {
      const imgId = thumbMatch[1];
      if (!seenIds.has(imgId)) {
        seenIds.add(imgId);
        galleryIds.push(imgId);
      }
    }
    if (galleryIds.length > 0) {
      data.galleryImages = galleryIds.map(id => ({
        thumb: `https://img.classistatic.de/api/v1/mo-prod/images/${id}?rule=mo-80w`,
        medium: `https://img.classistatic.de/api/v1/mo-prod/images/${id}?rule=mo-1024`,
        full: `https://img.classistatic.de/api/v1/mo-prod/images/${id}?rule=mo-1600`
      }));
      console.log(`[API] Gallery: ${data.galleryImages.length} images extracted`);
    }

  } catch (parseError) {
    console.error('[API] Parse error:', parseError.message);
  }

  return data;
}
