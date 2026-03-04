export default async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Missing url' });
    }

    console.log('[API] Scraping:', url);

    // Fetch HTML from ScrapingBee with premium proxy AND JavaScript rendering
    const params = new URLSearchParams({
      api_key: 'NT61UK632R6F88RCS1YL7SM4L5Y6YWBRITBSU97QS4GDUX16CIOB0ETA1D16ESKO3UQ5ZK4QCUFA0IAL',
      url: url,
      premium_proxy: 'true',
      render_javascript: 'true'
    });

    const response = await fetch('https://app.scrapingbee.com/api/v1/?' + params.toString());
    const html = await response.text();

    console.log('[API] HTML received, length:', html.length);

    // Parse vehicle data
    const vehicleData = parseVehicleData(html, url);
    
    console.log('[API] Parsed data:', vehicleData);

    // Include raw HTML first 1000 chars for debugging
    vehicleData.debug_html = html.substring(0, 1500);

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
    // Title from <title> tag - "Porsche Panamera für 73.680 €"
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const titleText = titleMatch[1].trim();
      // Extract just the car name before price
      const carName = titleText.split('für')[0].trim();
      data.title = carName;
      
      // Extract price from title
      const priceInTitle = titleText.match(/(\d+\.\d{3})\s*€/);
      if (priceInTitle) {
        data.price = parseInt(priceInTitle[1].replace('.', ''));
      }
    }

    // Get description from og:description meta tag
    const descMatch = html.match(/property="og:description"[^>]*content="([^"]+)"/);
    const description = descMatch ? descMatch[1] : '';

    if (description) {
      console.log('[API] Description:', description);

      // Parse description like: "Gebrauchtfahrzeug, Unfallfrei • 159.000 km • 500 kW (680 PS) • Hybrid (Benzin/Elektro), Plug-in-Hybrid • Automatik • 09/2020"
      
      // Mileage - X.XXX km
      const mileageMatch = description.match(/([\d.]+)\s*km/i);
      if (mileageMatch) {
        data.mileage = parseInt(mileageMatch[1].replace('.', ''));
      }

      // Power - X kW
      const powerMatch = description.match(/([\d]+)\s*kW/i);
      if (powerMatch) {
        data.power = parseInt(powerMatch[1]);
      }

      // Year/Month - MM/YYYY
      const yearMatch = description.match(/(\d{2})\/(\d{4})/);
      if (yearMatch) {
        data.year = parseInt(yearMatch[2]); // Take the year part
      }

      // Transmission
      if (description.includes('Automatik')) {
        data.transmission = 'Automatic';
      } else if (description.includes('Schaltgetriebe')) {
        data.transmission = 'Manual';
      }

      // Fuel type - can be Diesel, Benzin, Hybrid, Elektro, etc.
      if (description.includes('Diesel')) {
        data.fuelType = 'Diesel';
      } else if (description.includes('Hybrid')) {
        data.fuelType = 'Hybrid';
      } else if (description.includes('Elektro')) {
        data.fuelType = 'Electric';
      } else if (description.includes('Benzin')) {
        data.fuelType = 'Petrol';
      }
    }

    // Image from og:image meta tag
    const imageMatch = html.match(/property="og:image"[^>]*content="([^"]+)"/);
    if (imageMatch) {
      data.image = imageMatch[1];
    }

    // CO2 - g/km pattern (might not always be present)
    const co2Match = html.match(/([\d]+)\s*g\/km/i);
    if (co2Match) {
      data.co2 = parseInt(co2Match[1]);
    }

  } catch (parseError) {
    console.error('[API] Parse error:', parseError.message);
  }

  return data;
}
