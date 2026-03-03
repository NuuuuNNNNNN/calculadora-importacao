import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrape vehicle data from mobile.de or AutoScout24
 * POST /api/scrape-vehicle
 * Body: { url: "https://..." }
 */
export default async function handler(req, res) {
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
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0'
      },
      timeout: 15000
    });

    const $ = cheerio.load(data);
    let vehicleData = {};

    if (isMobileDe) {
      vehicleData = scrapeMobileDe($);
    } else if (isAutoScout) {
      vehicleData = scrapeAutoScout24($);
    }

    return res.status(200).json({
      success: true,
      source: isMobileDe ? 'mobile.de' : 'autoscout24',
      data: vehicleData
    });

  } catch (error) {
    console.error('Scraping error:', error.message);
    return res.status(500).json({
      error: 'Failed to scrape vehicle data',
      message: error.message
    });
  }
}

function scrapeMobileDe($) {
  const data = {};

  // Title/Brand/Model
  const titleText = $('h1').first().text() || '';
  const parts = titleText.split(' ');
  data.brand = parts[0] || '';
  data.model = parts.slice(1).join(' ') || '';

  // Year - look for 'XX/YYYY' format or just year
  const yearMatch = titleText.match(/(\d{4})/);
  if (yearMatch) data.year = parseInt(yearMatch[1]);

  // Price - usually in € format
  const priceText = $('.amountPlain').first().text() || '';
  const priceMatch = priceText.match(/[\d.,]+/);
  if (priceMatch) {
    data.price = parseFloat(priceMatch[0].replace(/\./g, '').replace(',', '.'));
  }

  // Engine displacement
  const ccMatch = $('.detailsTable')
    .text()
    .match(/(\d+)\s*(?:ccm?|cm³)/i);
  if (ccMatch) data.displacement = parseInt(ccMatch[1]);

  // Fuel type
  const fuelText = $('dd').filter((i, el) => 
    $(el).text().match(/Diesel|Benzin|Hybrid|Electric/i)
  ).first().text();
  if (fuelText) data.fuel = fuelText.toLowerCase();

  // CO2 emissions
  const co2Match = $('.detailsTable')
    .text()
    .match(/(\d+)\s*g\/km.*CO2/i);
  if (co2Match) data.co2 = parseInt(co2Match[1]);

  // Power (kW)
  const powerMatch = $('dd').text().match(/(\d+)\s*(?:kW|PS)/);
  if (powerMatch) data.power = parseInt(powerMatch[1]);

  // Images - high resolution
  const images = [];
  $('img[src*="mo-"]').each((i, el) => {
    let src = $(el).attr('src');
    if (src && !images.includes(src)) {
      // Replace with high-res version
      src = src.replace(/mo-\d+/, 'mo-1600');
      images.push(src);
    }
  });
  if (images.length > 0) data.images = images;

  return data;
}

function scrapeAutoScout24($) {
  const data = {};

  // Title
  const titleText = $('h1').first().text() || '';
  const parts = titleText.split(' ').filter(p => p.length > 0);
  data.brand = parts[0] || '';
  data.model = parts.slice(1, -1).join(' ') || '';

  // Year - usually at end of title
  const yearMatch = titleText.match(/(\d{4})/);
  if (yearMatch) data.year = parseInt(yearMatch[1]);

  // Price
  const priceText = $('.PriceFinal').text() || '';
  const priceMatch = priceText.match(/[\d.,€]+/);
  if (priceMatch) {
    const cleaned = priceMatch[0].replace(/€|\.|\s/g, '').replace(',', '.');
    data.price = parseFloat(cleaned);
  }

  // Specifications from list
  const specs = {};
  $('[class*="Details"] li, [class*="Specification"] li').each((i, el) => {
    const text = $(el).text();
    if (text.match(/Diesel|Benzin|Hybrid/i)) specs.fuel = text;
    if (text.match(/\d+\s*ccm?/i)) {
      const match = text.match(/(\d+)/);
      if (match) specs.displacement = parseInt(match[1]);
    }
    if (text.match(/\d+\s*kW/i)) {
      const match = text.match(/(\d+)\s*kW/);
      if (match) specs.power = parseInt(match[1]);
    }
    if (text.match(/CO2/i)) {
      const match = text.match(/(\d+)\s*g\/km/);
      if (match) specs.co2 = parseInt(match[1]);
    }
  });
  Object.assign(data, specs);

  // Images - look for picture gallery
  const images = [];
  $('img').each((i, el) => {
    let src = $(el).attr('src') || $(el).attr('data-src');
    if (src && src.includes('jpg') && !images.includes(src)) {
      images.push(src);
    }
  });
  if (images.length > 0) data.images = images.slice(0, 5);

  return data;
}
