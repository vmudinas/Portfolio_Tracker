# Portfolio Tracker

A website to track the performance of your stock portfolio.

Enter a stock symbol, how many shares you bought, and the price you paid. Portfolio Tracker fetches the current market price and shows how much you have earned or lost — per position and for the whole portfolio.

![Portfolio Tracker screenshot (sample portfolio, illustrative prices)](docs/screenshot.png)

## Features

- Add any number of stocks by ticker symbol (e.g. `AAPL`, `MSFT`, `TSLA`)
- Record shares, purchase price, and purchase date — multiple buys (lots) of the same stock supported
- Current prices from the Finnhub market-data API
- Per-position and total **gain / loss** in dollars and percent
- Portfolio totals: cost basis, market value, today's change
- Market-aware refresh: prices update every minute only while the market is open
- Pre-market and after-hours prices and changes (live Finnhub trade stream, when available)
- Optional **Trends** chart: pick stocks, choose 1M–5Y, compare % change or price (needs a free Twelve Data key)
- Multiple local profiles (no login) — switch between portfolios
- Edit / delete purchases, JSON backup export/import (CSV planned)

## Tech stack

| Layer        | Technology                                                                          |
| ------------ | ----------------------------------------------------------------------------------- |
| App          | React 19 + TypeScript (Vite)                                                        |
| Styling      | Tailwind CSS v4                                                                     |
| Data         | Browser localStorage — no server, no login; multiple local profiles                 |
| Market data  | [Finnhub](https://finnhub.io) free API — each user enters their own key in Settings |
| Tests / lint | Vitest + React Testing Library, oxlint                                              |
| CI/CD        | GitHub Actions → GitHub Pages                                                       |

Live site (after first deploy): https://vmudinas.github.io/Portfolio_Tracker/

## Project status

Working: profiles, purchases, gain/loss, market-hours aware prices with pre/after-hours moves, optional trends chart, JSON backup. CSV import/export is next. See [docs/PLAN.md](docs/PLAN.md).

## Development

Requires Node 22+.

```bash
npm install
npm run dev        # http://localhost:5173/Portfolio_Tracker/
npm test           # unit + component tests
npm run lint       # oxlint
npm run format     # prettier
npm run typecheck  # tsc
npm run build      # production build in dist/
```

## Using the app

1. Get a free API key at [finnhub.io/register](https://finnhub.io/register).
2. Open the site → **Settings** → paste the key → Save. It is stored only in your browser.
3. **+ Add stock** (or **Load sample portfolio**). Use the profile menu to create separate portfolios.
4. Optional: add a free [Twelve Data](https://twelvedata.com/register) key in Settings, then click **📈 Chart**.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/` to GitHub Pages.
One-time setup: **Settings → Pages → Source: GitHub Actions**.

> Disclaimer: this is a personal tracking tool, not financial advice. Quote data may be delayed.
