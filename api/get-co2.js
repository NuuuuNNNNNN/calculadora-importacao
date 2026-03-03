import coDatabase from '../data/co2-database.json' assert { type: 'json' };

/**
 * Lookup CO2 emissions for a vehicle
 * GET /api/get-co2?brand=BMW&model=X5&engine=xDrive30d&year=2022
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { brand, model, engine, year, displacement, fuel } = req.query;

    if (!brand || !model) {
      return res.status(400).json({ 
        error: 'brand and model are required' 
      });
    }

    // Normalize inputs
    const normalizedBrand = brand.toUpperCase().trim();
    const normalizedModel = model.toUpperCase().trim();

    // Search in database
    let matches = coDatabase.vehicles.filter(v => 
      v.brand.toUpperCase() === normalizedBrand && 
      v.model.toUpperCase() === normalizedModel
    );

    if (matches.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No matching vehicles found'
      });
    }

    // If engine specified, filter further
    if (engine) {
      const normalizedEngine = engine.toUpperCase().trim();
      const exactMatch = matches.find(m => 
        m.engine_code.toUpperCase() === normalizedEngine
      );
      if (exactMatch) matches = [exactMatch];
    }

    // If year specified, prefer matches close to that year
    if (year && matches.length > 1) {
      const y = parseInt(year);
      matches.sort((a, b) => {
        const distA = Math.abs(a.year_from - y);
        const distB = Math.abs(b.year_from - y);
        return distA - distB;
      });
    }

    // Return best match with all alternatives
    return res.status(200).json({
      success: true,
      primary: matches[0],
      alternatives: matches.slice(1),
      totalMatches: matches.length
    });

  } catch (error) {
    console.error('CO2 lookup error:', error);
    return res.status(500).json({
      error: 'Failed to lookup CO2 data',
      message: error.message
    });
  }
}
