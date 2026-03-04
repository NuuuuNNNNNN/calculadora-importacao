import axios from 'axios';

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;

/**
 * Extracts ad key from mobile.de URL
 * Expected URL formats:
 *   - https://suchen.mobile.de/fahrzeuge/details.html?id=441261931
 *   - https://mobile.de/fahrzeuge/details.html?id=441261931
 */
function extractAdKey(url) {
  try {
    const urlObj = new URL(url);
    const id = urlObj.searchParams.get('id');
    if (!id) {
      throw new Error('No id parameter found in URL');
    }
    return id;
  } catch (error) {
    throw new Error(`Invalid mobile.de URL: ${error.message}`);
  }
}

/**
 * Scrapes vehicle data from mobile.de using ScrapingBee
 * ScrapingBee handles anti-bot protection and JavaScript rendering
 */
async function scrapeVehicleFromMobileDe(url) {
  const adKey = extractAdKey(url);
  
  // Construct direct listing URL
  const listingUrl = `https://suchen.mobile.de/fahrzeuge/details.html?id=${adKey}`;

  console.log(`[ScrapingBee] Scraping: ${listingUrl}`);
  
  try {
    // Use ScrapingBee API with JavaScript rendering
    const scrapingBeeUrl = 'https://api.scrapingbee.com/api/v1/';
    
    const response = await axios.get(scrapingBeeUrl, {
      params: {
        api_key: SCRAPINGBEE_API_KEY,
        url: listingUrl,
        render_javascript: 'true',
        // Timeout after 30 seconds
        timeout: '30000',
        // Use a rotating proxy
        premium_proxy: 'true'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 45000 // HTTP timeout
    });

    const html = response.data;
    console.log(`[ScrapingBee] Got HTML (${html.length} bytes)`);

    // Parse vehicle data from HTML
    const vehicleData = parseVehicleData(html, adKey);
    console.log('[Parser] Extracted data:', vehicleData);

    return vehicleData;
  } catch (error) {
    console.error('[ScrapingBee Error]:', error.message);
    throw new Error(`Failed to scrape from mobile.de: ${error.message}`);
  }
}

/**
 * Parses vehicle data from mobile.de HTML
 */
function parseVehicleData(html, adKey) {
  const data = {
    adKey: adKey,
    brand: null,
    model: null,
    year: null,
    price: null,
    mileage: null,
    fuelType: null,
    co2Emissions: null,
    transmission: null,
    power: null,
    images: [],
    description: null
  };

  // Extract brand and model from page title or header
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1];
    console.log('[Parser] Title:', title);
    
    // Try to extract brand and model from title
    // Example: "2018 BMW 3 Series - 2018 BMW 3 Series 320i | mobile.de"
    const modelMatch = title.match(/(\d+)\s+(\w+)\s+([\w\s]+?)\s*[-|]/);
    if (modelMatch) {
      data.year = parseInt(modelMatch[1]);
      data.brand = modelMatch[2];
      data.model = modelMatch[3].trim();
    }
  }

  // Extract price - look for price in various common patterns
  const pricePatterns = [
    /€\s*([\d.,]+)/g,
    /Preis:\s*€\s*([\d.,]+)/gi,
    /Price:\s*€\s*([\d.,]+)/gi,
    /"price":\s*"([^"]+)"/gi
  ];

  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match) {
      // Get the first price found
      const priceStr = match[0];
      const numMatch = priceStr.match(/[\d.]+/);
      if (numMatch) {
        data.price = parseInt(numMatch[0].replace(/\./g, ''));
        console.log('[Parser] Price:', data.price);
        break;
      }
    }
  }

  // Extract mileage
  const mileagePatterns = [
    /(\d+[\s.]?\d*)\s*km/gi,
    /"mileage":\s*(\d+)/gi
  ];

  for (const pattern of mileagePatterns) {
    const match = html.match(pattern);
    if (match) {
      const mileageStr = match[0];
      const numMatch = mileageStr.match(/\d+/);
      if (numMatch) {
        data.mileage = parseInt(numMatch[0]);
        console.log('[Parser] Mileage:', data.mileage);
        break;
      }
    }
  }

  // Extract fuel type
  if (html.match(/Diesel|diesel/i)) {
    data.fuelType = 'Diesel';
  } else if (html.match(/Benzin|Petrol|gasoline/i)) {
    data.fuelType = 'Gasoline';
  } else if (html.match(/Elektro|Electric/i)) {
    data.fuelType = 'Electric';
  }

  // Extract CO2 emissions
  const co2Match = html.match(/(\d+)\s*g\/km|CO2.*?(\d+)\s*g/i);
  if (co2Match) {
    data.co2Emissions = parseInt(co2Match[1] || co2Match[2]);
    console.log('[Parser] CO2:', data.co2Emissions);
  }

  // Extract transmission
  if (html.match(/Automatik|Automatic|CVT/i)) {
    data.transmission = 'Automatic';
  } else if (html.match(/Schaltgetriebe|Manual|Manuell/i)) {
    data.transmission = 'Manual';
  }

  // Extract power in kW or PS
  const powerMatch = html.match(/(\d+)\s*(?:kW|PS)|(?:kW|PS).*?(\d+)/i);
  if (powerMatch) {
    data.power = parseInt(powerMatch[1] || powerMatch[2]);
  }

  // Extract image URLs - look for common image patterns
  const imgPatterns = [
    /src="([^"]*cdn[^"]*\.jpg)"/gi,
    /src="([^"]*mobile\.de[^"]*\.jpg)"/gi,
    /backgroundImage['":\s]+url\(['"]([^'"]+\.jpg)['"]\)/gi,
    /<img[^>]+src="([^"]+\.jpg)"/gi
  ];

  const imageUrls = new Set();
  for (const pattern of imgPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      if (match[1]) {
        imageUrls.add(match[1]);
      }
    }
  }

  data.images = Array.from(imageUrls).slice(0, 5); // Get first 5 unique images
  console.log('[Parser] Found', data.images.length, 'images');

  // Extract description/features from common sections
  const descMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/div>/i);
  if (descMatch) {
    data.description = descMatch[1].trim();
  }

  return data;
}

/**
 * Gets CO2 data from database
 */
async function getCO2FromDatabase(brand, model, year) {
  try {
    // Note: This would connect to your database
    // For now, returning null to indicate not found
    return null;
  } catch (error) {
    console.error('[Database Error]:', error.message);
    return null;
  }
}

/**
 * Validates vehicle data and fills in missing values
 */
async function validateAndEnrichData(vehicleData) {
  const enriched = { ...vehicleData };

  // Validate required fields
  if (!enriched.price || enriched.price < 100) {
    throw new Error('Invalid or missing price');
  }

  // Try to get CO2 from database if missing
  if (!enriched.co2Emissions && enriched.brand && enriched.model && enriched.year) {
    const dbCO2 = await getCO2FromDatabase(enriched.brand, enriched.model, enriched.year);
    if (dbCO2) {
      enriched.co2Emissions = dbCO2;
      console.log('[Database] Retrieved CO2:', dbCO2);
    }
  }

  // Provide reasonable defaults if still missing
  if (!enriched.co2Emissions) {
    enriched.co2Emissions = 140; // Reasonable EU average
    enriched.co2Source = 'estimated';
  } else {
    enriched.co2Source = 'exact';
  }

  return enriched;
}

/**
 * Main Vercel function handler
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get mobile.de URL from request body
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing url in request body' });
  }

  // Check API key is configured
  if (!SCRAPINGBEE_API_KEY) {
    console.error('SCRAPINGBEE_API_KEY not configured');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'ScrapingBee API key not configured'
    });
  }

  console.log('[Request] Processing URL:', url);

  try {
    // Scrape vehicle data from mobile.de
    const vehicleData = await scrapeVehicleFromMobileDe(url);
    console.log('[Result] Raw data:', vehicleData);

    // Validate and enrich with database data
    const enrichedData = await validateAndEnrichData(vehicleData);
    console.log('[Result] Enriched data:', enrichedData);

    // Return enriched data
    return res.status(200).json({
      success: true,
      data: enrichedData
    });
  } catch (error) {
    console.error('[Error] Scraping failed:', error.message);
    return res.status(400).json({
      error: 'Failed to scrape vehicle data',
      message: error.message
    });
  }
}
