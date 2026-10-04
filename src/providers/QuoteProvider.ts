import type { MarketStatus, Quote } from '../types'

export interface SymbolMatch {
  symbol: string
  description: string
  type: string
}

export type ProviderErrorKind = 'auth' | 'rate' | 'network' | 'http'

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  constructor(kind: ProviderErrorKind, message: string) {
    super(message)
    this.name = 'ProviderError'
    this.kind = kind
  }
}

/**
 * Anything that can price a symbol. Today: Finnhub from the browser.
 * Later: our own API (e.g. Alpaca server-side) behind the same interface.
 */
export interface QuoteProvider {
  readonly name: string
  /** Resolves to null when the symbol is unknown. */
  getQuote(symbol: string): Promise<Quote | null>
  search(query: string): Promise<SymbolMatch[]>
  /** Current exchange session; optional so simple providers can skip it. */
  getMarketStatus?(): Promise<MarketStatus>
  /** Live trades (incl. pre/post market when the feed has them). Returns an unsubscribe function. */
  streamTrades?(symbols: string[], onTrade: (trade: Trade) => void): () => void
}

export interface Trade {
  symbol: string
  price: number
  /** Epoch milliseconds. */
  time: number
}
