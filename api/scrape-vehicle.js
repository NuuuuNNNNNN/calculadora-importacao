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

    // Parse vehicle data
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
    // Title - usually in h1 or data attribute
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (titleMatch) {
      data.title = titleMatch[1].trim();
    }

    // Price - look for currency symbol
    const priceMatch = html.match(/€\s*([\d.,]+)/);
    if (priceMatch) {
      const priceStr = priceMatch[1].replace(/\./g, '').replace(',', '.');
      data.price = parseInt(parseFloat(priceStr));
    }

    // Mileage - km pattern
    const mileageMatch = html.match(/([\d.,]+)\s*km/i);
    if (mileageMatch) {
      const mileStr = mileageMatch[1].replace(/\./g, '').replace(',', '');
      data.mileage = parseInt(mileStr);
    }

    // Year - typically YYYY format
    const yearMatch = html.match(/(\d{4})\s*\/\s*(\d{1,2})/);
    if (yearMatch) {
      data.year = parseInt(yearMatch[1]);
    }

    // Transmission
    if (html.includes('Automatik')) {
      data.transmission = 'Automatic';
    } else if (html.includes('Schaltgetriebe')) {
      data.transmission = 'Manual';
    }

    // Fuel type
    if (html.includes('Diesel')) {
      data.fuelType = 'Diesel';
    } else if (html.includes('Benzin') || html.includes('Petrol')) {
      data.fuelType = 'Petrol';
    } else if (html.includes('Elektro')) {
      data.fuelType = 'Electric';
    }

    // Power - kW pattern
    const powerMatch = html.match(/([\d]+)\s*kW/i);
    if (powerMatch) {
      data.power = parseInt(powerMatch[1]);
    }

    // CO2 - g/km pattern
    const co2Match = html.match(/([\d]+)\s*g\s*\/\s*km/i);
    if (co2Match) {
      data.co2 = parseInt(co2Match[1]);
    }

    // Image - look for img tags in data attributes or src
    const imageMatch = html.match(/(?:data-src|src)="([^"]*\.(?:jpg|jpeg|png|webp))"[^>]*(?:alt|title)?="?([^"]*car[^"]*)?"?/i);
    if (imageMatch) {
      data.image = imageMatch[1];
    }

    // Ensure full image URL
    if (data.image && !data.image.startsWith('http')) {
      data.image = 'https://' + new URL(url).hostname + data.image;
    }

  } catch (parseError) {
    console.error('[API] Parse error:', parseError.message);
  }

  return data;
}
