# SumoFlix Scraper API (Node.js + Vercel)

Production-ready Bollywood & Multi-Source Movie/Series Scraper API for SumoFlix.

---

## 🚀 How to Deploy on Vercel (100% Free - Step-by-Step)

### Option A: Via GitHub (Recommended)
1. GitHub par ek new repository banayein (e.g. `sumoflix-scraper-api`).
2. Is folder (`scraper-api`) ki files ko us repository mein upload/push karein:
   ```bash
   cd scraper-api
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/sumoflix-scraper-api.git
   git push -u origin main
   ```
3. [vercel.com](https://vercel.com) par jayein aur login karein.
4. **"Add New Project"** click karein aur apni repo select karein.
5. **Deploy** button dabayein!
6. Vercel aapko ek live link de dega (jaise: `https://sumoflix-scraper-api.vercel.app`).

### Option B: Via Vercel CLI (Super Fast)
```bash
npm install -g vercel
cd scraper-api
vercel
```

---

## 📡 Available API Endpoints

| Endpoint | Method | Description | Example |
| :--- | :--- | :--- | :--- |
| `/` | `GET` | Health check & documentation | `https://your-api.vercel.app/` |
| `/api/stream` | `GET` | Get multi-server streams & Hindi embeds | `/api/stream?tmdb=550&type=movie` |
| `/api/bollyflix` | `GET` | Live Bollywood titles scraper | `/api/bollyflix?q=jawan` |
| `/api/search` | `GET` | Multi-source Hindi/Bollywood search | `/api/search?q=pathaan` |

---

## 🔗 Website Integration
Aap is live Vercel URL ko apni website ke `.env` file mein ya watch player settings mein use kar sakte hain:
```env
VITE_SCRAPER_API_URL=https://your-api.vercel.app
```
Website ka player automatically is scraper ke high-speed servers ko detect kar lega bina kisi purane server ko chhede!
