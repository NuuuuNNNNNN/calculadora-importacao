# 🚀 Deploy da Calculadora para Vercel

Seguiste estes passos **exatos** para fazer deploy:

## Passo 1: Preparar no GitHub

### A. Clonar a estrutura

```bash
# Na tua máquina local:
git clone https://github.com/seu-username/calculadora-importacao.git
cd calculadora-importacao
```

### B. Copiar ficheiros de /agent/home/calculadora-vercel/

```bash
# Copiar tudo de calculadora-vercel para o repositório
cp -r /agent/home/calculadora-vercel/* .
```

### C. Fazer commit inicial

```bash
git add .
git commit -m "Initial commit: Vercel setup with APIs and CO2 database"
git push origin main
```

---

## Passo 2: Conectar a Vercel

### Opção A: Via Dashboard (Recomendado - 1 minuto)

1. Go to [vercel.com](https://vercel.com) (login se necessário)
2. Click **"Add New"** → **"Project"**
3. Select **"Import Git Repository"**
4. Search for `calculadora-importacao`
5. Click **"Import"**
6. Leave defaults, click **"Deploy"**
7. **Esperar 2-3 minutos** ⏳

✅ **Pronto!** App é live em `calculadora-importacao.vercel.app`

### Opção B: Via CLI

```bash
# Instalar Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow prompts:
# - Link to existing project? No
# - Project name? calculadora-importacao
# - Framework? Next.js
# - Deploy? Yes
```

---

## Passo 3: Configurar Variáveis de Ambiente

No **Vercel Dashboard**:

1. Go to **"Calculadora Importação"** Project
2. Click **"Settings"**
3. Click **"Environment Variables"**
4. Add:
   ```
   NEXT_PUBLIC_API_URL = https://calculadora-importacao.vercel.app
   ```
5. Click **"Save"**
6. Click **"Deployments"** → last deployment → **"Redeploy"**

✅ **Pronto!** API URLs estão configurados

---

## Passo 4: Testar

```bash
# Test via curl
curl -X GET "https://calculadora-importacao.vercel.app/api/get-co2?brand=BMW&model=X5"

# Response:
{
  "success": true,
  "primary": {
    "brand": "BMW",
    "model": "X5",
    "co2_wltp": 178,
    ...
  }
}
```

---

## Passo 5: Integrar no Framer

### Opção 1: iFrame (Mais Simples)

No Framer, adiciona um **Custom Component**:

```tsx
import React from 'react';

export default function Calculadora() {
  return (
    <iframe
      src="https://calculadora-importacao.vercel.app"
      width="100%"
      height="900"
      style={{ border: 'none', borderRadius: '8px' }}
    />
  );
}
```

### Opção 2: API Calls (Mais Controlo)

```tsx
const response = await fetch(
  'https://calculadora-importacao.vercel.app/api/calculate',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price: 45000,
      co2: 178,
      age: 2,
      isPessoaJuridica: false
    })
  }
);
const data = await response.json();
```

---

## ✅ Checklist

- [ ] Repositório GitHub criado
- [ ] Ficheiros importados
- [ ] Commit feito e push
- [ ] Vercel deployment completo
- [ ] Variáveis de ambiente configuradas
- [ ] APIs testadas
- [ ] Integração no Framer feita
- [ ] Live em produção! 🎉

---

## 🔄 Atualizações Futuras

**Para atualizar o código:**

```bash
# 1. Edit files locally
nano api/calculate.js  # example

# 2. Commit
git add .
git commit -m "Fix: updated ISV calculation"

# 3. Push
git push origin main

# Vercel auto-deploys em 1-2 minutos ✨
```

---

## 🆘 Troubleshooting

| Problema | Solução |
|----------|---------|
| **"Build failed"** | Check Vercel logs → rebuild |
| **"CO2 API returns 404"** | Verify brand/model spelling (case-sensitive) |
| **"CORS error in iframe"** | Ensure `NEXT_PUBLIC_API_URL` is set |
| **"Images not loading"** | Check mobile.de still has images (URLs expire) |

---

## 📞 Suporte

- **Vercel docs**: [vercel.com/docs](https://vercel.com/docs)
- **Next.js docs**: [nextjs.org](https://nextjs.org)
- **API reference**: See `/api` folder

---

**🎯 Meta: Pronto para produção em < 5 minutos!**
