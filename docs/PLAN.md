# Portfolio Tracker — Implementation Plan

Status: **Decisions made (2026-10-04). Phases 1–2 on `feature/initial-plan`; Phase 3 (core MVP) on `feature/core-mvp`.**

---

## 1. Goal

A React web app where a user can:

1. Enter a stock symbol, number of shares, and the price they bought at
2. Hold multiple stocks (and multiple purchases of the same stock)
3. See current price, market value, and **how much they earned / lost** ($ and %) per position and in total
4. Switch between several **profiles** (e.g. "Me", "Wife", "Retirement") without logging in

Deployed automatically with GitHub Actions to GitHub Pages (free static hosting).

---

## 2. Decisions

| #   | Topic        | Decision                                                                                                                                                                        |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Architecture | **Client-only static site** on GitHub Pages. No Node API for now; code is structured so an API can be added later.                                                              |
| 2   | Data storage | **Browser `localStorage`** (portfolio, profiles, settings). JSON export/import for backup and moving between devices.                                                           |
| 3   | Accounts     | **No login.** Local **profiles** with a switcher; each profile has its own holdings.                                                                                            |
| 4   | Market data  | **Finnhub** (free tier) behind a provider interface so others can be plugged in. Each user enters their **own free Finnhub key** in Settings; it is kept only in their browser. |
| 5   | Styling      | **Tailwind CSS v4**                                                                                                                                                             |
| 6   | Language     | **TypeScript**                                                                                                                                                                  |
| 7   | Repo         | Public (required for free GitHub Pages) — already public.                                                                                                                       |

### Why Finnhub (vs. "more than 60 requests/min")

| Provider                | Free limit                     | Notes                                                                                                                      |
| ----------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Finnhub**             | 60 calls/min                   | Read-only token, browser-friendly, free WebSocket for live trades. **Chosen.**                                             |
| Alpaca                  | 200 calls/min, batch snapshots | IEX-only prices; needs key **+ secret** in headers — unsafe to put in a browser app. Good candidate once we add a backend. |
| Twelve Data             | 8/min, 800/day                 | Too low                                                                                                                    |
| Alpha Vantage           | 5/min, 25/day                  | Too low                                                                                                                    |
| Massive (Polygon) Basic | 5/min, end-of-day              | Too low                                                                                                                    |

60/min is enough for a personal app because:

- each user brings their own key → the limit is **per user**, not shared;
- quotes are cached for 60 s and refreshed only while the tab is visible;
- requests are queued/throttled client-side (≤ ~50 symbols/min), with WebSocket live prices as a Phase 5 option.

Exposing a Finnhub key in the browser is low risk (read-only market data). We never commit a key to the repo.

---

## 3. Architecture

```
 Browser ──► GitHub Pages (static React app)
   │  localStorage: profiles, lots, settings, quote cache
   └──fetch (user's own key)──► Finnhub REST /quote, /search
```

Code layout:

```
src/
├── types.ts            # Lot, Quote, Profile, Settings, AppState, Position
├── lib/
│   ├── portfolio.ts    # gain/loss math (pure, unit-tested)   ✅
│   ├── storage.ts      # load/save/migrate AppState in localStorage
│   └── csv.ts / json.ts# export / import
├── providers/
│   ├── QuoteProvider.ts# interface: getQuote, getQuotes, search
│   └── finnhub.ts      # Finnhub implementation (+ throttle + cache)
├── hooks/              # useAppState, useQuotes (TanStack Query)
├── components/         # SummaryCards, HoldingsTable, LotForm, ProfileSwitcher, Settings
└── App.tsx
```

The `QuoteProvider` interface is the seam for later: swap the browser Finnhub provider for a call to our own API (Alpaca/Finnhub server-side) without touching UI code.

---

## 4. Data model (stored as one JSON object in localStorage)

```ts
interface AppState {
  version: 1 // for future migrations
  activeProfileId: string
  profiles: Profile[] // { id, name, createdAt, lots: Lot[] }
  settings: { finnhubApiKey?: string; refreshSeconds: number }
}

interface Lot {
  id: string
  symbol: string
  shares: number
  buyPrice: number
  buyDate: string
  fees?: number
  notes?: string
}
```

A static, read-only `public/sample-portfolio.json` will ship as demo data ("Load sample" button). Note: a static site **cannot write files back to the repo**, so user edits always live in the browser; export/import JSON is how you back up or move them.

### Calculations (`src/lib/portfolio.ts`, done + tested)

- Cost basis = Σ(shares × buyPrice + fees)
- Market value = Σshares × currentPrice
- Gain/Loss $ = market value − cost basis; Gain/Loss % = gain / cost basis × 100
- Avg cost/share, today's change (Σshares × quote.change), portfolio totals
- Positions with no quote yet are excluded from totals and flagged

---

## 5. Screens

- **Header** — profile switcher (create / rename / delete profile), Settings button
- **Summary cards** — Total value, Cost basis, Total G/L $ / %, Today's change
- **Holdings table** — symbol, shares, avg cost, price, value, G/L $, G/L %, today; green/red; sortable; expand row → individual lots
- **Add / edit lot form** — symbol (validated via Finnhub search), shares, buy price, date, fees
- **Settings** — Finnhub key (with "get a free key" link), refresh interval, export/import JSON & CSV, clear data
- **Empty state** — "Add your first stock" + "Load sample portfolio"

---

## 6. CI/CD (GitHub Actions) ✅

| Workflow         | Trigger                               | Steps                                                         |
| ---------------- | ------------------------------------- | ------------------------------------------------------------- |
| `ci.yml`         | every PR, pushes to non-main branches | `npm ci` → lint (oxlint) → typecheck → tests (Vitest) → build |
| `deploy.yml`     | push to `main`, manual                | same checks → build → upload `dist/` → deploy to GitHub Pages |
| `dependabot.yml` | weekly                                | npm + Actions updates                                         |

Site URL after first deploy: **https://vmudinas.github.io/Portfolio_Tracker/**

### One-time GitHub setup (manual, in the repo's Settings)

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. (Recommended) **Settings → Branches** → protect `main`: require PR + passing `CI / verify`

No secrets are needed — there is no server and no committed API key.

---

## 7. Testing

| Level          | Tool                    | What                                                             |
| -------------- | ----------------------- | ---------------------------------------------------------------- |
| Unit           | Vitest                  | G/L math ✅, storage migrations, CSV/JSON import, throttle/cache |
| Component      | React Testing Library   | form validation, table rendering, profile switching              |
| Provider       | Vitest + mocked `fetch` | Finnhub parsing, error/rate-limit handling                       |
| E2E (optional) | Playwright              | add stock → see G/L, against `vite preview` in CI                |

---

## 8. Roadmap

| Phase          | Deliverable                                                                                                                            | Status                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 0. Setup       | Branch, README, plan                                                                                                                   | ✅                                                 |
| 1. Scaffolding | Vite + React 19 + TS + Tailwind v4, oxlint, Vitest, G/L math + tests                                                                   | ✅                                                 |
| 2. Pipeline    | `ci.yml`, `deploy.yml` → GitHub Pages                                                                                                  | ✅ (live after merge to `main` + Pages source set) |
| 3. Core MVP    | localStorage state + profiles, add/edit/delete lots, Finnhub provider, holdings table, summary cards, Settings                         | ✅                                                 |
| 4. Quality     | Tests for all of the above, loading/error/empty states, responsive, accessibility pass                                                 | ⏭ next (partly done: 23 tests, mobile card layout) |
| 5. Extras      | Allocation & history charts, CSV/JSON import/export, sample data, WebSocket live prices, dark-mode toggle                              |                                                    |
| 6. Later       | Optional backend (Node API / serverless) for Alpaca or server-side keys, real accounts + cloud sync, dividends, sells & realized gains |                                                    |
