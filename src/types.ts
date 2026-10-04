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

/** A local profile (no login) — lets several people/portfolios share one browser. */
export interface Profile {
  id: string
  name: string
  createdAt: string
  lots: Lot[]
}

export interface Settings {
  /** User-supplied Finnhub key, stored only in this browser. */
  finnhubApiKey?: string
  refreshSeconds: number
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
  lots: Lot[]
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
  marketValue: number
  gain: number
  gainPct: number
  dayChange: number
  /** Sum of pre-market / after-hours moves for positions that have one. */
  extendedChange: number | null
  extendedSession: 'pre' | 'post' | null
  /** Symbols with no quote yet; excluded from value/gain totals. */
  missingQuotes: string[]
}
