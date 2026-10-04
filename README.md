# Portfolio Tracker

A website to track the performance of your stock portfolio.

Enter a stock symbol, how many shares you bought, and the price you paid. Portfolio Tracker fetches the current market price and shows how much you have earned or lost — per position and for the whole portfolio.

## Features (planned)

- Add any number of stocks by ticker symbol (e.g. `AAPL`, `MSFT`, `TSLA`)
- Record shares, purchase price, and purchase date — multiple buys (lots) of the same stock supported
- Live/current prices pulled from a market-data API
- Per-position and total **gain / loss** in dollars and percent
- Portfolio totals: cost basis, market value, today's change
- Allocation chart and performance chart
- Edit / delete positions, import / export CSV

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript (Vite) |
| Backend | Node.js + Express + TypeScript (API proxy for stock quotes) |
| Market data | Finnhub (free tier) — key kept on the server |
| Tests | Vitest, React Testing Library, Supertest |
| CI/CD | GitHub Actions |
| Hosting | Frontend on GitHub Pages; backend on a free Node host (see plan) |

## Project status

Planning. See [docs/PLAN.md](docs/PLAN.md) for the full step-by-step plan and the decisions to make before implementation.

## Repository layout (target)

```
Portfolio_Tracker/
├── client/            # React app (deployed to GitHub Pages)
├── server/            # Node/Express API (quote proxy + cache)
├── docs/PLAN.md       # Architecture & implementation plan
└── .github/workflows/ # CI (lint, test, build) and CD (deploy)
```

## Getting started (once implemented)

```bash
npm install          # installs client + server workspaces
npm run dev          # runs client (Vite) and server together
npm test             # runs all tests
```

> Disclaimer: this is a personal tracking tool, not financial advice. Quote data may be delayed.
