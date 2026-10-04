# Portfolio Tracker — Implementation Plan

Status: **Draft — awaiting decisions** (see [Decision points](#decision-points)).

---

## 1. Goal

A React + Node.js web app where a user can:

1. Enter a stock symbol, number of shares, and the price they bought at
2. Hold multiple stocks (and multiple purchases of the same stock)
3. See current price, market value, and **how much they earned / lost** ($ and %) per position and in total

Deployed automatically with GitHub Actions; frontend hosted for free on GitHub Pages.

---

## 2. Important constraint: GitHub Pages is static-only

GitHub Pages serves **static files only** (HTML/CSS/JS). It cannot run a Node.js server. Limits: ~1 GB published site, ~100 GB/month soft bandwidth, and it is not meant for commercial/SaaS use.

So the React app goes on GitHub Pages, and the Node API (if we keep one) must live elsewhere. Why we want a Node API at all:

- **Hide the market-data API key** — anything bundled into the React app is public
- **Cache quotes** so many page loads don't burn the free-tier rate limit (Finnhub free ≈ 60 calls/min)
- Room to grow: user accounts, database, scheduled price snapshots

---

## 3. Architecture options

| | Option A — Frontend only | **Option B — Pages + Node API (recommended)** | Option C — All on one Node host |
|---|---|---|---|
| Frontend | GitHub Pages | GitHub Pages | Render / Railway / Fly.io |
| Backend | none (browser calls Finnhub directly) | Node/Express on Render free tier (or Cloudflare Worker) | same host as frontend |
| API key | exposed in browser | hidden on server | hidden on server |
| Cost | $0 | $0 | $0 (free tier) |
| Downsides | key leak, no caching, rate limits per user | free tier sleeps after idle → first request ~30–60 s | doesn't use GitHub Pages |
| Matches "React + Node" ask | partially | **yes** | yes |

**Recommendation: Option B.** React on GitHub Pages, small Express API on Render's free tier, Finnhub key stored as a Render env var.

```
 Browser ──► GitHub Pages (React SPA)
    │
    └──fetch──► Node/Express API (Render) ──► Finnhub
                   │  in-memory cache (60 s TTL)
```

---

## 4. Data & storage

**Phase 1 (MVP): browser `localStorage`** — no login, no database. Portfolio lives in the user's browser; CSV export/import as backup.

**Later (optional): accounts + database** — sync across devices. Candidates: Supabase (Postgres + auth, free tier) or SQLite/Postgres on the API host.

### Data model

```ts
type Lot = {
  id: string;          // uuid
  symbol: string;      // "AAPL"
  shares: number;      // 10 (fractional allowed)
  buyPrice: number;    // 172.50 per share
  buyDate: string;     // ISO date
  fees?: number;       // commission
  notes?: string;
};

type Quote = {
  symbol: string;
  price: number;       // current
  change: number;      // today $
  changePct: number;   // today %
  prevClose: number;
  updatedAt: string;
};
```

### Calculations (per symbol, aggregating lots)

- Cost basis = Σ(shares × buyPrice + fees)
- Market value = Σshares × currentPrice
- Gain/Loss $ = market value − cost basis
- Gain/Loss % = gain / cost basis × 100
- Avg cost/share = cost basis / Σshares
- Today's change = Σshares × quote.change
- Portfolio totals = sums of the above; allocation % = position value / total value

---

## 5. Backend API (Node + Express + TypeScript)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | health check (used by CI smoke test & uptime) |
| GET | `/api/quote/:symbol` | current quote for one symbol |
| GET | `/api/quotes?symbols=AAPL,MSFT` | batch quotes |
| GET | `/api/search?q=apple` | symbol lookup / validation |
| GET | `/api/history/:symbol?range=1M` | price history for charts (Phase 3) |

Cross-cutting: CORS limited to the GitHub Pages origin, 60 s in-memory cache, rate limiting (`express-rate-limit`), input validation (`zod`), `helmet`, structured logging.

---

## 6. Frontend (React + Vite + TypeScript)

Screens / components:

- **Dashboard** — summary cards (Total value, Cost basis, Total G/L $/% , Today's change)
- **Holdings table** — symbol, shares, avg cost, price, value, G/L $, G/L %, today; green/red coloring; sortable
- **Add / Edit position form** — symbol (validated via `/api/search`), shares, buy price, date, fees
- **Lot detail** — expand a row to see each individual purchase
- **Charts** — allocation pie, portfolio value over time (Recharts)
- **Settings** — refresh interval, CSV import/export, clear data

Libraries: React Router (HashRouter — works on Pages without 404 hacks), TanStack Query (fetching, caching, auto-refresh), Recharts, zod, a light UI kit (Tailwind or MUI — decision).

Vite config: `base: '/Portfolio_Tracker/'` so assets resolve under the Pages URL.

---

## 7. Repository structure (npm workspaces monorepo)

```
Portfolio_Tracker/
├── package.json              # workspaces: client, server
├── client/
│   ├── src/{components,pages,hooks,lib,types}
│   ├── vite.config.ts
│   └── package.json
├── server/
│   ├── src/{routes,services,middleware}
│   ├── tests/
│   └── package.json
├── docs/PLAN.md
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-client.yml
│   └── deploy-server.yml
└── .editorconfig, .nvmrc, .gitignore, eslint/prettier config
```

---

## 8. CI/CD with GitHub Actions

### `ci.yml` — on every pull request and push
1. Checkout, setup Node 22, `npm ci` (with cache)
2. Lint (ESLint) + format check (Prettier)
3. Type-check (`tsc --noEmit`)
4. Unit tests (Vitest) + coverage
5. Build client and server

### `deploy-client.yml` — on push to `main`
1. Build client with `VITE_API_URL` (repo variable)
2. `actions/upload-pages-artifact` → `actions/deploy-pages`
3. Result: `https://vmudinas.github.io/Portfolio_Tracker/`

### `deploy-server.yml` — on push to `main` when `server/**` changes
1. Run server tests
2. Trigger Render deploy hook (`RENDER_DEPLOY_HOOK` secret)
3. Smoke test: poll `/api/health` until 200

### One-time GitHub setup
- Settings → Pages → Source: **GitHub Actions**
- Settings → Secrets and variables → Actions: `RENDER_DEPLOY_HOOK` (secret), `VITE_API_URL` (variable)
- Branch protection on `main`: require PR + passing CI
- Dependabot for npm and GitHub Actions

### External setup
- Finnhub account → free API key
- Render account → new Web Service from this repo (`server/`), env var `FINNHUB_API_KEY`, `ALLOWED_ORIGIN`

---

## 9. Testing strategy

| Level | Tool | What |
|---|---|---|
| Unit | Vitest | G/L math, lot aggregation, CSV parse, cache logic |
| Component | React Testing Library | form validation, holdings table rendering, colors |
| API | Supertest + mocked Finnhub | routes, validation, caching, error handling |
| E2E (optional) | Playwright | add stock → see G/L, runs in CI against preview build |

---

## 10. Step-by-step roadmap

Each phase ends with a working, deployed increment and a **go / no-go** checkpoint.

| Phase | Deliverable | Est. effort |
|---|---|---|
| **0. Setup** ✅ (in progress) | Feature branch, README, this plan | done |
| **1. Scaffolding** | Monorepo, Vite React app, Express app, lint/format/tsconfig, `ci.yml` green | ~0.5 day |
| **2. Deploy pipeline (hello world)** | Client live on GitHub Pages, server live on Render, `/api/health` smoke test | ~0.5 day |
| **3. Core MVP** | Add/edit/delete positions, localStorage, quotes via API, holdings table with G/L, summary cards | ~1–2 days |
| **4. Quality** | Unit/component/API tests, error & loading states, empty states, responsive layout | ~1 day |
| **5. Charts & extras** | Allocation pie, history chart, CSV import/export, auto-refresh, dark mode | ~1 day |
| **6. Optional: accounts** | Auth + database (Supabase), cross-device sync | ~2 days |
| **7. Optional: polish** | Dividends, realized gains (sells), multiple portfolios, price alerts | TBD |

Getting the pipeline live **before** building features (Phase 2) means every later change ships automatically.

---

## Decision points

Please decide before Phase 1:

1. **Architecture** — Option A (frontend only), **B (Pages + Node API on Render — recommended)**, or C (everything on one host)?
2. **Backend host** (if B) — **Render free** (simple, sleeps when idle), Cloudflare Workers (no sleep, but not Express), or Vercel serverless?
3. **Market data provider** — **Finnhub** (60 calls/min free, recommended), Alpha Vantage (very low daily free quota), Twelve Data, or Polygon?
4. **Storage for MVP** — **localStorage (recommended)** or go straight to accounts + database?
5. **UI styling** — Tailwind CSS or MUI (Material UI)?
6. **Language** — **TypeScript (recommended)** or plain JavaScript?
7. **Repo visibility** — GitHub Pages on a free account requires the repo to be **public**. OK?
