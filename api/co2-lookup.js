// ═══════════════════════════════════════
// CO2 Lookup via Ultimate Specs
// Fallback when mobile.de doesn't have CO2 data
// Flow: brand+model → find model page → find generation → find version → extract CO2
// Cache: permanent in Neon DB (CO2 doesn't change for a given version)
// ═══════════════════════════════════════

let _sql = null;
async function getSQL() {
  if (_sql) return _sql;
  if (!process.env.POSTGRES_URL) return null;
  try {
    const mod = await import('@neondatabase/serverless');
    _sql = mod.neon(process.env.POSTGRES_URL);
    await _sql`CREATE TABLE IF NOT EXISTS co2_cache (
      cache_key TEXT PRIMARY KEY,
      co2_value INTEGER NOT NULL,
      source_url TEXT,
      version_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    return _sql;
  } catch (e) {
    console.log('[CO2] DB init error:', e.message);
    return null;
  }
}

// ── Brand name → URL slug mapping ──
const BRAND_MAP = {
  'mercedes-benz': 'Mercedes-Benz', 'mercedes': 'Mercedes-Benz',
  'alfa romeo': 'Alfa-Romeo', 'alfa-romeo': 'Alfa-Romeo',
  'aston martin': 'Aston-Martin', 'aston-martin': 'Aston-Martin',
  'land rover': 'Land-Rover', 'land-rover': 'Land-Rover',
  'rolls royce': 'Rolls-Royce', 'rolls-royce': 'Rolls-Royce',
  'vw': 'Volkswagen', 'volkswagen': 'Volkswagen',
  'bmw': 'BMW', 'audi': 'Audi', 'porsche': 'Porsche', 'volvo': 'Volvo',
  'toyota': 'Toyota', 'honda': 'Honda', 'ford': 'Ford', 'opel': 'Opel',
  'peugeot': 'Peugeot', 'citroen': 'Citroen', 'citroën': 'Citroen',
  'renault': 'Renault', 'seat': 'Seat', 'skoda': 'Skoda', 'škoda': 'Skoda',
  'fiat': 'Fiat', 'jaguar': 'Jaguar', 'mini': 'Mini', 'smart': 'Smart',
  'hyundai': 'Hyundai', 'kia': 'Kia', 'nissan': 'Nissan', 'mazda': 'Mazda',
  'suzuki': 'Suzuki', 'mitsubishi': 'Mitsubishi', 'subaru': 'Subaru',
  'lexus': 'Lexus', 'infiniti': 'Infiniti', 'tesla': 'Tesla',
  'dacia': 'Dacia', 'cupra': 'Cupra', 'ds': 'DS', 'polestar': 'Polestar',
  'genesis': 'Genesis', 'jeep': 'Jeep', 'dodge': 'Dodge',
  'chrysler': 'Chrysler', 'chevrolet': 'Chevrolet', 'cadillac': 'Cadillac',
  'bentley': 'Bentley', 'ferrari': 'Ferrari', 'lamborghini': 'Lamborghini',
  'maserati': 'Maserati', 'mclaren': 'McLaren', 'alpine': 'Alpine',
  'bugatti': 'Bugatti',
};

function brandSlug(brand) {
  const lower = brand.toLowerCase().trim();
  if (BRAND_MAP[lower]) return BRAND_MAP[lower];
  // Capitalize each word and join with dash
  return brand.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-');
}

async function fetchPage(url) {
  console.log(`[CO2] Fetch: ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// ── Step 1: Find model page URL ──
// Input: "CLA 180" → tries "CLA-180", then "CLA"
// BMW special: "320d" → also tries "3-Series"
function getModelSearchTerms(brand, model) {
  const clean = model.trim().replace(/[^\w\s-]/g, '');
  const parts = clean.split(/\s+/);
  const terms = [];
  
  // Progressive shortening: "CLA 180" → ["CLA-180", "CLA"]
  for (let i = parts.length; i >= 1; i--) {
    terms.push(parts.slice(0, i).join('-'));
  }
  
  // BMW: variant → series mapping (320d → 3-Series, X3 → X3, M5 → M5)
  const brandLower = (brand || '').toLowerCase();
  if (brandLower.includes('bmw')) {
    const seriesFromVariant = clean.match(/^(\d)\d{2}/);
    if (seriesFromVariant) {
      terms.push(`${seriesFromVariant[1]}-Series`);
    }
    // X-series, Z-series, i-series already work as first word
  }
  
  // Remove duplicates
  return [...new Set(terms)];
}

// ── Step 2: Find generation page URL from model page ──
function findGenerationUrls(html, year) {
  const results = [];
  
  // Find all generation links: /car-specs/Brand/M{id}/{name}
  const genRegex = /href="(\/car-specs\/[^"]+\/M(\d+)\/([^"]+))"/g;
  let match;
  const seen = new Set();
  
  while ((match = genRegex.exec(html)) !== null) {
    const url = match[1];
    const id = match[2];
    const name = match[3];
    
    if (seen.has(id)) continue;
    seen.add(id);
    
    // Skip body type variants we're less likely to want
    const nameLower = name.toLowerCase();
    const isVariant = nameLower.includes('shooting-brake') || nameLower.includes('estate') || 
                      nameLower.includes('wagon') || nameLower.includes('cabrio') ||
                      nameLower.includes('convertible') || nameLower.includes('roadster');
    
    // Try to find year range near this link
    const afterText = html.substring(match.index, Math.min(html.length, match.index + 800));
    const yearRange = afterText.match(/\((\d{4})\s*-\s*(\d{4}|[Pp]resent|\.{3})\)/);
    
    let startYear = 0, endYear = 9999;
    if (yearRange) {
      startYear = parseInt(yearRange[1]);
      endYear = (yearRange[2].toLowerCase() === 'present' || yearRange[2] === '...') ? 9999 : parseInt(yearRange[2]);
    }
    
    // Extract version count
    const versionsMatch = afterText.match(/(\d+)\s*Version/i);
    const versionCount = versionsMatch ? parseInt(versionsMatch[1]) : 0;
    
    results.push({ url, id, name, startYear, endYear, isVariant, versionCount });
  }
  
  if (results.length === 0) return results;
  
  // Ultimate Specs lists generations newest-first on the page.
  // Preserve that order but move year-matching and non-variant to top.
  // DO NOT sort by version count (biases towards older, larger gens).
  results.sort((a, b) => {
    // Year range match is top priority
    if (year) {
      const aInRange = year >= a.startYear && year <= a.endYear ? 1 : 0;
      const bInRange = year >= b.startYear && year <= b.endYear ? 1 : 0;
      if (aInRange !== bInRange) return bInRange - aInRange;
    }
    // Non-variants preferred
    if (a.isVariant !== b.isVariant) return a.isVariant ? 1 : -1;
    // Otherwise: preserve page order (index in results = page order)
    return 0;
  });
  
  return results;
}

// ── Step 3: Find best matching version from generation page ──
function findBestVersion(html, year, displacement, power) {
  const versions = [];
  
  // Parse version links from the HTML table
  // Pattern: <a href="/car-specs/Brand/ID/Name.html">Name</a> ... year ... hp ... cm3
  const linkRegex = /<a[^>]*href="(\/car-specs\/[^"]+\/(\d+)\/([^"]+)\.html)"[^>]*>([^<]+)<\/a>/g;
  let match;
  
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const versionId = match[2];
    const urlName = match[3];
    const displayName = match[4].trim();
    
    // Look ahead for year, HP, displacement in the same table row
    const ahead = html.substring(match.index, Math.min(html.length, match.index + 600));
    
    // Year: 4-digit number in a table cell
    const yearMatches = [...ahead.matchAll(/>(\d{4})</g)];
    const vYear = yearMatches.length > 0 ? parseInt(yearMatches[0][1]) : 0;
    
    // HP: number followed by hp/HP/PS/kW
    const hpMatch = ahead.match(/(\d+)\s*(?:hp|HP)/);
    const kwMatch = ahead.match(/(\d+)\s*kW/);
    const vHP = hpMatch ? parseInt(hpMatch[1]) : (kwMatch ? Math.round(parseInt(kwMatch[1]) * 1.36) : 0);
    
    // Displacement: number followed by cm3 or cm³
    const dispMatch = ahead.match(/(\d+)\s*cm/);
    const vDisp = dispMatch ? parseInt(dispMatch[1]) : 0;
    
    versions.push({
      url, versionId, urlName, displayName,
      year: vYear, hp: vHP, disp: vDisp
    });
  }
  
  if (versions.length === 0) return null;
  
  console.log(`[CO2] Found ${versions.length} versions on page`);
  
  // Score each version
  let bestScore = -1;
  let bestVersion = null;
  
  for (const v of versions) {
    let score = 0;
    
    // Year matching (most important)
    if (year && v.year) {
      if (v.year === year) score += 100;
      else if (Math.abs(v.year - year) === 1) score += 60;
      else if (Math.abs(v.year - year) <= 2) score += 30;
    }
    
    // Displacement matching
    if (displacement && v.disp) {
      if (v.disp === displacement) score += 80;
      else if (Math.abs(v.disp - displacement) <= 50) score += 40;
      else if (Math.abs(v.disp - displacement) <= 200) score += 15;
    }
    
    // Power matching
    if (power && v.hp) {
      if (v.hp === power) score += 50;
      else if (Math.abs(v.hp - power) <= 5) score += 30;
      else if (Math.abs(v.hp - power) <= 20) score += 10;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestVersion = v;
    }
  }
  
  if (bestVersion) {
    console.log(`[CO2] Best match: ${bestVersion.displayName} (score: ${bestScore}, year: ${bestVersion.year}, ${bestVersion.hp}hp, ${bestVersion.disp}cc)`);
  }
  
  return bestVersion ? { version: bestVersion, score: bestScore } : null;
}

// ── Step 4: Extract CO2 from version detail page ──
function extractCO2(html) {
  // Method 1: JSON-LD structured data (most reliable)
  // Pattern: "emissionsCO2": "121"
  const jsonLdMatch = html.match(/"emissionsCO2"\s*:\s*"(\d+)"/);
  if (jsonLdMatch) {
    const val = parseInt(jsonLdMatch[1]);
    if (val > 0 && val < 1000) {
      console.log(`[CO2] Found via JSON-LD: ${val} g/km`);
      return { value: val, standard: 'NEDC' };
    }
  }
  
  // Method 2: WLTP value from HTML table
  // Pattern: CO2 emissions WLTP : ... <td class="tabletd_right"> 145 g/km
  const wltpMatch = html.match(/CO2\s*emissions?\s*WLTP\s*:[\s\S]*?tabletd_right[^>]*>\s*(\d+)\s*g\/km/i);
  if (wltpMatch) {
    const val = parseInt(wltpMatch[1]);
    if (val > 0 && val < 1000) {
      console.log(`[CO2] Found WLTP: ${val} g/km`);
      return { value: val, standard: 'WLTP' };
    }
  }
  
  // Method 3: NEDC value from HTML table
  // Pattern: CO2 emissions : ... <td class="tabletd_right"> 121 g/km (Mercedes Benz)
  const nedcMatch = html.match(/CO2\s*emissions?\s*:[\s\S]*?tabletd_right[^>]*>\s*(\d+)\s*g\/km/i);
  if (nedcMatch) {
    const val = parseInt(nedcMatch[1]);
    if (val > 0 && val < 1000) {
      console.log(`[CO2] Found NEDC: ${val} g/km`);
      return { value: val, standard: 'NEDC' };
    }
  }
  
  // Method 4: Generic fallback — any number followed by g/km near CO2
  const genericMatch = html.match(/CO2[\s\S]{0,200}?(\d+)\s*g\/km/i);
  if (genericMatch) {
    const val = parseInt(genericMatch[1]);
    if (val > 0 && val < 1000) {
      console.log(`[CO2] Found generic: ${val} g/km`);
      return { value: val, standard: 'unknown' };
    }
  }
  
  return null;
}

// ═══════════════════════════════════════
// Main handler
// ═══════════════════════════════════════
export default async function handler(req, res) {
  const startTime = Date.now();
  
  try {
    const params = { ...(req.query || {}), ...(req.body || {}) };
    const { brand, model } = params;
    const year = parseInt(params.year) || 0;
    const displacement = parseInt(params.displacement) || 0;
    const power = parseInt(params.power) || 0;
    
    if (!brand || !model) {
      return res.status(400).json({ error: 'Missing brand and model' });
    }
    
    // ── Cache key ──
    const cacheKey = `${brand}_${model}_${year}_${displacement}_${power}`.toLowerCase().replace(/\s+/g, '_');
    
    // ── Check cache (permanent — CO2 values don't change) ──
    const sql = await getSQL();
    if (sql) {
      try {
        const rows = await sql`SELECT co2_value, version_name, source_url FROM co2_cache WHERE cache_key = ${cacheKey}`;
        if (rows.length > 0) {
          console.log(`[CO2] CACHE HIT: ${rows[0].co2_value} g/km (${Date.now() - startTime}ms)`);
          return res.status(200).json({
            co2: rows[0].co2_value,
            source: 'ultimatespecs',
            versionName: rows[0].version_name,
            sourceUrl: rows[0].source_url,
            cached: true,
            ms: Date.now() - startTime
          });
        }
      } catch (e) { /* cache miss */ }
    }
    
    const slug = brandSlug(brand);
    console.log(`[CO2] Lookup: ${slug} ${model} | year:${year} disp:${displacement}cc power:${power}PS`);
    
    // ══════════════════════════════════════
    // Step 1: Find model page on Ultimate Specs
    // ══════════════════════════════════════
    const searchTerms = getModelSearchTerms(brand, model);
    let modelPageHtml = null;
    
    for (const term of searchTerms) {
      const tryUrl = `https://www.ultimatespecs.com/car-specs/${slug}-models/${slug}-${term}`;
      try {
        modelPageHtml = await fetchPage(tryUrl);
        console.log(`[CO2] Model found: ${tryUrl}`);
        break;
      } catch (e) {
        console.log(`[CO2] Not at: ${tryUrl} (${e.message})`);
      }
    }
    
    // Fallback: search the brand page for model links
    if (!modelPageHtml) {
      console.log('[CO2] Direct URL failed, searching brand page...');
      try {
        const brandPageHtml = await fetchPage(`https://www.ultimatespecs.com/car-specs/${slug}-models`);
        const firstTerm = searchTerms[0].toLowerCase();
        
        // Find all model links on the brand page
        const modelLinkRegex = /href="(\/car-specs\/[^"]*-models\/[^"]+)"/gi;
        let linkMatch;
        while ((linkMatch = modelLinkRegex.exec(brandPageHtml)) !== null) {
          const linkLower = linkMatch[1].toLowerCase();
          // Check if any search term is in the link
          for (const term of searchTerms) {
            if (linkLower.includes(term.toLowerCase())) {
              const fullUrl = `https://www.ultimatespecs.com${linkMatch[1]}`;
              try {
                modelPageHtml = await fetchPage(fullUrl);
                console.log(`[CO2] Model found via search: ${fullUrl}`);
                break;
              } catch (e) { /* try next */ }
            }
          }
          if (modelPageHtml) break;
        }
      } catch (e) {
        console.log(`[CO2] Brand page failed: ${e.message}`);
      }
    }
    
    if (!modelPageHtml) {
      return res.status(404).json({ error: 'Model not found', brand: slug, model, ms: Date.now() - startTime });
    }
    
    // ══════════════════════════════════════
    // Step 2: Find generation matching the year
    // ══════════════════════════════════════
    const generations = findGenerationUrls(modelPageHtml, year);
    
    if (generations.length === 0) {
      return res.status(404).json({ error: 'No generations found', brand: slug, model, ms: Date.now() - startTime });
    }
    
    // Filter: skip body variants (Variant, Cabrio, Alltrack, etc.)
    const mainGenerations = generations.filter(g => {
      const n = g.name.toLowerCase();
      return !n.includes('variant') && !n.includes('cabrio') && !n.includes('convertible') && 
             !n.includes('alltrack') && !n.includes('sportsvan') && !n.includes('plus') &&
             !n.includes('cross') && !n.includes('wagon');
    });
    const gensToTry = (mainGenerations.length > 0 ? mainGenerations : generations).slice(0, 6);
    
    // Try multiple generations and pick the best match across all
    let bestVersion = null;
    let bestScore = -1;
    const debugGens = [];
    
    for (const gen of gensToTry) {
      const genDebug = { name: gen.name, url: gen.url, versionCount: gen.versionCount };
      try {
        const genUrl = `https://www.ultimatespecs.com${gen.url}`;
        const genPageHtml = await fetchPage(genUrl);
        genDebug.htmlLength = genPageHtml.length;
        
        const result = findBestVersion(genPageHtml, year, displacement, power);
        genDebug.bestMatch = result ? { name: result.version.displayName, score: result.score, year: result.version.year, hp: result.version.hp, disp: result.version.disp } : null;
        
        if (result && result.score > bestScore) {
          bestScore = result.score;
          bestVersion = result.version;
          console.log(`[CO2] Better match in ${gen.name}: ${result.version.displayName} (score: ${result.score})`);
        }
      } catch (e) {
        genDebug.error = e.message;
        console.log(`[CO2] Generation ${gen.name} failed: ${e.message}`);
      }
      debugGens.push(genDebug);
    }
    
    if (!bestVersion) {
      return res.status(404).json({ 
        error: 'No matching version found', 
        brand: slug, model, year, displacement, power,
        generationsChecked: gensToTry.map(g => g.name),
        ms: Date.now() - startTime 
      });
    }
    
    // ══════════════════════════════════════
    // Step 3: Fetch version page and extract CO2
    // ══════════════════════════════════════
    const versionUrl = `https://www.ultimatespecs.com${bestVersion.url}`;
    const versionHtml = await fetchPage(versionUrl);
    const co2Result = extractCO2(versionHtml);
    
    if (!co2Result) {
      return res.status(404).json({ 
        error: 'CO2 not found on version page', 
        version: bestVersion.displayName,
        versionUrl,
        ms: Date.now() - startTime 
      });
    }
    
    // ── Cache result (permanent) ──
    const versionName = bestVersion.displayName;
    if (sql) {
      try {
        await sql`INSERT INTO co2_cache (cache_key, co2_value, source_url, version_name)
          VALUES (${cacheKey}, ${co2Result.value}, ${versionUrl}, ${versionName})
          ON CONFLICT (cache_key) DO UPDATE SET 
            co2_value = ${co2Result.value}, source_url = ${versionUrl}, version_name = ${versionName}`;
        console.log('[CO2] Cached result');
      } catch (e) { console.log('[CO2] Cache write error:', e.message); }
    }
    
    const totalMs = Date.now() - startTime;
    console.log(`[CO2] ✅ ${co2Result.value} g/km (${co2Result.standard}) from ${versionName} in ${totalMs}ms`);
    
    return res.status(200).json({
      co2: co2Result.value,
      standard: co2Result.standard,
      source: 'ultimatespecs',
      versionName,
      sourceUrl: versionUrl,
      cached: false,
      ms: totalMs
    });
    
  } catch (error) {
    console.error('[CO2] Error:', error.message);
    return res.status(500).json({ error: error.message, ms: Date.now() - startTime });
  }
}
