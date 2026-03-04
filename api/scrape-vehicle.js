/**
 * Scrape vehicle data from mobile.de Search-API or AutoScout24 web scraping
 * POST /api/scrape-vehicle
 * Body: { url: "https://..." }
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Determine source
    const isMobileDe = url.includes('mobile.de');
    const isAutoScout = url.includes('autoscout24');

    if (!isMobileDe && !isAutoScout) {
      return res.status(400).json({ 
        error: 'Only mobile.de and AutoScout24 URLs are supported' 
      });
    }

    let vehicleData = {};

    if (isMobileDe) {
      vehicleData = await scrapeMobileDeAPI(url);
    } else if (isAutoScout) {
      vehicleData = await scrapeAutoScout24(url);
    }

    // Check if we got any data
    if (!vehicleData || Object.keys(vehicleData).length === 0) {
      return res.status(400).json({ 
        error: 'Could not extract vehicle data from URL' 
      });
    }

    return res.status(200).json({
      success: true,
      source: isMobileDe ? 'mobile.de' : 'autoscout24',
      ...vehicleData
    });

  } catch (error) {
    console.error('Scraping error:', error.message);
    return res.status(500).json({
      error: 'Failed to scrape vehicle data',
      message: error.message
    });
  }
};

/**
 * Scrape vehicle data from mobile.de using official Search-API
 * Extracts ad-key from URL and calls the API
 */
async function scrapeMobileDeAPI(url) {
  try {
    // Extract ad-key from URL
    // URL format: https://suchen.mobile.de/fahrzeuge/details.html?id=441261931&...
    const urlObj = new URL(url);
    const adKey = urlObj.searchParams.get('id');

    if (!adKey) {
      throw new Error('Could not extract ad-key from mobile.de URL');
    }

    // Call mobile.de Search-API
    // API docs: https://services.mobile.de/docs/search-api.html
    const apiUrl = `https://services.mobile.de/search-api/ad/${adKey}`;
    
    // Use environment variables for credentials (safer than hardcoding)
    const username = process.env.MOBILE_DE_USERNAME || 'npereira@theselection.pt';
    const password = process.env.MOBILE_DE_PASSWORD || 'Nunoandre18';
    
    // Create Basic Auth header
    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'User-Agent': 'TheSelectionCalculator/1.0'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Mobile.de API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Parse the API response
    const ad = data.ad || data;
    const vehicleData = {};

    // Extract basic info
    if (ad.title) vehicleData.title = ad.title;
    if (ad.make) vehicleData.brand = ad.make;
    if (ad.model) vehicleData.model = ad.model;
    
    // Year and registration
    if (ad.firstRegistration) {
      const year = parseInt(ad.firstRegistration.substring(0, 4));
      vehicleData.registrationYear = year;
      const month = parseInt(ad.firstRegistration.substring(5, 7));
      if (month >= 1 && month <= 12) vehicleData.registrationMonth = month;
    }

    // Price
    if (ad.price && ad.price.value) {
      vehicleData.price = ad.price.value;
    }

    // Mileage
    if (ad.mileage) vehicleData.mileage = ad.mileage;

    // Fuel type
    if (ad.fuelType) {
      const fuel = ad.fuelType.toLowerCase();
      if (fuel.includes('diesel')) vehicleData.fuelType = 'diesel';
      else if (fuel.includes('benz') || fuel.includes('petrol') || fuel.includes('gasoline')) vehicleData.fuelType = 'gasolina';
      else if (fuel.includes('hybrid')) vehicleData.fuelType = 'hibrido';
      else if (fuel.includes('elekt') || fuel.includes('electric')) vehicleData.fuelType = 'eletrico';
    }

    // Power (kW)
    if (ad.power) vehicleData.power = ad.power;

    // Displacement
    if (ad.engineCapacity) vehicleData.displacement = ad.engineCapacity;

    // CO2 emissions - try different paths in API response
    if (ad.co2) {
      vehicleData.co2 = ad.co2;
    } else if (ad.emissions && ad.emissions.co2) {
      vehicleData.co2 = ad.emissions.co2;
    } else if (ad.wltpValues && ad.wltpValues.co2) {
      vehicleData.co2 = ad.wltpValues.co2;
    }

    // Gearbox
    if (ad.gearbox) {
      const gearbox = ad.gearbox.toLowerCase();
      vehicleData.gearbox = gearbox.includes('auto') ? 'Automática' : 'Manual';
    }

    // Images - try different API response structures
    const images = [];
    if (ad.images && Array.isArray(ad.images)) {
      for (const img of ad.images) {
        if (img.url && !images.includes(img.url)) {
          images.push(img.url);
        } else if (typeof img === 'string' && !images.includes(img)) {
          images.push(img);
        }
      }
    }
    if (images.length > 0) vehicleData.images = images.slice(0, 5);

    return vehicleData;

  } catch (error) {
    console.error('Mobile.de API error:', error.message);
    // Fallback to web scraping if API fails
    console.log('Falling back to web scraping...');
    return await scrapeMobileDeHTML(url);
  }
}

/**
 * Fallback: Scrape mobile.de HTML page (for when API fails)
 */
async function scrapeMobileDeHTML(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.google.com/'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const html = await response.text();
    const data = {};

    // Title/Brand/Model
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (titleMatch) {
      const titleText = titleMatch[1].trim();
      const parts = titleText.split(/\s+/);
      data.brand = parts[0] || '';
      data.model = parts.slice(1).join(' ') || '';
      data.title = titleText;
    }

    // Year
    const monthYearMatch = html.match(/(\d{1,2})\/(\d{4})/);
    if (monthYearMatch) {
      const month = parseInt(monthYearMatch[1]);
      const year = parseInt(monthYearMatch[2]);
      if (month >= 1 && month <= 12) {
        data.registrationMonth = month;
        data.registrationYear = year;
      }
    } else {
      const yearMatch = html.match(/(\d{4})/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1]);
        if (year >= 1900 && year <= new Date().getFullYear()) {
          data.registrationYear = year;
        }
      }
    }

    // Price
    const priceMatch = html.match(/([0-9]{2,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)(?:\s*)€/);
    if (priceMatch) {
      const priceStr = priceMatch[1];
      const cleaned = priceStr.replace(/\./g, '').replace(',', '.');
      const price = parseFloat(cleaned);
      if (!isNaN(price) && price > 100) {
        data.price = price;
      }
    }

    // Mileage
    const mileageMatch = html.match(/([0-9.,]+)\s*(?:km|KM)/);
    if (mileageMatch) {
      const mileageStr = mileageMatch[1];
      const cleaned = mileageStr.replace(/\./g, '').replace(',', '');
      const mileage = parseInt(cleaned);
      if (!isNaN(mileage)) {
        data.mileage = mileage;
      }
    }

    // Fuel type
    const fuelMatch = html.match(/(Diesel|Benzin|Hybrid|Electric|Elektro)/i);
    if (fuelMatch) {
      const fuel = fuelMatch[1].toLowerCase();
      if (fuel === 'diesel') data.fuelType = 'diesel';
      else if (fuel === 'benzin') data.fuelType = 'gasolina';
      else if (fuel === 'hybrid') data.fuelType = 'hibrido';
      else if (fuel === 'elektro' || fuel === 'electric') data.fuelType = 'eletrico';
    }

    // Power
    const powerMatch = html.match(/(\d{2,3})\s*(?:kW|PS)/i);
    if (powerMatch) {
      data.power = parseInt(powerMatch[1]);
    }

    // Displacement
    const displacementMatch = html.match(/(\d{3,4})\s*(?:ccm?|cm³)/i);
    if (displacementMatch) {
      data.displacement = parseInt(displacementMatch[1]);
    }

    // CO2
    const co2Match = html.match(/(\d+)\s*(?:g\/km|g\/km CO2)/i);
    if (co2Match) {
      const co2 = parseInt(co2Match[1]);
      if (co2 > 0 && co2 < 400) {
        data.co2 = co2;
      }
    }

    // Gearbox
    const gearboxMatch = html.match(/(Automatik|Manuell|Automatic|Manual)/i);
    if (gearboxMatch) {
      const gearbox = gearboxMatch[1].toLowerCase();
      data.gearbox = gearbox.includes('auto') ? 'Automática' : 'Manual';
    }

    // Images
    const imageMatches = html.match(/<img[^>]*src=["']([^"']*mobile[^"']*)["']/gi) || [];
    const images = [];
    for (const imgMatch of imageMatches) {
      const srcMatch = imgMatch.match(/src=["']([^"']*)["']/i);
      if (srcMatch) {
        let src = srcMatch[1];
        src = src.replace(/mo-\d+/, 'mo-1600');
        if (!images.includes(src)) {
          images.push(src);
        }
      }
    }
    if (images.length > 0) data.images = images.slice(0, 5);

    return data;

  } catch (error) {
    console.error('Mobile.de HTML scraping fallback error:', error.message);
    throw error;
  }
}

/**
 * Scrape vehicle data from AutoScout24
 */
async function scrapeAutoScout24(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.google.com/'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch AutoScout24: ${response.status}`);
    }

    const html = await response.text();
    const data = {};

    // Title
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      const titleText = titleMatch[1].trim();
      const parts = titleText.split(/\s+/).filter(p => p.length > 0);
      data.brand = parts[0] || '';
      data.model = parts.slice(1).join(' ') || '';
      data.title = titleText;
    }

    // Year
    const yearMatch = html.match(/(\d{4})/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      if (year >= 1900 && year <= new Date().getFullYear()) {
        data.registrationYear = year;
      }
    }

    // Price
    const priceMatch = html.match(/([0-9]{2,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)(?:\s*)€/) ||
                       html.match(/price["\']?\s*:\s*["\']?([0-9.,]+)["\']?/i);
    if (priceMatch) {
      const priceStr = priceMatch[1];
      const cleaned = priceStr.replace(/\./g, '').replace(',', '.');
      const price = parseFloat(cleaned);
      if (!isNaN(price) && price > 100) {
        data.price = price;
      }
    }

    // Mileage
    const mileageMatch = html.match(/([0-9.,]+)\s*(?:km|KM)/);
    if (mileageMatch) {
      const mileageStr = mileageMatch[1];
      const cleaned = mileageStr.replace(/\./g, '').replace(',', '');
      const mileage = parseInt(cleaned);
      if (!isNaN(mileage)) {
        data.mileage = mileage;
      }
    }

    // Fuel type
    const fuelMatch = html.match(/(Diesel|Benzin|Hybrid|Electric|Elektro|Petrol|Gasoline)/i);
    if (fuelMatch) {
      const fuel = fuelMatch[1].toLowerCase();
      if (fuel === 'diesel') data.fuelType = 'diesel';
      else if (fuel === 'benzin' || fuel === 'petrol' || fuel === 'gasoline') data.fuelType = 'gasolina';
      else if (fuel === 'hybrid') data.fuelType = 'hibrido';
      else if (fuel === 'elektro' || fuel === 'electric') data.fuelType = 'eletrico';
    }

    // Power
    const powerMatch = html.match(/(\d{2,3})\s*(?:kW|PS)/i);
    if (powerMatch) {
      data.power = parseInt(powerMatch[1]);
    }

    // Displacement
    const displacementMatch = html.match(/(\d{3,4})\s*(?:ccm?|cm³)/i);
    if (displacementMatch) {
      data.displacement = parseInt(displacementMatch[1]);
    }

    // CO2
    const co2Match = html.match(/(\d+)\s*(?:g\/km|g\/km CO2)/i);
    if (co2Match) {
      const co2 = parseInt(co2Match[1]);
      if (co2 > 0 && co2 < 400) {
        data.co2 = co2;
      }
    }

    // Gearbox
    const gearboxMatch = html.match(/(Automatik|Manuell|Automatic|Manual)/i);
    if (gearboxMatch) {
      const gearbox = gearboxMatch[1].toLowerCase();
      data.gearbox = gearbox.includes('auto') ? 'Automática' : 'Manual';
    }

    // Images
    const imageMatches = html.match(/<img[^>]*src=["']([^"']*(?:jpg|jpeg|png))["']/gi) || [];
    const images = [];
    for (const imgMatch of imageMatches) {
      const srcMatch = imgMatch.match(/src=["']([^"']*)["']/i);
      if (srcMatch) {
        const src = srcMatch[1];
        if (!images.includes(src) && !src.includes('logo') && !src.includes('icon')) {
          images.push(src);
        }
      }
    }
    if (images.length > 0) data.images = images.slice(0, 5);

    return data;

  } catch (error) {
    console.error('AutoScout24 scraping error:', error.message);
    throw error;
  }
}
