export interface PricePoint {
  /** YYYY-MM-DD, or "YYYY-MM-DD HH:MM:SS" (exchange time) for intraday bars */
  date: string
  close: number
}

export type HistoryInterval = '5min' | '1day' | '1week' | '1month'

/** Daily/weekly closing prices for charts. */
export interface HistoryProvider {
  readonly name: string
  /** Oldest first. Empty array when the symbol is unknown. */
  getHistory(symbol: string, interval: HistoryInterval, points: number): Promise<PricePoint[]>
}
