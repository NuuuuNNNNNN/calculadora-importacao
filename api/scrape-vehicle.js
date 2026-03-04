export default async function handler(req, res) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing url in request body' });
  }

  console.log('[API] URL received:', url);

  try {
    // Extract ad key from URL
    const urlObj = new URL(url);
    const adKey = urlObj.searchParams.get('id');
    
    if (!adKey) {
      return res.status(400).json({ error: 'Invalid mobile.de URL - no id parameter' });
    }

    // TEMPORARY: Return mock data for testing
    const mockVehicle = {
      title: 'BMW 320d - 2019 - 156.000 km',
      price: 18500,
      mileage: 156000,
      year: 2019,
      transmission: 'Manual',
      fuelType: 'Diesel',
      co2: 145,
      location: 'Munich, Germany',
      image: 'https://via.placeholder.com/800x600?text=BMW+320d',
      url: url
    };

    console.log('[API] Mock vehicle data returned');

    res.status(200).json(mockVehicle);

  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({
      error: 'Failed to scrape vehicle data',
      message: error.message
    });
  }
}
