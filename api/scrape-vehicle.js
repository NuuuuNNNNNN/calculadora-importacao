export default async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Missing url' });
    }

    console.log('[API] Scraping:', url);

    // Fetch HTML from ScrapingBee with stealth_proxy (faster than premium_proxy)
    const params = new URLSearchParams({
      api_key: 'NT61UK632R6F88RCS1YL7SM4L5Y6YWBRITBSU97QS4GDUX16CIOB0ETA1D16ESKO3UQ5ZK4QCUFA0IAL',
      url: url,
      stealth_proxy: 'true'
    });

    const response = await fetch('https://app.scrapingbee.com/api/v1/?' + params.toString(), {
      timeout: 90000 // 90 second timeout
    });
    const html = await response.text();

    console.log('[API] HTML received, length:', html.length);

    // Parse vehicle data using simple regex patterns
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

    // Year: try multiple patterns
    let yearMatch = html.match(/"firstRegistration"[^}]*"value":"(\d{2})\/(\d{4})/);
    if (yearMatch) {
      data.year = parseInt(yearMatch[2]);
    }
    if (!data.year) {
      yearMatch = html.match(/"Erstzulassung"[^:]*:\s*"(\d{2})\/(\d{4})/);
      if (yearMatch) data.year = parseInt(yearMatch[2]);
    }
    if (!data.year) {
      yearMatch = html.match(/•\s*(\d{2})\/(\d{4})"/);
      if (yearMatch) data.year = parseInt(yearMatch[2]);
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
      const powerMatch2 = html.match(/([\d]+)\s*kW\s*\([\d]+\s*PS\)/);
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
