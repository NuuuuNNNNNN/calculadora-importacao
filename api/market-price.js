// Market Price API - Scrapes StandVirtual for Portuguese market prices
const https = require('https');

// Map common make names to StandVirtual URL slugs
const MAKE_SLUGS = {
  'mercedes-benz': 'mercedes-benz',
  'mercedes': 'mercedes-benz',
  'bmw': 'bmw',
  'audi': 'audi',
  'volkswagen': 'volkswagen',
  'vw': 'volkswagen',
  'porsche': 'porsche',
  'volvo': 'volvo',
  'toyota': 'toyota',
  'honda': 'honda',
  'ford': 'ford',
  'opel': 'opel',
  'peugeot': 'peugeot',
  'citroen': 'citroen',
  'citroën': 'citroen',
  'renault': 'renault',
  'fiat': 'fiat',
  'seat': 'seat',
  'skoda': 'skoda',
  'škoda': 'skoda',
  'hyundai': 'hyundai',
  'kia': 'kia',
  'nissan': 'nissan',
  'mazda': 'mazda',
  'mini': 'mini',
  'land rover': 'land-rover',
  'range rover': 'land-rover',
  'jaguar': 'jaguar',
  'alfa romeo': 'alfa-romeo',
  'jeep': 'jeep',
  'tesla': 'tesla',
  'lexus': 'lexus',
  'maserati': 'maserati',
  'bentley': 'bentley',
  'lamborghini': 'lamborghini',
  'ferrari': 'ferrari',
  'aston martin': 'aston-martin',
  'cupra': 'cupra',
  'dacia': 'dacia',
  'smart': 'smart',
  'suzuki': 'suzuki',
  'mitsubishi': 'mitsubishi',
  'subaru': 'subaru',
};

// Map common model names to StandVirtual URL slugs  
const MODEL_SLUGS = {
  // Mercedes
  'classe a': 'classe-a', 'classe b': 'classe-b', 'classe c': 'classe-c',
  'classe e': 'classe-e', 'classe s': 'classe-s', 'classe g': 'classe-g',
  'a-klasse': 'classe-a', 'b-klasse': 'classe-b', 'c-klasse': 'classe-c',
  'e-klasse': 'classe-e', 's-klasse': 'classe-s', 'g-klasse': 'classe-g',
  'cla': 'cla', 'clk': 'clk', 'cls': 'cls',
  'gla': 'gla', 'glb': 'glb', 'glc': 'glc', 'gle': 'gle', 'gls': 'gls',
  'eqa': 'eqa', 'eqb': 'eqb', 'eqc': 'eqc', 'eqe': 'eqe', 'eqs': 'eqs',
  'sprinter': 'sprinter', 'vito': 'vito', 'amg gt': 'amg-gt',
  // BMW
  'serie 1': 'serie-1', 'serie 2': 'serie-2', 'serie 3': 'serie-3',
  'serie 4': 'serie-4', 'serie 5': 'serie-5', 'serie 7': 'serie-7',
  '1er': 'serie-1', '2er': 'serie-2', '3er': 'serie-3',
  '4er': 'serie-4', '5er': 'serie-5', '7er': 'serie-7',
  'x1': 'x1', 'x2': 'x2', 'x3': 'x3', 'x4': 'x4', 'x5': 'x5', 'x6': 'x6', 'x7': 'x7',
  'ix': 'ix', 'ix1': 'ix1', 'ix3': 'ix3', 'i3': 'i3', 'i4': 'i4', 'i5': 'i5', 'i7': 'i7',
  'z4': 'z4', 'm2': 'm2', 'm3': 'm3', 'm4': 'm4', 'm5': 'm5',
  // Audi
  'a1': 'a1', 'a3': 'a3', 'a4': 'a4', 'a5': 'a5', 'a6': 'a6', 'a7': 'a7', 'a8': 'a8',
  'q2': 'q2', 'q3': 'q3', 'q4': 'q4', 'q5': 'q5', 'q7': 'q7', 'q8': 'q8',
  'e-tron': 'e-tron', 'e-tron gt': 'e-tron-gt', 'rs3': 'rs3', 'rs4': 'rs4',
  'rs5': 'rs5', 'rs6': 'rs6', 'rs7': 'rs7', 'tt': 'tt', 'r8': 'r8',
  // VW
  'golf': 'golf', 'polo': 'polo', 'passat': 'passat', 'tiguan': 'tiguan',
  't-roc': 't-roc', 'taigo': 'taigo', 'id.3': 'id3', 'id.4': 'id4', 'id.5': 'id5',
  'touareg': 'touareg', 'arteon': 'arteon', 'caddy': 'caddy', 'transporter': 'transporter',
  // Porsche
  'panamera': 'panamera', 'cayenne': 'cayenne', 'macan': 'macan',
  'taycan': 'taycan', '911': '911', 'boxster': 'boxster', 'cayman': 'cayman',
  // Volvo
  'xc40': 'xc40', 'xc60': 'xc60', 'xc90': 'xc90',
  'c40': 'c40', 'v40': 'v40', 'v60': 'v60', 'v90': 'v90',
  's60': 's60', 's90': 's90', 'ex30': 'ex30', 'ex90': 'ex90',
  // Tesla
  'model 3': 'model-3', 'model s': 'model-s', 'model x': 'model-x', 'model y': 'model-y',
  // Others
  'clio': 'clio', '208': '208', '308': '308', '3008': '3008', '5008': '5008',
  'corsa': 'corsa', 'astra': 'astra', 'mokka': 'mokka',
  'leon': 'leon', 'ibiza': 'ibiza', 'ateca': 'ateca', 'formentor': 'formentor',
  'octavia': 'octavia', 'superb': 'superb', 'kodiaq': 'kodiaq', 'enyaq': 'enyaq',
  'tucson': 'tucson', 'kona': 'kona', 'ioniq': 'ioniq',
  'sportage': 'sportage', 'niro': 'niro', 'ev6': 'ev6',
  'qashqai': 'qashqai', 'juke': 'juke', 'leaf': 'leaf',
  'yaris': 'yaris', 'corolla': 'corolla', 'rav4': 'rav4', 'chr': 'c-hr',
  'civic': 'civic', 'jazz': 'jazz', 'hrv': 'hr-v', 'crv': 'cr-v',
  'focus': 'focus', 'fiesta': 'fiesta', 'kuga': 'kuga', 'puma': 'puma', 'mustang': 'mustang',
  '500': '500', 'panda': 'panda', 'tipo': 'tipo',
  'f-pace': 'f-pace', 'e-pace': 'e-pace', 'f-type': 'f-type',
  'range rover sport': 'range-rover-sport', 'range rover evoque': 'range-rover-evoque',
  'defender': 'defender', 'discovery': 'discovery',
  'wrangler': 'wrangler', 'compass': 'compass', 'renegade': 'renegade',
};

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getMakeSlug(make) {
  const lower = make.toLowerCase().trim();
  return MAKE_SLUGS[lower] || slugify(make);
}

function getModelSlug(model, make) {
  const lower = model.toLowerCase().trim();
  
  // Try exact match first
  if (MODEL_SLUGS[lower]) return MODEL_SLUGS[lower];
  
  // Try first word/number (e.g. "Panamera 4 E-Hybrid" → "panamera")
  const firstPart = lower.split(/\s+/)[0];
  if (MODEL_SLUGS[firstPart]) return MODEL_SLUGS[firstPart];
  
  // Try first two words (e.g. "AMG GT" → "amg-gt")  
  const twoWords = lower.split(/\s+/).slice(0, 2).join(' ');
  if (MODEL_SLUGS[twoWords]) return MODEL_SLUGS[twoWords];
  
  // For Mercedes: check if starts with letter pattern
  if (make.toLowerCase().includes('mercedes')) {
    const letterMatch = lower.match(/^([a-z]{1,3})\b/);
    if (letterMatch && MODEL_SLUGS[letterMatch[1]]) {
      return MODEL_SLUGS[letterMatch[1]];
    }
    // Check "Klasse" pattern
    const klasseMatch = lower.match(/([a-z])-klasse/);
    if (klasseMatch) {
      return MODEL_SLUGS[`${klasseMatch[1]}-klasse`] || `classe-${klasseMatch[1]}`;
    }
  }
  
  // For BMW: check if starts with number pattern
  if (make.toLowerCase() === 'bmw') {
    const numMatch = lower.match(/^(\d)er/);
    if (numMatch) return MODEL_SLUGS[`${numMatch[1]}er`] || `serie-${numMatch[1]}`;
    const serieMatch = lower.match(/^serie\s*(\d)/);
    if (serieMatch) return `serie-${serieMatch[1]}`;
  }
  
  // Fallback: slugify
  return slugify(model.split(/\s+/).slice(0, 2).join(' '));
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 50000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { make, model, year } = req.body || {};
  
  if (!make || !model) {
    return res.status(400).json({ error: 'make and model are required' });
  }

  const makeSlug = getMakeSlug(make);
  const modelSlug = getModelSlug(model, make);
  const vehicleYear = parseInt(year) || new Date().getFullYear();
  
  // Search ±1 year range for more results
  const yearFrom = vehicleYear - 1;
  const yearTo = vehicleYear + 1;
  
  const searchUrl = `https://www.standvirtual.com/carros/${makeSlug}/${modelSlug}/desde-${yearFrom}/ate-${yearTo}`;

  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ScrapingBee API key not configured' });
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    url: searchUrl,
    render_js: 'true',
    premium_proxy: 'true',
    country_code: 'pt',
  });

  try {
    console.log(`[market-price] Searching: ${searchUrl}`);
    const response = await fetchUrl(`https://app.scrapingbee.com/api/v1/?${params.toString()}`);
    
    if (response.status !== 200) {
      console.log(`[market-price] ScrapingBee returned ${response.status}`);
      return res.status(502).json({ error: 'Failed to fetch market data', searchUrl });
    }

    const html = response.data;
    
    // Extract prices from JSON-LD OfferCatalog
    const listings = [];
    const offerMatch = html.match(/"OfferCatalog".*?"itemListElement"\s*:\s*\[(.*?)\]\s*\}/s);
    
    if (offerMatch) {
      try {
        // Parse the full script tag containing the OfferCatalog
        const scriptMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?OfferCatalog[\s\S]*?)<\/script>/);
        if (scriptMatch) {
          const jsonData = JSON.parse(scriptMatch[1]);
          const items = jsonData.mainEntity?.itemListElement || [];
          
          for (const item of items) {
            const price = parseInt(item.priceSpecification?.price || item.price || 0);
            const name = item.itemOffered?.name || '';
            const itemYear = parseInt(item.itemOffered?.vehicleModelDate || 0);
            const km = parseInt(item.itemOffered?.mileageFromOdometer?.value || 0);
            const fuel = item.itemOffered?.fuelType || '';
            
            if (price > 1000) {
              listings.push({ name, price, year: itemYear, km, fuel });
            }
          }
        }
      } catch (e) {
        console.log('[market-price] JSON-LD parse error:', e.message);
      }
    }
    
    // Fallback: extract from big numbers if no JSON-LD
    if (listings.length === 0) {
      const priceMatches = html.matchAll(/"price"\s*:\s*"?(\d+)"?/g);
      for (const m of priceMatches) {
        const p = parseInt(m[1]);
        if (p > 5000) listings.push({ price: p });
      }
    }

    if (listings.length === 0) {
      return res.json({ 
        found: false, 
        message: 'Sem resultados no StandVirtual',
        searchUrl,
        makeSlug,
        modelSlug
      });
    }

    // Calculate statistics
    const prices = listings.map(l => l.price).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    
    // Filter outliers (keep 0.4x to 2x of median)
    const filtered = prices.filter(p => p >= median * 0.4 && p <= median * 2);
    const filteredMedian = filtered.length > 0 ? filtered[Math.floor(filtered.length / 2)] : median;
    const filteredAvg = filtered.length > 0 ? Math.round(filtered.reduce((a, b) => a + b, 0) / filtered.length) : avg;

    console.log(`[market-price] Found ${listings.length} listings, median: ${filteredMedian}€`);

    return res.json({
      found: true,
      count: listings.length,
      filteredCount: filtered.length,
      min: prices[0],
      max: prices[prices.length - 1],
      median: filteredMedian,
      average: filteredAvg,
      searchUrl,
      makeSlug,
      modelSlug,
      yearRange: `${yearFrom}-${yearTo}`,
      // Include some sample listings
      samples: listings.slice(0, 5).map(l => ({
        name: l.name,
        price: l.price,
        year: l.year,
        km: l.km,
      }))
    });

  } catch (error) {
    console.error('[market-price] Error:', error.message);
    return res.status(500).json({ error: error.message, searchUrl });
  }
};
