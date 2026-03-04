/**
 * Scrape vehicle data from mobile.de or AutoScout24
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

    // Fetch with proper headers
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',

                      
                      'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
                              'Accept-Encoding': 'gzip, deflate, br',
                                      'Cache-Control': 'no-cache',
                                              'Pragma': 'no-cache',
                                                      'Referer': 'https://www.google.com/',
                                                              'Sec-Fetch-Dest': 'document',
                                                                      'Sec-Fetch-Mode': 'navigate',
                                                                              'Sec-Fetch-Site': 'none'},
      signal: controller.signal
    });

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Failed to fetch URL: ${response.status} ${response.statusText}` 
      });
    }

    const html = await response.text();
        clearTimeout(timeoutId);
    let vehicleData = {};

    if (isMobileDe) {
      vehicleData = scrapeMobileDe(html);
        
    } else if (isAutoScout) {
      vehicleData = scrapeAutoScout24(html);
    }    // Check if we got any data
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

function scrapeMobileDe(html) {
  const data = {};

  // Title/Brand/Model - look for h1 tag
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (titleMatch) {
    const titleText = titleMatch[1].trim();
    const parts = titleText.split(/\s+/);
    data.brand = parts[0] || '';
    data.model = parts.slice(1).join(' ') || '';
    data.title = titleText;
  }

  // Year - look for 'XX/YYYY' format or just year
  const yearMatch = html.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    if (year >= 1900 && year <= new Date().getFullYear()) {
      data.registrationYear = year;
    }
  }

  // Registration month - look for month/year pattern
  const monthYearMatch = html.match(/(\d{1,2})\/(\d{4})/);
  if (monthYearMatch) {
    const month = parseInt(monthYearMatch[1]);
    if (month >= 1 && month <= 12) {
      data.registrationMonth = month;
      data.registrationYear = parseInt(monthYearMatch[2]);
    }
  }

  // Price - look for currency amounts
  const priceMatch = html.match(/([€€])\s*([0-9.,\s]+)/i) || 
                     html.match(/price["\']?\s*:\s*["\']?([0-9.,]+)["\']?/i) ||
                     html.match(/([0-9]{2,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)\s*€/);
  if (priceMatch) {
    const priceStr = priceMatch[1] || priceMatch[2];
    const cleaned = priceStr.replace(/\./g, '').replace(',', '.');
    const price = parseFloat(cleaned);
    if (!isNaN(price) && price > 100) {
      data.price = price;
    }
  }

  // Engine displacement (ccm/cm³)
  const displacementMatch = html.match(/(\d{3,4})\s*(?:ccm?|cm³)/i);
  if (displacementMatch) {
    data.displacement = parseInt(displacementMatch[1]);
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

  // CO2 emissions
  const co2Match = html.match(/(\d+)\s*(?:g\/km|g\/km|g\/km CO2)/i);
  if (co2Match) {
    const co2 = parseInt(co2Match[1]);
    if (co2 > 0 && co2 < 400) {
      data.co2 = co2;
    }
  }

  // Power (kW or PS)
  const powerMatch = html.match(/(\d{2,3})\s*(?:kW|PS)/i);
  if (powerMatch) {
    data.power = parseInt(powerMatch[1]);
  }

  // Mileage
  const mileageMatch = html.match(/([0-9.,]+)\s*(?:km|KM)/) ||
                       html.match(/mileage["\']?\s*:\s*["\']?([0-9.,]+)/i);
  if (mileageMatch) {
    const mileageStr = mileageMatch[1];
    const cleaned = mileageStr.replace(/\./g, '').replace(',', '');
    const mileage = parseInt(cleaned);
    if (!isNaN(mileage)) {
      data.mileage = mileage;
    }
  }

  // Gearbox
  const gearboxMatch = html.match(/(Automatik|Manuell|Automatic|Manual)/i);
  if (gearboxMatch) {
    const gearbox = gearboxMatch[1].toLowerCase();
    data.gearbox = gearbox.includes('auto') ? 'Automática' : 'Manual';
  }

  // Images - extract image URLs
  const imageMatches = html.match(/<img[^>]*src=["']([^"']*mobile[^"']*)["']/gi) || [];
  const images = [];
  for (const imgMatch of imageMatches) {
    const srcMatch = imgMatch.match(/src=["']([^"']*)["']/i);
    if (srcMatch) {
      let src = srcMatch[1];
      // Try to get high-res version
      src = src.replace(/mo-\d+/, 'mo-1600');
      if (!images.includes(src)) {
        images.push(src);
      }
    }
  }
  if (images.length > 0) data.images = images.slice(0, 5);

  return data;
}

function scrapeAutoScout24(html) {
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

  // Price - look for price patterns
  const priceMatch = html.match(/([€€])\s*([0-9.,\s]+)/i) ||
                     html.match(/([0-9]{2,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)\s*€/);
  if (priceMatch) {
    const priceStr = priceMatch[1] || priceMatch[2];
    const cleaned = priceStr.replace(/\./g, '').replace(',', '.');
    const price = parseFloat(cleaned);
    if (!isNaN(price) && price > 100) {
      data.price = price;
    }
  }

  // Displacement
  const displacementMatch = html.match(/(\d{3,4})\s*(?:ccm?|cm³)/i);
  if (displacementMatch) {
    data.displacement = parseInt(displacementMatch[1]);
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

  // CO2
  const co2Match = html.match(/(\d+)\s*(?:g\/km|g\/km CO2)/i);
  if (co2Match) {
    const co2 = parseInt(co2Match[1]);
    if (co2 > 0 && co2 < 400) {
      data.co2 = co2;
    }
  }

  // Power
  const powerMatch = html.match(/(\d{2,3})\s*(?:kW|PS)/i);
  if (powerMatch) {
    data.power = parseInt(powerMatch[1]);
  }

  // Mileage
  const mileageMatch = html.match(/([0-9.,]+)\s*(?:km|KM)/) ||
                       html.match(/mileage["\']?\s*:\s*["\']?([0-9.,]+)/i);
  if (mileageMatch) {
    const mileageStr = mileageMatch[1];
    const cleaned = mileageStr.replace(/\./g, '').replace(',', '');
    const mileage = parseInt(cleaned);
    if (!isNaN(mileage)) {
      data.mileage = mileage;
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
}
