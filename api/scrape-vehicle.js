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

    // Mileage: "159.000 km" or similar - look in the description meta tag or attributes
    const mileageMatch = html.match(/"mileage":"([\d.]+)\s*km"/i);
    if (mileageMatch) {
      data.mileage = parseInt(mileageMatch[1].replace(/\./g, ''));
    }

    // Year: "firstRegistration":"09/2020"
    const yearMatch = html.match(/"firstRegistration":"(\d{2})\/(\d{4})"/);
    if (yearMatch) {
      data.year = parseInt(yearMatch[2]);
    }

    // Transmission: look for "Automatik" or "Schaltgetriebe"
    if (html.includes('"transmission":"')) {
      const transMatch = html.match(/"transmission":\s*"([^"]+)"/);
      if (transMatch) {
        data.transmission = transMatch[1].includes('Automatik') ? 'Automatic' : 'Manual';
      }
    } else if (html.includes('Automatik')) {
      data.transmission = 'Automatic';
    } else if (html.includes('Schaltgetriebe')) {
      data.transmission = 'Manual';
    }

    // Fuel type
    if (html.includes('Diesel')) {
      data.fuelType = 'Diesel';
    } else if (html.includes('Plug-in-Hybrid') || html.includes('Hybrid')) {
      data.fuelType = 'Hybrid';
    } else if (html.includes('Elektro')) {
      data.fuelType = 'Electric';
    } else if (html.includes('Benzin')) {
      data.fuelType = 'Petrol';
    }

    // Power: "500 kW (680 PS)"
    const powerMatch = html.match(/"power":\s*"([\d]+)\s*kW/);
    if (powerMatch) {
      data.power = parseInt(powerMatch[1]);
    }

    // CO2: "83 g/km"
    const co2Match = html.match(/"envkv\.co2Emissions":\s*"([\d]+)\s*g/);
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
