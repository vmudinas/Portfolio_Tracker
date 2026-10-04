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
  lots: Lot[]
}

export interface PortfolioSummary {
  costBasis: number
  marketValue: number
  gain: number
  gainPct: number
  dayChange: number
  /** Symbols with no quote yet; excluded from value/gain totals. */
  missingQuotes: string[]
}
