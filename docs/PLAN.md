# Portfolio Tracker — Implementation Plan

Status: **Live at https://vmudinas.github.io/Portfolio_Tracker/. Phases 0–3 merged; market hours + trends chart on `feature/market-hours`.**

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

## 7. Market hours, extended hours, trends (added 2026-10-04)

- **Market status**: Finnhub `/stock/market-status` (free) every 5 min gives session `pre | regular | post | closed` (+ holiday), shown as a badge.
- **Polling**: quotes refresh every N seconds only in the regular session. Pre/post/closed: one fetch per page load, plus one extra fetch when the regular session ends (closing price). Manual Refresh always works.
- **Pre-market / after-hours**: Finnhub WebSocket trades (free, up to 50 symbols, separate from the REST limit) during pre/post sessions. Latest trade per symbol is cached and shown only when newer than the last regular quote and never during the regular session, so Friday's after-hours price shows over the weekend. Totals stay on regular prices; the extended move is shown separately.
- **Trends chart**: Finnhub free has no price history (candles return 403), so history comes from **Twelve Data** free (8 req/min, 800/day, user's own key). Daily closes up to 1Y, weekly for 5Y, cached 6 h. Up to 8 stocks; % change indexed to range start (single axis), price mode for one stock. Colours follow the stock, validated palette, legend + end labels + table view. Lazy-loaded.

## 7b. Portfolio v2 (added 2026-10-04)

- **Data model** (per profile, all optional in old saves): `sales`, `dividends`, `cash`, `watchlist`, `alerts`. Parsed with defaults, so existing data keeps working.
- **Sells / realized gains**: FIFO per symbol; a sale only consumes shares bought on/before its date; fees on buys are spread per share, fees on sales reduce proceeds. Oversold shares are flagged.
- **Holdings columns**: weight (of stocks + cash), holding period (cost-weighted), annualized return (CAGR, only after ≥ 1 year).
- **Performance chart**: value = Σ shares held × close (prices carried over gaps); net invested = buys − sale proceeds; return is time-weighted (cash flows removed) vs SPY. Price return only.
- **Allocation**: by stock or by Finnhub industry (`/stock/profile2`, cached 30 days; ETFs → “Funds & ETFs”); top 7 + Other + Cash.
- **Dividends** are manual — Finnhub’s dividend endpoints are premium (403 on free).
- **Alerts**: checked on every price update against the latest price (after-hours when present); one-shot with re-arm; Notification API when permitted, in-page banner always.
- **CSV**: own format `date,type,symbol,shares,price,amount,fees,notes`; broker files detected by header names (skips preamble rows; sums commission + fee columns).
- **Themes**: class-based dark mode (`.dark`), black theme remaps Tailwind’s darkest slates; applied before first paint by an inline script.
- **PWA**: `manifest.webmanifest`, icons, `sw.js` (network-first pages, cache-first hashed assets; APIs never cached).

## 7c. Selection totals, returns & Sharpe (added 2026-10-04)

- **Selection**: checkboxes on holdings; a bar shows combined value (and % of portfolio), cost, unrealized, today (+ after-hours), realized, dividends. “Compare chart” opens Compare with those stocks; “Returns & Sharpe” opens the stats.
- **Data**: Twelve Data monthly closes (`interval=1month`, up to 240 months), cached 6 h.
- **Portfolio / selection monthly returns**: Modified Dietz per calendar month (flows weighted by days remaining), month-end value = shares held × month-end close (carried forward), current month uses live regular-session prices. Cash and dividends excluded.
- **Holding returns**: month-over-month price returns; ITD = latest price ÷ your first purchase price − 1. **Benchmark** (SPY) ITD aligned to the portfolio’s first month.
- **Stats**: YTD (compounded months this year), 1Y (last 12 full months), ITD and annualized ITD (≥ 1 year), Sharpe = mean excess monthly return ÷ sample stdev × √12 over the last 12/36 full months (shown only when available). 2Y/3Y returns are annualized from the last 24/36 full months. Risk-free rate configurable in Settings (default 4.0% ≈ 3-month T-bill, Fed H.15, 2026-10-01).

## 7d. Portfolios comparison, heat map, top movers (added 2026-10-04)

- **Portfolios tab**: every profile with live totals (value incl. cash, cost, unrealized, today, realized, dividends, total return) plus a combined row for ticked profiles; monthly TWR per profile → growth chart vs SPY (each line starts at 0%) and YTD/1Y/ITD/Sharpe table. Quotes for all profiles’ holdings load while the tab is open.
- **Heat map**: fixed universe of ~100 largest US companies (≈ S&P 100) by GICS sector with market caps snapshotted from Finnhub on 2026-10-04 (`src/lib/marketUniverse.ts` — refresh occasionally). Custom squarified treemap (`src/lib/treemap.ts`). Quotes via Finnhub at ≤ 40/min (separate limiter) so portfolio refresh keeps headroom; refresh every 5 min in the regular session, cached otherwise. Index ETFs SPY/QQQ/DIA/IWM on top.
- **Top movers**: large caps = sort of the heat-map quotes (top 20 up / down); whole market = Alpha Vantage `TOP_GAINERS_LOSERS` (free key, 25/day, cached 15 min, optional “hide < $5”).

## 8. Testing

| Level          | Tool                    | What                                                             |
| -------------- | ----------------------- | ---------------------------------------------------------------- |
| Unit           | Vitest                  | G/L math ✅, storage migrations, CSV/JSON import, throttle/cache |
| Component      | React Testing Library   | form validation, table rendering, profile switching              |
| Provider       | Vitest + mocked `fetch` | Finnhub parsing, error/rate-limit handling                       |
| E2E (optional) | Playwright              | add stock → see G/L, against `vite preview` in CI                |

---

## 9. Roadmap

| Phase          | Deliverable                                                                                                                                                                                                 | Status                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 0. Setup       | Branch, README, plan                                                                                                                                                                                        | ✅                                                 |
| 1. Scaffolding | Vite + React 19 + TS + Tailwind v4, oxlint, Vitest, G/L math + tests                                                                                                                                        | ✅                                                 |
| 2. Pipeline    | `ci.yml`, `deploy.yml` → GitHub Pages                                                                                                                                                                       | ✅ (live after merge to `main` + Pages source set) |
| 3. Core MVP    | localStorage state + profiles, add/edit/delete lots, Finnhub provider, holdings table, summary cards, Settings                                                                                              | ✅                                                 |
| 4. Quality     | Tests for all of the above, loading/error/empty states, responsive, accessibility pass                                                                                                                      | ⏭ next (partly done: 23 tests, mobile card layout) |
| 5. Extras      | ✅ history chart (Twelve Data), ✅ JSON backup, ✅ sample data, ✅ WebSocket live prices (pre/after hours), ✅ market-hours polling · ⏭ allocation chart, CSV import/export, portfolio-value-over-time line | partly done                                        |
| 6. Later       | Optional backend (Node API / serverless) for Alpaca or server-side keys, real accounts + cloud sync, dividends, sells & realized gains                                                                      |                                                    |

## 7f. Short-term returns (added 2026-10-05)

- **1D**: from the previous close, 5-minute intraday bars (Twelve Data, cached 5 min); portfolio 1D = Σ shares × change ÷ Σ shares × previous close.
- **2W**: from the close on or before 14 days ago (daily bars); portfolio 2W is time-weighted, so money added during the window isn't counted as gain.
- Shown as range buttons on Performance, Compare stocks and the Portfolios chart, and as 1D/2W columns in the Returns & Sharpe and Portfolios tables. Sharpe columns are now 1Y and 3Y; 2Y/3Y annualized return columns replace Sharpe 2Y/5Y.
- Symbols with no price history yet are left out of portfolio return calculations instead of distorting them.
