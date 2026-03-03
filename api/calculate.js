/**
 * Calculate ISV (vehicle tax) and import costs for Portugal
 * POST /api/calculate
 * Body: {
 *   price: number,
 *   co2: number,
 *   age: number,
 *   isPessoaJuridica: boolean
 * }
 */
export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { price, co2, age, isPessoaJuridica = false } = req.body;

    if (!price || !co2 || age === undefined) {
      return res.status(400).json({
        error: 'price, co2, and age are required'
      });
    }

    const result = calculateISV(
      parseFloat(price),
      parseInt(co2),
      parseInt(age),
      isPessoaJuridica
    );

    return res.status(200).json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Calculation error:', error);
    return res.status(500).json({
      error: 'Failed to calculate ISV',
      message: error.message
    });
  }
}

function calculateISV(basePrice, co2, ageYears, isPessoaJuridica) {
  // 2026 Portuguese ISV rates by CO2
  const CO2_BRACKETS_2026 = [
    { min: 0, max: 95, rate: 0.05 },      // 5%
    { min: 96, max: 120, rate: 0.07 },    // 7%
    { min: 121, max: 160, rate: 0.10 },   // 10%
    { min: 161, max: 200, rate: 0.15 },   // 15%
    { min: 201, max: null, rate: 0.20 }   // 20%
  ];

  // Age discount brackets (2026)
  const AGE_DISCOUNTS = [
    { minYears: 0, maxYears: 1, discount: 0.00 },      // 0%
    { minYears: 1, maxYears: 2, discount: 0.20 },      // 20%
    { minYears: 2, maxYears: 3, discount: 0.28 },      // 28%
    { minYears: 3, maxYears: 4, discount: 0.35 },      // 35%
    { minYears: 4, maxYears: 5, discount: 0.40 },      // 40%
    { minYears: 5, maxYears: 10, discount: 0.50 },     // 50%
    { minYears: 10, maxYears: null, discount: 0.60 }   // 60%
  ];

  // Find CO2 bracket
  const co2Bracket = CO2_BRACKETS_2026.find(b => 
    co2 >= b.min && (b.max === null || co2 <= b.max)
  );

  if (!co2Bracket) {
    throw new Error('Invalid CO2 value');
  }

  // Find age discount
  const ageDiscount = AGE_DISCOUNTS.find(a =>
    ageYears >= a.minYears && (a.maxYears === null || ageYears < a.maxYears)
  );

  if (!ageDiscount) {
    throw new Error('Invalid age value');
  }

  // Calculate ISV base
  const isvRate = co2Bracket.rate;
  const ageDiscountPercent = ageDiscount.discount;
  
  // ISV = basePrice × rate × (1 - ageDiscount)
  const isvBeforeTax = basePrice * isvRate * (1 - ageDiscountPercent);

  // Import costs: 5% with floor €1,500 and ceiling €30,000
  const importCosts = Math.min(
    Math.max(basePrice * 0.05, 1500),
    30000
  );

  // VAT (23%) on ISV
  const vat = isvBeforeTax * 0.23;

  // Total ISV (before or after VAT depending on type)
  const isvTotal = isPessoaJuridica ? isvBeforeTax : isvBeforeTax + vat;

  // Total cost
  const totalCost = basePrice + isvTotal + importCosts;

  return {
    breakdown: {
      vehiclePrice: Math.round(basePrice * 100) / 100,
      importCosts: Math.round(importCosts * 100) / 100,
      isv: {
        base: Math.round(isvBeforeTax * 100) / 100,
        vat: isPessoaJuridica ? 0 : Math.round(vat * 100) / 100,
        total: Math.round(isvTotal * 100) / 100
      }
    },
    totals: {
      vehicle: Math.round(basePrice * 100) / 100,
      taxes: Math.round((isvTotal + importCosts) * 100) / 100,
      final: Math.round(totalCost * 100) / 100
    },
    details: {
      co2: co2,
      age: ageYears,
      isvRate: `${(isvRate * 100).toFixed(0)}%`,
      ageDiscount: `${(ageDiscountPercent * 100).toFixed(0)}%`,
      customerType: isPessoaJuridica ? 'Empresa' : 'Particular',
      vatApplied: !isPessoaJuridica
    }
  };
}
