import https from 'https';
import { parse } from 'url';

export default async function handler(req, res) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing url in request body' });
  }

  // Check API key (with fallback)
  const apiKey = process.env.SCRAPINGBEE_API_KEY || 'NT61UK632R6F88RCS1YL7SM4L5Y6YWBRITBSU97QS4GDUX16CIOB0ETA1D16ESKO3UQ5ZK4QCUFA0IAL';
  if (!apiKey) {
    console.error('SCRAPINGBEE_API_KEY not configured');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'ScrapingBee API key not configured'
    });
  }

  console.log('[API] URL received:', url);
  console.log('[API] API Key configured:', apiKey.substring(0, 10) + '...');

  try {
    // Extract ad key from URL
    const urlObj = new URL(url);
    const adKey = urlObj.searchParams.get('id');
    
    if (!adKey) {
      return res.status(400).json({ error: 'Invalid mobile.de URL - no id parameter' });
    }

    const listingUrl = `https://suchen.mobile.de/fahrzeuge/details.html?id=${adKey}`;
    console.log('[API] Scraping URL:', listingUrl);

    // Call ScrapingBee API using native https
    const scrapingBeeUrl = new URL('https://api.scrapingbee.com/api/v1/');
    scrapingBeeUrl.searchParams.append('api_key', apiKey);
    scrapingBeeUrl.searchParams.append('url', listingUrl);
    scrapingBeeUrl.searchParams.append('render_javascript', 'true');
    scrapingBeeUrl.searchParams.append('timeout', '30000');
    scrapingBeeUrl.searchParams.append('premium_proxy', 'true');

    console.log('[API] Calling ScrapingBee...');

    const html = await httpGet(scrapingBeeUrl.toString());
    
    console.log('[API] HTML received, length:', html.length);

    if (!html || html.includes('Access denied')) {
      return res.status(500).json({
        error: 'Failed to scrape vehicle data',
        message: 'ScrapingBee blocked access to mobile.de'
      });
    }

    // Parse HTML with cheerio
    const cheerio = (await import('cheerio')).default;
    const $ = cheerio.load(html);

    // Extract vehicle data from HTML
    const vehicle = {
      title: $('h1.listing-title, h1').first().text().trim(),
      price: extractPrice($, html),
      mileage: extractMileage($, html),
      year: extractYear($, html),
      transmission: extractTransmission($, html),
      fuelType: extractFuelType($, html),
      co2: null, // Will be filled from database
      location: extractLocation($, html),
      image: extractImage($, html),
      url: listingUrl
    };

    console.log('[API] Vehicle extracted:', vehicle.title);

    res.status(200).json(vehicle);

  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({
      error: 'Failed to scrape vehicle data',
      message: error.message
    });
  }
}

function httpGet(urlString) {
  return new Promise((resolve, reject) => {
    https.get(urlString, { timeout: 35000 }, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        resolve(data);
      });

    }).on('error', reject)
      .on('timeout', function() {
        this.destroy();
        reject(new Error('Request timeout'));
      });
  });
}

function extractPrice(cheerio, html) {
  const priceMatch = html.match(/EUR[\s,]*([\d,.]+)/i);
  if (priceMatch) return parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
  
  const priceEl = cheerio('[data-testid="price"], .listing-price, .price').first().text();
  if (priceEl) {
    const match = priceEl.match(/([\d,.]+)/);
    if (match) return parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
  }
  return null;
}

function extractMileage(cheerio, html) {
  const mileageMatch = html.match(/(\d+\.?\d*)\s*(km|Kilometer)/i);
  if (mileageMatch) return parseInt(mileageMatch[1].replace(/\./g, ''));
  return null;
}

function extractYear(cheerio, html) {
  const yearMatch = html.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) return parseInt(yearMatch[0]);
  return null;
}

function extractTransmission(cheerio, html) {
  if (html.includes('Automatik') || html.includes('Automatic')) return 'Automática';
  if (html.includes('Schaltgetriebe') || html.includes('Manual')) return 'Manual';
  return null;
}

function extractFuelType(cheerio, html) {
  if (html.includes('Elektro') || html.includes('Electric')) return 'Elétrico';
  if (html.includes('Benzin') || html.includes('Petrol')) return 'Gasolina';
  if (html.includes('Diesel')) return 'Diesel';
  if (html.includes('Hybrid')) return 'Híbrido';
  return null;
}

function extractLocation(cheerio, html) {
  const locationMatch = html.match(/(?:PLZ|Postleitzahl)[\s\-:]*(\d+)\s*([^<\d]+)/i);
  if (locationMatch) return locationMatch[2].trim();
  return null;
}

function extractImage(cheerio, html) {
  const imgMatch = html.match(/<img[^>]+src="([^"]*mobile\.de[^"]*)"[^>]*>/i);
  if (imgMatch) return imgMatch[1];
  
  const srcsetMatch = html.match(/srcset="([^"]*)"[^>]*>.*?<img/i);
  if (srcsetMatch) {
    const urls = srcsetMatch[1].split(',');
    if (urls.length > 0) return urls[0].trim().split(' ')[0];
  }
  
  return null;
}
