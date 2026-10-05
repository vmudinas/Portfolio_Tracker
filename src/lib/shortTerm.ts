import type { PricePoint } from '../providers/HistoryProvider'
import type { Book, Quote } from '../types'
import { buildPerformance } from './performance'
import { analyze } from './portfolio'
import { cutoff } from './trends'

/** Close on or before `date` (prices carried over weekends/holidays). */
function closeAtOrBefore(points: PricePoint[], date: string): { date: string; close: number } | null {
  let hit: PricePoint | null = null
  for (const p of points) if (p.date.slice(0, 10) <= date) hit = p
  return hit ? { date: hit.date.slice(0, 10), close: hit.close } : null
}

/** One-day change as a fraction, from the quote (vs previous close). */
export const holdingOneDay = (q: Quote | undefined) => (q && q.prevClose ? q.change / q.prevClose : null)

/** Price change over the last two weeks: latest price vs the close on or before 14 days ago. */
export function holdingTwoWeek(
  daily: PricePoint[] | undefined,
  latest: number | undefined,
  today = new Date(),
): number | null {
  if (!daily?.length) return null
  const base = closeAtOrBefore(daily, cutoff(14, today))
  const now = latest ?? daily.at(-1)!.close
  return base && base.close > 0 ? now / base.close - 1 : null
}

/** Today's portfolio move: Σ shares × change ÷ Σ shares × previous close (open positions with a price). */
export function portfolioOneDay(book: Book, quotes: Record<string, Quote | undefined>): number | null {
  const { positions } = analyze(book, quotes)
  let change = 0
  let prev = 0
  for (const p of positions) {
    const q = quotes[p.symbol]
    if (!q || p.marketValue === null) continue
    change += p.shares * q.change
    prev += p.shares * q.prevClose
  }
  return prev > 0 ? change / prev : null
}

/** Time-weighted portfolio return over the last two weeks from daily closes (buys/sells don't count as gains). */
export function portfolioTwoWeek(
  book: Book,
  daily: Record<string, PricePoint[] | undefined>,
  today = new Date(),
): number | null {
  const target = cutoff(14, today)
  // Start from the last trading day on or before the cut-off so the first day's move is included.
  let base: string | null = null
  for (const pts of Object.values(daily)) {
    const hit = pts ? closeAtOrBefore(pts, target) : null
    if (hit && (!base || hit.date > base)) base = hit.date
  }
  const { rows } = buildPerformance(book, daily, undefined, base ?? target)
  return rows.length >= 2 ? rows.at(-1)!.portfolioPct / 100 : null
}
