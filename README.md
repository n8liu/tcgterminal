# TCGTerminal

A full-stack Pokémon trading card price tracker and market analytics tool. It ingests catalog data and market pricing from TCG API, matching them with verified eBay sold listings and graded slab comps (PSA, BGS, CGC, SGC).

---

## Features

### Catalog & Search
- Over 32,800 English and Japanese cards across 237+ sets.
- Tracks multiple printing variants (Holofoil, Reverse Holo, 1st Edition, Unlimited).
- Search and filter by set, card number, name, and sealed product status.

### Market Movers
- 24-hour, 7-day, and 30-day top price gainers and decliners.
- In-memory stale-while-revalidate (SWR) cache on the backend to handle upstream rate limits smoothly.

### Grading Arbitrage Calculator
- Compares raw card market prices against PSA 10 and PSA 9 comps to calculate potential grading profits and ROI.
- Includes adjustable grading fee presets (PSA Bulk, Value, Regular, CGC/SGC) and break-even safety filters.

### Sealed Product Signals
- Multi-factor scoring model for booster boxes, ETBs, and bundles based on supply scarcity, buylist liquidity, price momentum, and set age.
- Generates rating tiers from Underperform to Strong Buy.

### Volume Leaderboard
- Tracks aggregated market transaction value across top Pokémon characters with Year-over-Year momentum comparisons.

### Live Comps Feed
- Real-time feed of recent price observations, raw sales, and graded slab comps with auto-refresh support.

---

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS, Recharts, TypeScript
- **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, Celery
- **Database & Cache**: PostgreSQL 16, Redis 7 (rate limiting + shared token caching)
- **Data Sources**: [TCG API](https://tcgapi.dev) (Catalog & Pricing), eBay Browse API (Comps)

---

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Python 3.11+
- Node.js 20+

### 1. Environment Setup

Clone the repository and create your `.env` file:

```bash
git clone https://github.com/n8liu/tcgterminal.git
cd tcgterminal
cp .env.example .env
```

Add your API keys in `.env`:
- `TCGAPI_API_KEY`: API key from [tcgapi.dev](https://tcgapi.dev)
- `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET`: eBay developer credentials (optional)

### 2. Start PostgreSQL and Redis

```bash
docker compose up -d
```

### 3. Setup the Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Sync the card catalog (English & Japanese sets)
python -m jobs.sync_catalog --all

# Start the API server
uvicorn app.main:app --reload --port 8000
```

### 4. Setup the Frontend

```bash
cd ../frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

---

## Background Jobs

To run price collection and comp scraping jobs:

```bash
cd backend
source .venv/bin/activate

# Single batch run
python jobs/cycle_prices.py --tcg-limit 20 --ebay-limit 5

# Continuous background daemon
python jobs/cycle_prices.py --continuous --interval 60 --tcg-limit 15 --ebay-limit 5
```

---

## Testing

```bash
# Backend pytest suite
cd backend
.venv/bin/pytest

# Frontend checks
cd ../frontend
npm run typecheck
npm run build
```

---

## License

MIT
