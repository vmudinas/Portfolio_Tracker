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
- Allocation chart and performance chart (planned)
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

Core app working: profiles, add/edit/delete purchases, Finnhub prices, gain/loss table and summary, JSON backup. Charts and CSV are next. See [docs/PLAN.md](docs/PLAN.md).

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

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/` to GitHub Pages.
One-time setup: **Settings → Pages → Source: GitHub Actions**.

> Disclaimer: this is a personal tracking tool, not financial advice. Quote data may be delayed.
