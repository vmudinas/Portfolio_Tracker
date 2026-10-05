import type { PricePoint } from '../providers/HistoryProvider'
import type { Book } from '../types'
import { sharesHeld } from './portfolio'

export interface PerfRow {
  date: string
  /** Market value of holdings at that day's close (excludes cash). */
  value: number
  /** Cumulative purchases minus sale proceeds. */
  invested: number
  /** Time-weighted return since the start of the chart, %. */
  portfolioPct: number
  /** Benchmark price return since the start of the chart, %. */
  benchmarkPct: number | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

function netInvested(book: Book, date: string): number {
  const buys = book.lots
    .filter((l) => !l.buyDate || l.buyDate <= date)
    .reduce((s, l) => s + l.shares * l.buyPrice + (l.fees ?? 0), 0)
  const sells = book.sales
    .filter((x) => !x.date || x.date <= date)
    .reduce((s, x) => s + x.shares * x.price - (x.fees ?? 0), 0)
  return buys - sells
}

/** Close on or before `date` (prices carried forward over gaps). */
function priceOn(points: PricePoint[], date: string): number | null {
  let lo = 0
  let hi = points.length - 1
  let ans: number | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].date <= date) {
      ans = points[mid].close
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/**
 * Daily/weekly portfolio value, net invested capital, and time-weighted return vs a benchmark.
 * Cash flows (buys/sells) are removed from the return so adding money doesn't look like a gain.
 * Price return only — dividends are not included.
 */
export function buildPerformance(
  book: Book,
  histories: Record<string, PricePoint[] | undefined>,
  benchmark: PricePoint[] | undefined,
  fromDate: string,
): { rows: PerfRow[]; missing: string[] } {
  const all = [...new Set(book.lots.map((l) => l.symbol.toUpperCase()))]
  const missing = all.filter((s) => !histories[s]?.length)
  // Holdings without price history are left out completely (including their cash flows).
  const symbols = all.filter((s) => !missing.includes(s))
  const keep = new Set(symbols)
  book = {
    lots: book.lots.filter((l) => keep.has(l.symbol.toUpperCase())),
    sales: book.sales.filter((x) => keep.has(x.symbol.toUpperCase())),
    dividends: book.dividends,
  }
  const firstBuy = book.lots
    .map((l) => l.buyDate)
    .filter(Boolean)
    .sort()[0]
  const start = firstBuy && firstBuy > fromDate ? firstBuy : fromDate

  const dates = new Set<string>()
  for (const s of symbols) for (const p of histories[s] ?? []) if (p.date >= start) dates.add(p.date)
  const sorted = [...dates].sort()

  const rows: PerfRow[] = []
  let index = 1
  let prevValue = 0
  let prevInvested = 0
  let benchBase: number | null = null

  for (const date of sorted) {
    let value = 0
    for (const s of symbols) {
      const shares = sharesHeld(book, s, date)
      if (shares <= 0) continue
      const px = priceOn(histories[s] ?? [], date)
      if (px !== null) value += shares * px
    }
    const invested = netInvested(book, date)
    if (rows.length === 0 && value <= 0) {
      prevInvested = invested
      continue
    }
    const flow = invested - prevInvested
    if (rows.length > 0 && prevValue > 0) index *= (value - flow) / prevValue
    const bench = benchmark ? priceOn(benchmark, date) : null
    if (benchBase === null && bench !== null) benchBase = bench
    rows.push({
      date,
      value: round2(value),
      invested: round2(invested),
      portfolioPct: round2((index - 1) * 100),
      benchmarkPct: bench !== null && benchBase ? round2((bench / benchBase - 1) * 100) : null,
    })
    prevValue = value
    prevInvested = invested
  }
  return { rows, missing }
}
