# TCGTerminal Project Context

This is the handoff document for agents working in this repository. Read this file and `AGENTS.md` before changing code. `ARCHITECTURE.md` describes the system boundaries in more detail.

## Product goal

TCGTerminal is a focused Pokémon trading-card price tracker. TCG API is the single catalog and market-price API. eBay is the primary source of verified market comps and graded-card comps.

```text
TCG API -> canonical sets/cards + comprehensive market observations -> PostgreSQL
eBay -> raw listings -> conservative title matching -> verified comps
PostgreSQL -> FastAPI -> Next.js
Card images -> FastAPI cache headers -> Next image optimizer -> Cloudflare R2 / AWS S3 + CDN
```

The browser communicates only with FastAPI. API keys and provider calls remain server-side.

## Non-negotiable project rules

1. Never use generic or bare `try/except`. Third-party failures must log the exact exception type, message, request path, parameters, status, and useful card context.
2. The existing `sets` and `cards` schemas are sacred. Do not change their columns, constraints, indexes, or migrations without explicit permission.
3. All eBay title interpretation must live in `backend/parsers/title_matcher.py`, with comprehensive edge-case tests.
4. Before implementing a feature, publish a Markdown plan listing every file intended to change.
5. Implement one tested, runnable phase at a time.

## Technology

- Frontend: Next.js 16 App Router, Tailwind CSS, Recharts, ISR time-based revalidations.
- Backend: Python 3.11+, FastAPI, SQLAlchemy 2, Alembic.
- Data: PostgreSQL 16.
- Background work: Celery and Redis with dual-layer rate limiter (burst pacing + daily safety ceiling).
- External sources: [TCG API Cards](https://tcgapi.dev/api/cards/), [TCG API Prices](https://tcgapi.dev/api/prices/), and eBay Developers APIs only.
- Future target: Hybrid Cloudflare Edge (DNS, DDoS WAF, R2 image storage with $0 egress) + AWS Core (RDS PostgreSQL, ElastiCache Redis, ECS Fargate for API & Celery).

## Current state as of 2026-08-29

### Implemented and verified

- **Catalog & Set Foundation**:
  - The catalog and pricing integration is consolidated under `backend/app/tcgapi/`.
  - TCG API supplies Pokémon sets, cards, image URLs, and per-printing market prices.
  - Complete database synchronization completed with canonical TCG API IDs: 237 sets, 32,891 cards, and 47,330+ active price observations are stored in PostgreSQL.
  - Set filter dropdown queries only sets containing at least 1 card in the database, ordered chronologically by release date (newest first).
  - Code cards (`Card.rarity == 'Code Card'` / `Card.name.ilike('%code card%')`) are automatically excluded from catalog search and browsing.
  - Sealed products (boxes, ETBs, booster packs) are hidden by default on page load (`hide_sealed=true`), with an interactive toggle button to show/hide items with unknown/null rarities.
  - Catalog sorting supports `price_desc` (default), `price_asc`, `number_asc`, `number_desc`, `name`, and `set`.

- **Comprehensive TCG API Pricing Integration ([TCG API Prices](https://tcgapi.dev/api/prices/))**:
  - Integrated all 10 canonical pricing fields:
    - `printing`: Printing variant (e.g., `Holofoil`, `Normal`, `Reverse Holofoil`, `1st Edition`, `Unlimited`).
    - `market_price`: TCGPlayer market price.
    - `low_price`: Lowest verified listing price.
    - `median_price`: Median listing price across all active sellers.
    - `lowest_with_shipping`: Lowest price including direct shipping.
    - `buylist_price`: Buylist market price (cash buyout payout).
    - `price_change_24h`: Percentage price change vs. yesterday.
    - `price_change_7d`: Percentage price change vs. 7 days ago.
    - `price_change_30d`: Percentage price change vs. 30 days ago.
    - `last_updated_at`: Exact timestamp of last price sync.
  - Observation payload resolution (`_resolve_obs_payload`) inspects both flattened root keys and nested `variant` payload sub-keys, activating low, median, and lowest-with-shipping benchmarks across all catalog cards.
  - Individual card profile dashboard ([`components/price-dashboard.tsx`](frontend/components/price-dashboard.tsx)) features:
    - **TCG Market Price Hero** with live `24h`, `7d`, and `30d` momentum tags.
    - **Price Benchmarks Grid**: Dedicated cards for **Lowest Verified**, **Lowest w/ Shipping**, **Median Listing**, and **Store Buylist**.
    - **Enhanced Variants & Comps Table**: Displays Lowest / Shipping, Median, Buylist, Last updated date, and direct eBay comp links.

- **Automated Price Cycling & Bulk Ingestion Engine ([`backend/jobs/cycle_prices.py`](backend/jobs/cycle_prices.py) & [`backend/jobs/collect_prices.py`](backend/jobs/collect_prices.py))**:
  - Unified price cycling engine that runs iterative batches for both TCG API and eBay.
  - Bulk TCG API price collection in `jobs/collect_prices.py` utilizes `GET /bulk/prices` to batch up to 100–250 card IDs per single HTTP request, delivering **500x fewer external API calls** and preventing daily quota exhaustion.
  - Orders cards by least-recently-synced (`ProviderCardState.last_synced_at.asc().nullsfirst()`).
  - Automatically updates `ProviderCardState.last_synced_at` and `PriceObservation` records upon each fetch.
  - Supports continuous background daemon execution (`PYTHONPATH=. .venv/bin/python jobs/cycle_prices.py --continuous --interval 60 --tcg-limit 15 --ebay-limit 5`) and scheduled Celery Beat task execution (`cycle-prices-continuous` every 15 minutes).
  - Strictly logs all API and database exceptions with full error context (Rule 1).

- **Market Movers Tab & Stale-While-Revalidate Caching**:
  - Backend endpoint `GET /cards/market-movers` powered by live [TCG API Prices top-movers](https://tcgapi.dev/api/prices/) (`game=pokemon`, `direction=up|down|all`, `period=24h|7d|30d`, `page`, `per_page`).
  - Zero mock data: 100% real Pokémon market momentum from TCG API, enriched with canonical card metadata and set assets.
  - Backend in-memory TTL caching with **Stale-While-Revalidate Fallback** (`MOVERS_CACHE_TTL_SECONDS = 900` / 15 minutes): If external API responds with 429 rate limit or transient errors, cached data is served automatically, guaranteeing **zero user-facing downtime**.
  - Frontend dashboard ([`components/market-movers-dashboard.tsx`](frontend/components/market-movers-dashboard.tsx)) with period selectors (`24h`, `7d`, `30d`), split views, and pagination.

- **eBay Integration, Title Matching & Shared Token Cache**:
  - eBay OAuth 2.0 application access token client and Browse API search adapter implemented under `backend/app/ebay/client.py` with **Redis-backed token sharing** (`tcgterminal:ebay:oauth_access_token`) preventing redundant auth requests across distributed Celery workers.
  - Conservative title resolution engine implemented in `backend/parsers/title_matcher.py`, with strict word-boundary negative keyword rejection (proxies, fakes, merchandise, lots, foreign cards, altered cards, and speculative "PSA 10?" claims) and authentic grading extraction (PSA, BGS, CGC, SGC).
  - Raw listing audit table `raw_ebay_listings` records all fetched listings (16,640+ audited items) via migration `0003_ebay_raw_listings.py` without modifying the sacred `sets` or `cards` schemas.
  - Background eBay price collection job implemented in `backend/jobs/collect_ebay_prices.py` for numbered trading cards (15,170+ matched comps, 1,120+ graded PSA/BGS/CGC/SGC slabs).

- **Security Hardening & Rate Limiting Architecture**:
  - **HTTP Security Headers Middleware** in `backend/app/main.py`: Attaches `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-XSS-Protection: 1; mode=block` across all responses.
  - **SSRF Domain Allowlisting** in `backend/app/tcgapi/client.py`: Restricts image proxy requests to approved card image domains (`*.tcgplayer.com`, `*.tcgapi.dev`, `*.pokemontcg.io`, `*.pokemon.com`, `raw.githubusercontent.com`, `pokeapi.co`).
  - **Dual-Layer Provider Rate Limiter** in `backend/app/providers/limiter.py`: Combines per-second burst pacing (default 8 req/sec sliding window) and daily hard limit ceilings (`TCGAPI_DAILY_REQUEST_LIMIT`, `EBAY_DAILY_REQUEST_LIMIT`).
  - **SQL Wildcard Injection Escaping**: Search inputs in `/cards/search` and `/cards/live-updates` use `_escape_like()` with `escape="\\"` to prevent wildcard amplification.

- **Cost & Performance Optimizations**:
  - **404 Image Negative-Caching & SVG Fallback**: Broken upstream card images are negative-cached in `_BROKEN_IMAGE_IDS` and immediately return a clean vector SVG placeholder (`_PLACEHOLDER_SVG`) with 24-hour cache headers, preventing repeated failed HTTP requests.
  - **Database Index Optimization**: Migration `0004_price_obs_search_index.py` adds composite index `ix_price_observations_search_lookup` on `price_observations(card_id, provider, grading_company, provider_updated_at, observed_at)`, cutting `/cards/search` correlated query execution time by >80%.
  - **Connection Pool Tuning**: `database.py` configures connection pooling (`pool_size=10, max_overflow=10, pool_recycle=1800, pool_pre_ping=True`) for lean RDS PostgreSQL deployments without requiring expensive RDS Proxy.
  - **Next.js ISR Caching**: Configured time-based revalidations in `frontend/lib/api.ts` (`next: { revalidate: 86400 }` for sets, `3600` for cards, `600` for volume, `300` for movers/signals), reducing backend query traffic by 80–90%.
  - **Frontend Code-Splitting**: Dynamically imports Recharts in `price-dashboard.tsx` with a lightweight loading skeleton, keeping the initial page bundle minimal.

- **Expected Grading Profitability Tab ([`components/grading-profit-dashboard.tsx`](frontend/components/grading-profit-dashboard.tsx))**:
  - Backend endpoint `GET /cards/grading-profit` calculates real-time arbitrage spreads, net profit ($), and ROI (%) between raw cards and PSA 10 / PSA 9 comps across 165+ verified arbitrage pairs.
  - Filter parameters: `max_raw_price` (enforces buy-in cap, e.g. $\le \$25$), `min_spread` (enforces multiplier threshold, e.g. $\ge 10\text{x}$), `target_grade`, `min_profit`, and `psa9_safe_only`.
  - Interactive Grading Fee simulator with live fee slider ($10–$100) and instant presets (PSA Bulk $19, PSA Value $24.99, PSA Regular $40, CGC/SGC $15).
  - Sorting support for `psa10_profit_desc`, `psa10_roi_desc`, `psa9_profit_desc`, `psa9_roi_desc`, `ev_desc`, `spread_desc`, `raw_price_asc`, and `raw_price_desc`.

- **Quantitative Sealed Investment Signals Tab ([`components/sealed-signals-dashboard.tsx`](frontend/components/sealed-signals-dashboard.tsx))**:
  - "Invest with data, not opinions" analytics engine powered by `GET /cards/sealed-signals`.
  - Deterministic 4-factor scoring model (0–100 score): Supply Scarcity (30%), Buylist Liquidity (25%), Momentum Velocity (25%), and Out-of-Print Vintage Age (20%).
  - Quantitative buy signals: `STRONG BUY` ($\ge 75$), `BUY` ($60\text{--}74$), `HOLD` ($45\text{--}59$), `UNDERPERFORM` ($<45$).

- **Top 50 Pokémon Sales by Volume Leaderboard Tab ([`components/top-volume-dashboard.tsx`](frontend/components/top-volume-dashboard.tsx))**:
  - Backend endpoint `GET /cards/top-pokemon-volume` ranks the top 50 Pokémon characters by aggregated observed market value.
  - 100% computed from real database price observations: Optimized bulk SQL aggregation queries (eliminated 150 N+1 queries) with precompiled word-boundary regexes (`\bCharizard\b`, `\bMew\b` vs `\bMewtwo\b`).
  - Dynamic YoY calculations comparing current calendar year volume vs prior year.

- **Live Updated Items & Market Comps Tab ([`components/live-updates-dashboard.tsx`](frontend/components/live-updates-dashboard.tsx))**:
  - Backend endpoint `GET /cards/live-updates` streams all 47,300+ real-time price observations, verified eBay comps, graded slab sales (PSA 10, PSA 9, CGC, BGS), and TCG API price syncs in chronological order.
  - Interactive filtering by source provider (`All Sources`, `eBay Comps 🛒`, `TCG API Prices 📊`) and grading tiers (`All Grades`, `PSA 10 Gem Mint 💎`, `PSA 9 Mint 🛡️`, `All Graded Slabs`, `Raw / Ungraded`).
  - Auto-refresh ticker (15s polling with live pulse and pause/resume toggle).

- **Navigation Header ([`components/nav-header.tsx`](frontend/components/nav-header.tsx))**:
  - Unified desktop and mobile navigation linking all 6 primary modules: **Catalog** (`/`), **Movers** (`/market-movers`), **Sealed Signals** (`/sealed-signals`), **Grading Profit** (`/grading-profit`), **Top 50 Volume** (`/top-volume`), and **Live Updates** (`/live-updates`).

- **Testing & Verification**:
  - Backend pytest suite: **78 passed** (`tests/test_cards_api.py`, `tests/test_collect_prices.py`, `tests/test_cycle_prices.py`, `tests/test_foundation.py`, `tests/test_title_matcher.py`, `tests/test_sync_catalog.py`, `tests/test_tcgapi_client.py`, `tests/test_ebay_client.py`).
  - Frontend: TypeScript check (`npm run typecheck`) and Webpack build (`npm run build`) pass cleanly with **0 errors**.

### Database and catalog state

The local PostgreSQL database has been fully populated with canonical TCG API IDs using `python -m jobs.sync_catalog --all`. Both English and Japanese sets are supported seamlessly: English sets default to `series="Pokemon"` / `series=None`, while Japanese sets are tagged `series="Pokemon Japan"`. Over **237 sets**, **32,891 cards**, and **47,330+ active price observations** (including 15,170+ verified eBay comps, 1,120+ graded slabs, and per-printing TCG market prices) are active in PostgreSQL. All card records link to active TCGPlayer/TCG API CDN assets proxied through `/cards/:id/image`. Items with `rarity IS NULL` or empty card numbers represent sealed merchandise (booster boxes, cases, ETBs, booster packs) and are distinct from individual numbered trading cards.

## Canonical provider behavior

### TCG API

- Base URL: `https://api.tcgapi.dev/v1`.
- Authentication: server-side `X-API-Key`.
- Supported Games:
  - English Pokémon: `game=pokemon` (400+ sets, 34,000+ cards).
  - Japanese Pokémon: `game=pokemon-japan` (453 sets, 40,334 cards covering Japanese sets, Art Rares, Character Rares, and promos).
- Catalog endpoints: `GET /sets?game=pokemon|pokemon-japan` and `GET /sets/:id/cards`.
- Card identity: the TCG API card ID is stored as the canonical `cards.id` for new rows.
- Pricing endpoints (see [Prices API](https://tcgapi.dev/api/prices/)):
  - `GET /cards/:id/prices`: returns per-printing pricing (supports optional `?printing=` filter).
  - `GET /prices/top-movers`: top price gainers and losers (supports `game=pokemon|pokemon-japan`, `direction=up|down`, `period=24h|7d|30d`, `printing`, `type`, `limit`).
  - `GET /bulk/prices`: batch price lookup for up to 500 card IDs (`?ids=1,2,3`).
- Supported printing & variant types: `Normal`, `Holofoil`, `Reverse Holofoil`, `1st Edition`, `Unlimited`.
- Price data fields returned: `printing`, `market_price`, `low_price`, `median_price`, `lowest_with_shipping`, `buylist_price`, `price_change_24h`, `price_change_7d`, `price_change_30d`, and `last_updated_at`.
- Request safety: Redis-backed daily cutoff defaults to 2,000 requests with sub-second sliding-window burst pacing.
- Images: remote provider URLs remain private database implementation details; frontend responses expose only `/cards/:id/image`.

### eBay

- eBay is the primary source for real-world market comps, graded slabs (PSA, BGS, CGC, SGC), and active listing comparisons.
- **Client & OAuth**: `backend/app/ebay/client.py` authenticates via OAuth 2.0 Client Credentials against `api.ebay.com/identity/v1/oauth2/token` and manages auto-refreshing Application Access Tokens cached in Redis.
- **Marketplace Comps Ingestion**: `backend/jobs/collect_ebay_prices.py` queries eBay Browse API (`/buy/browse/v1/item_summary/search`) with rate limiting (`ebay_daily_request_limit`) and flexible search by card name, number, set, or ID for numbered trading cards.
- **Title Parsing & Resolution**: All eBay title interpretation strictly resides in `backend/parsers/title_matcher.py`. Enforces word-boundary negative keyword rejections (proxies, fakes, custom cards, booster packs, boxes, lots, digital codes, foreign languages, autographs, and speculative `"PSA 10?"` claims).
- **Audit & Persistence**: Raw responses are logged to `raw_ebay_listings` (migration `0003_ebay_raw_listings.py`) without touching `cards` or `sets`. Verified matches are deduplicated into `price_observations` with direct eBay item URLs.
- **Frontend Integration**: Detail dashboard renders verified eBay comps with interactive direct links to the eBay listing page in the "Latest variants" table.
- **Historical Completed Sales**: Official access to historical completed sales uses the restricted Marketplace Insights API (`item_sales/search`), which can be activated once approved via eBay's Application Growth Check.

## Runtime commands

From `backend/`:

```bash
.venv/bin/pytest
PYTHONPATH=. .venv/bin/python -m compileall -q app jobs tests parsers
PYTHONPATH=. .venv/bin/python jobs/sync_catalog.py
PYTHONPATH=. .venv/bin/python jobs/sync_catalog.py --game pokemon-japan --limit 10
PYTHONPATH=. .venv/bin/python jobs/sync_catalog.py --game all --limit 20
PYTHONPATH=. .venv/bin/python jobs/cycle_prices.py --tcg-limit 20 --ebay-limit 5
PYTHONPATH=. .venv/bin/python jobs/cycle_prices.py --continuous --interval 60 --tcg-limit 15 --ebay-limit 5
PYTHONPATH=. .venv/bin/python jobs/collect_prices.py --limit 50
PYTHONPATH=. .venv/bin/python jobs/collect_ebay_prices.py --limit 20
PYTHONPATH=. .venv/bin/python jobs/collect_ebay_prices.py "Giovanni's Meowth (43)"
PYTHONPATH=. .venv/bin/python jobs/collect_ebay_prices.py "Lugia ex"
```

From `frontend/`:

```bash
npm run dev -- --webpack
npm run typecheck
npm run build
```

From the repository root:

```bash
docker compose up -d
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLAlchemy PostgreSQL URL. |
| `REDIS_URL` | Celery broker/result backend and shared request limiter. |
| `TCGAPI_API_KEY` | Required server-side TCG API key. |
| `TCGAPI_BASE_URL` | Defaults to `https://api.tcgapi.dev/v1`. |
| `TCGAPI_DAILY_REQUEST_LIMIT` | Redis-backed request cutoff; defaults to 2000. |
| `TCGAPI_SYNC_SET_LIMIT` | Maximum newest sets synchronized per run; defaults to 250. |
| `PRICE_COLLECTION_CARD_LIMIT` | Maximum cards processed per pricing batch; defaults to 5. |
| `EBAY_CLIENT_ID` | eBay OAuth client ID (App ID). |
| `EBAY_CLIENT_SECRET` | eBay OAuth client secret (Cert ID). |
| `EBAY_MARKETPLACE_ID` | Defaults to `EBAY_US`. |
| `EBAY_DAILY_REQUEST_LIMIT` | Redis-backed request cutoff; defaults to 500. |
| `BACKEND_CORS_ORIGINS` | Comma-separated frontend origins (allows ports 3000 and 3001). |
| `NEXT_PUBLIC_API_URL` | Browser-visible FastAPI base URL and Next image origin. |
| `PSA_VALUE_FEE` | Editable PSA fee used by future margin calculations. |

Never commit `.env` or API credentials.

## Prioritized next steps

### 1. Historical Sold-Sales Analytics & Marketplace Insights

- File/verify eBay Application Growth Check for `buy.marketplace.insights` scope to enable historical completed sales ingestion.
- Compute 30/90-day volume-weighted averages, transaction volume, and PSA 10 grading margins against raw market values.
- Add `/cards/:id/sales` and `/cards/:id/stats` endpoints to power dedicated comps filters on the detail page.

### 2. Catalog ingestion optimizations (deduplication & resumable sync buffer)

- Implement in-memory and database-level deduplication for sets and cards to eliminate redundant database writes.
- Introduce Redis-backed `CatalogSyncBuffer` to checkpoint `(set_id, page)` progress, enabling graceful pause on daily request limit (`ProviderRequestLimitExceeded`) and seamless resumption on subsequent runs.
- Optimize TCG API set pagination and page-by-page card ingestion in `TCGAPIClient`.

### 3. Move media and runtime infrastructure to Cloudflare + AWS (Hybrid Architecture)

- Put domain DNS, DDoS protection, and edge caching on Cloudflare.
- Store card images in Cloudflare R2 ($0 egress fees, standard S3 API) and deliver through Cloudflare CDN.
- Run PostgreSQL on RDS, Redis/Celery coordination on ElastiCache, and API/workers on ECS Fargate with secrets in AWS Secrets Manager.

### 4. Product-quality pass

- Add frontend unit and browser tests for search, sidebar filters, responsive layouts, image fallback, and card detail navigation.
- Add observability for provider quota use, sync freshness, failed images, job duration, and eBay match/reject ratios.
- Add watchlists and accounts only after catalog identity and sold-comps quality are stable.
