/** One purchase of a stock. A position can be made of several lots. */
export interface Lot {
  id: string
  symbol: string
  shares: number
  /** Price paid per share. */
  buyPrice: number
  /** ISO date (YYYY-MM-DD). */
  buyDate: string
  /** Commission / fees paid for this purchase. */
  fees?: number
  notes?: string
}

export interface Quote {
  symbol: string
  price: number
  /** Today's change in $ per share. */
  change: number
  /** Today's change in %. */
  changePct: number
  prevClose: number
  /** ISO timestamp. */
  updatedAt: string
}

/** A sale of shares. Matched against purchases first-in, first-out. */
export interface Sale {
  id: string
  symbol: string
  shares: number
  /** Price received per share. */
  price: number
  /** ISO date (YYYY-MM-DD). */
  date: string
  fees?: number
  notes?: string
}

/** Cash dividend received (total amount, not per share). */
export interface Dividend {
  id: string
  symbol: string
  amount: number
  date: string
  notes?: string
}

export interface PriceAlert {
  id: string
  symbol: string
  direction: 'above' | 'below'
  price: number
  createdAt: string
  /** Set when the alert fired; cleared to re-arm. */
  triggeredAt?: string
}

/** Purchases, sales and dividends — everything the gain/loss maths needs. */
export interface Book {
  lots: Lot[]
  sales: Sale[]
  dividends: Dividend[]
}

/** A local profile (no login) — lets several people/portfolios share one browser. */
export interface Profile extends Book {
  id: string
  name: string
  createdAt: string
  /** Uninvested cash, entered by hand. */
  cash: number
  watchlist: string[]
  alerts: PriceAlert[]
}

/** A purchase with the shares still held after FIFO-matching sales. */
export interface OpenLot extends Lot {
  remaining: number
  /** (shares × price + fees) / shares */
  costPerShare: number
}

export interface RealizedSale {
  sale: Sale
  /** Cost of the shares matched to this sale. */
  cost: number
  /** Net proceeds of the matched shares (after fees). */
  proceeds: number
  gain: number
  /** Shares sold that had no matching purchase (data-entry problem). */
  unmatched: number
}

export interface Settings {
  /** User-supplied Finnhub key, stored only in this browser. */
  finnhubApiKey?: string
  /** Optional Twelve Data key — enables the trends chart (price history). */
  twelveDataApiKey?: string
  refreshSeconds: number
  showTrends?: boolean
}

/** Everything persisted to localStorage. */
export interface AppState {
  version: 1
  activeProfileId: string
  profiles: Profile[]
  settings: Settings
}

/** All lots of one symbol aggregated, valued at the current quote. */
export interface Position {
  symbol: string
  shares: number
  costBasis: number
  avgCost: number
  price: number | null
  marketValue: number | null
  gain: number | null
  gainPct: number | null
  dayChange: number | null
  /** Pre-market / after-hours price vs the last regular-session price, when available. */
  extended: ExtendedMove | null
  /** Realized gain from sales of this symbol. */
  realizedGain: number
  dividends: number
  /** Share of total value (stocks + cash), 0–100. */
  weight: number | null
  /** Earliest purchase date still held. */
  heldSince: string | null
  /** Cost-weighted average holding period of the open shares. */
  holdingDays: number | null
  /** Compound annual return; only for positions held a year or more. */
  annualizedPct: number | null
  lots: OpenLot[]
}

export type MarketSession = 'pre' | 'regular' | 'post' | 'closed'

export interface MarketStatus {
  session: MarketSession
  /** Holiday name when the exchange is closed for one. */
  holiday: string | null
}

/** Last trade outside regular hours. */
export interface ExtendedQuote {
  symbol: string
  price: number
  session: 'pre' | 'post'
  /** ISO timestamp of the trade. */
  updatedAt: string
}

export interface ExtendedMove {
  session: 'pre' | 'post'
  price: number
  /** Per-share change vs the regular-session price. */
  change: number
  changePct: number
  /** shares × change */
  valueChange: number
}

export interface PortfolioSummary {
  costBasis: number
  /** Value of stocks only. */
  marketValue: number
  cash: number
  /** Stocks + cash. */
  totalValue: number
  /** Unrealized gain on open positions. */
  gain: number
  gainPct: number
  dayChange: number
  /** Sum of pre-market / after-hours moves for positions that have one. */
  extendedChange: number | null
  extendedSession: 'pre' | 'post' | null
  realizedGain: number
  dividends: number
  /** Unrealized + realized + dividends. */
  totalReturn: number
  /** Symbols with no quote yet; excluded from value/gain totals. */
  missingQuotes: string[]
}
