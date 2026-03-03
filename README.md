# Calculadora de Importação THESV 🚗

Vehicle import calculator for THESV - powered by Vercel Serverless Functions.

## 📋 Estrutura

```
calculadora-importacao/
├── api/                          # Vercel serverless functions
│   ├── scrape-vehicle.js        # Scrapes mobile.de & AutoScout24
│   ├── get-co2.js               # CO2 database lookup
│   └── calculate.js             # ISV calculation (Portuguese 2026 rates)
├── data/
│   └── co2-database.json        # 187 vehicle CO2 records
├── src/                         # React components (for Framer integration)
│   ├── components/
│   │   ├── VehicleForm.tsx
│   │   └── ResultsPanel.tsx
│   └── utils/
│       ├── url-scraper.ts
│       └── calculations.ts
├── public/                      # Static files
├── package.json
├── vercel.json                  # Deployment config
├── tsconfig.json
├── next.config.js
└── .env.example

```

## 🚀 Quick Start

### 1️⃣ Clone & Setup

```bash
git clone https://github.com/seu-username/calculadora-importacao.git
cd calculadora-importacao
npm install
```

### 2️⃣ Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3000  # During development
```

### 3️⃣ Run Locally

```bash
npm run dev
```

Visit `http://localhost:3000`

---

## 📡 Deploy to Vercel

### Via GitHub (Recommended)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/seu-username/calculadora-importacao.git
   git push -u origin main
   ```

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project"
   - Select GitHub repository
   - Click "Deploy"

3. **Configure Environment**
   - In Vercel Dashboard → Settings → Environment Variables
   - Add: `NEXT_PUBLIC_API_URL` = your-deployed-url.vercel.app
   - Click "Save"

✅ **Done!** Your app is live. Vercel auto-deploys on every git push.

### Via Vercel CLI

```bash
npm install -g vercel
vercel login
vercel  # follows prompts
```

---

## 🔌 API Endpoints

### 1. Scrape Vehicle Data

**POST** `/api/scrape-vehicle`

```json
{
  "url": "https://suchen.mobile.de/auto-inserat/..."
}
```

**Response:**
```json
{
  "success": true,
  "source": "mobile.de",
  "data": {
    "brand": "BMW",
    "model": "X5",
    "year": 2022,
    "price": 45000,
    "displacement": 3000,
    "fuel": "diesel",
    "co2": 178,
    "power": 195,
    "images": ["data:image/jpeg;base64,...]
  }
}
```

### 2. Lookup CO2

**GET** `/api/get-co2?brand=BMW&model=X5&engine=xDrive30d&year=2022`

**Response:**
```json
{
  "success": true,
  "primary": {
    "brand": "BMW",
    "model": "X5",
    "engine_code": "xDrive30d",
    "co2_wltp": 178,
    "power_kw": 195,
    "displacement_cc": 2993
  },
  "alternatives": [...],
  "totalMatches": 3
}
```

### 3. Calculate ISV

**POST** `/api/calculate`

```json
{
  "price": 45000,
  "co2": 178,
  "age": 2,
  "isPessoaJuridica": false
}
```

**Response:**
```json
{
  "success": true,
  "breakdown": {
    "vehiclePrice": 45000,
    "importCosts": 2250,
    "isv": {
      "base": 6696,
      "vat": 1540.08,
      "total": 8236.08
    }
  },
  "totals": {
    "vehicle": 45000,
    "taxes": 10486.08,
    "final": 55486.08
  },
  "details": {
    "co2": 178,
    "age": 2,
    "isvRate": "15%",
    "ageDiscount": "28%",
    "customerType": "Particular",
    "vatApplied": true
  }
}
```

---

## 🎨 Integration with Framer

To embed the calculator in your Framer website:

### Option A: iFrame

```html
<iframe 
  src="https://seu-dominio.vercel.app"
  width="100%"
  height="800"
  frameborder="0"
></iframe>
```

### Option B: Custom Code Component

Create a Framer custom component:

```tsx
import React from 'react';

export default function CalculadoraWidget() {
  return (
    <iframe
      src={process.env.REACT_APP_CALCULATOR_URL}
      style={{
        width: '100%',
        height: '900px',
        border: 'none',
        borderRadius: '8px'
      }}
    />
  );
}
```

### Option C: Direct React Component

If you want full control, copy the components from `/src/components` directly into Framer.

---

## 📊 CO2 Database

The database includes **187 vehicle records** covering:

- **Brands**: AUDI, BMW, CUPRA, FORD, MERCEDES-BENZ, PEUGEOT, PORSCHE, RENAULT, SEAT, TOYOTA, VOLKSWAGEN, VOLVO
- **Models**: 49 models
- **Engine variants**: Petrol, Diesel, Hybrid, Plug-in Hybrid, Electric

**Location**: `/data/co2-database.json`

To add more vehicles:

1. Edit `/data/co2-database.json`
2. Add entries in the format:
   ```json
   {
     "id": 999,
     "brand": "BRAND",
     "model": "MODEL",
     "engine_code": "Engine designation",
     "displacement_cc": 1999,
     "fuel_type": "gasolina|gasoleo|hibrido|hibrido_plugin|eletrico",
     "co2_wltp": 155,
     "power_kw": 150,
     "year_from": 2024
   }
   ```
3. Commit and push
4. Vercel auto-deploys

---

## 🐛 Troubleshooting

### "Mobile.de scraping fails"
- mobile.de has anti-scraping measures
- Add `User-Agent` header
- Consider AutoScout24 as fallback

### "CORS errors"
- Ensure `NEXT_PUBLIC_API_URL` is set correctly
- Check Vercel function domain

### "CO2 not found"
- Try fuzzy matching on brand/model
- Fall back to manual entry
- Add missing data to database

---

## 📈 Features

✅ **URL Scraping**
- mobile.de support
- AutoScout24 support
- High-resolution image extraction

✅ **CO2 Database**
- 187 real WLTP emissions
- Searchable by brand/model/engine
- Automatic lookup on scrape

✅ **ISV Calculation**
- Portuguese 2026 tax rates
- Age-based discounts
- Pessoa Jurídica vs Particular
- Import costs (€1.5k - €30k)
- VAT calculation

✅ **Responsive Design**
- Dark THESV branding
- Desktop-optimized (960px)
- Mobile-friendly fallback

---

## 📞 Support

For issues or feature requests:
- Create an issue on GitHub
- Email: suporte@theselection.pt

---

**Made with ❤️ for THESV**
