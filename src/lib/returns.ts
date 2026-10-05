import type { PricePoint } from '../providers/HistoryProvider'
import type { Book } from '../types'
import { todayIso } from './format'
import { sharesHeld } from './portfolio'

/** A calendar month's return, e.g. { month: '2026-03', ret: 0.042 } (fractions, not %). */
export interface MonthReturn {
  month: string
  ret: number
  /** Current month, still in progress. */
  partial?: boolean
}

export interface ReturnStats {
  ytd: number | null
  /** Last 12 full months. */
  oneYear: number | null
  /** Last 24 / 36 full months, annualized. */
  twoYear: number | null
  threeYear: number | null
  /** Inception-to-date (cumulative). */
  itd: number | null
  /** ITD annualized when the history is over a year. */
  itdAnnualized: number | null
  inception: string | null
  sharpe: Record<(typeof SHARPE_YEARS)[number], number | null>
}

export const SHARPE_YEARS = [1, 3] as const

const monthOf = (date: string) => date.slice(0, 7)
const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
const lastDay = (month: string) => `${month}-${String(daysIn(month)).padStart(2, '0')}`
export const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
const thisMonth = (today: Date) => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

/** Last close of each month (input may be daily, weekly or monthly bars). */
export function monthlyCloses(points: PricePoint[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of [...points].sort((a, b) => a.date.localeCompare(b.date))) out.set(monthOf(p.date), p.close)
  return out
}

/** Month-over-month price returns. The latest month is marked partial when it is the current month. */
export function fundMonthlyReturns(points: PricePoint[], today = new Date(), latestPrice?: number): MonthReturn[] {
  const closes = monthlyCloses(points)
  const cur = thisMonth(today)
  if (latestPrice && closes.size) closes.set(cur, latestPrice)
  const months = [...closes.keys()].sort()
  const out: MonthReturn[] = []
  for (let i = 1; i < months.length; i++) {
    const prev = closes.get(months[i - 1])!
    if (prev > 0)
      out.push({
        month: months[i],
        ret: closes.get(months[i])! / prev - 1,
        ...(months[i] === cur ? { partial: true } : {}),
      })
  }
  return out
}

/**
 * Monthly portfolio returns using the Modified Dietz method, so buys and sales during a month
 * aren't counted as gains or losses. Month-end values use each holding's month-end close
 * (or `latestPrices` for the current month). Cash and dividends are not included.
 */
export function portfolioMonthlyReturns(
  book: Book,
  monthly: Record<string, PricePoint[] | undefined>,
  today = new Date(),
  latestPrices: Record<string, number | undefined> = {},
): { returns: MonthReturn[]; missing: string[] } {
  const all = [...new Set(book.lots.map((l) => l.symbol.toUpperCase()))]
  const missing = all.filter((s) => !monthly[s]?.length)
  // Leave out holdings without price history entirely (their buys and sales too), so they don't look like losses.
  const symbols = all.filter((s) => !missing.includes(s))
  if (!symbols.length) return { returns: [], missing }
  book = filterBook(book, symbols)
  const closes = new Map(symbols.map((s) => [s, monthlyCloses(monthly[s] ?? [])]))
  const firstBuy = book.lots
    .map((l) => l.buyDate)
    .filter(Boolean)
    .sort()[0]
  if (!firstBuy) return { returns: [], missing }
  const cur = thisMonth(today)

  const priceAt = (s: string, month: string): number | null => {
    if (month === cur && latestPrices[s]) return latestPrices[s]!
    const c = closes.get(s)!
    let best: number | null = null
    for (const [m, v] of c) if (m <= month) best = v // carry forward over gaps
    return best
  }
  const valueAt = (month: string, date: string) =>
    symbols.reduce((sum, s) => {
      const sh = sharesHeld(book, s, date)
      const px = sh > 0 ? priceAt(s, month) : null
      return px === null ? sum : sum + sh * px
    }, 0)

  const flows = [
    ...book.lots.map((l) => ({ date: l.buyDate, amount: l.shares * l.buyPrice + (l.fees ?? 0) })),
    ...book.sales.map((x) => ({ date: x.date, amount: -(x.shares * x.price - (x.fees ?? 0)) })),
  ].filter((f) => f.date)

  const returns: MonthReturn[] = []
  let month = monthOf(firstBuy)
  let start = 0
  for (; month <= cur; month = nextMonth(month)) {
    const partial = month === cur
    const end = valueAt(month, partial ? todayIso(today) : lastDay(month))
    const days = partial ? today.getDate() : daysIn(month)
    let net = 0
    let weighted = 0
    for (const f of flows) {
      if (monthOf(f.date) !== month) continue
      const day = Number(f.date.slice(8, 10))
      net += f.amount
      weighted += f.amount * Math.max(0, (days - day) / days)
    }
    const denom = start + weighted
    if (denom > 0 && (start > 0 || net !== 0))
      returns.push({ month, ret: (end - start - net) / denom, ...(partial ? { partial: true } : {}) })
    start = end
  }
  return { returns, missing }
}

export const chain = (rets: number[]) => rets.reduce((acc, r) => acc * (1 + r), 1) - 1

/** Annualized Sharpe ratio from monthly returns (sample standard deviation). */
export function sharpe(rets: number[], riskFreeAnnualPct: number): number | null {
  if (rets.length < 12) return null
  const rf = riskFreeAnnualPct / 100 / 12
  const excess = rets.map((r) => r - rf)
  const mean = excess.reduce((s, r) => s + r, 0) / excess.length
  const variance = excess.reduce((s, r) => s + (r - mean) ** 2, 0) / (excess.length - 1)
  const sd = Math.sqrt(variance)
  return sd > 0 ? (mean / sd) * Math.sqrt(12) : null
}

/**
 * YTD, trailing 1/2/3-year (2Y and 3Y annualized), inception-to-date and Sharpe (1 and 3 years of full months), when available.
 * `itdOverride` lets a holding use its real cost (first buy price) instead of the first month in the data.
 */
export function returnStats(
  rets: MonthReturn[],
  riskFreeAnnualPct: number,
  today = new Date(),
  itdOverride?: { itd: number; since: string },
): ReturnStats {
  const year = String(today.getFullYear())
  const full = rets.filter((r) => !r.partial)
  const lastN = (n: number) => (full.length >= n ? full.slice(-n).map((r) => r.ret) : null)
  const ytdRets = rets.filter((r) => r.month.startsWith(year))
  const inception = itdOverride?.since ?? (rets.length ? rets[0].month : null)
  const itd = itdOverride ? itdOverride.itd : rets.length ? chain(rets.map((r) => r.ret)) : null
  const years = inception
    ? (today.getTime() - Date.parse(`${inception.length === 7 ? `${inception}-01` : inception}T00:00:00`)) /
      (365.25 * 86_400_000)
    : 0
  const one = lastN(12)
  const annualized = (n: number) => {
    const r = lastN(n)
    return r ? Math.pow(1 + chain(r), 12 / n) - 1 : null
  }
  return {
    ytd: ytdRets.length ? chain(ytdRets.map((r) => r.ret)) : null,
    oneYear: one ? chain(one) : null,
    twoYear: annualized(24),
    threeYear: annualized(36),
    itd,
    itdAnnualized: itd !== null && years >= 1 ? Math.pow(1 + itd, 1 / years) - 1 : null,
    inception,
    sharpe: Object.fromEntries(
      SHARPE_YEARS.map((y) => {
        const r = lastN(12 * y)
        return [y, r ? sharpe(r, riskFreeAnnualPct) : null]
      }),
    ) as ReturnStats['sharpe'],
  }
}

export interface YearRow {
  year: string
  months: (MonthReturn | null)[]
  total: number
}

/** Calendar grid: one row per year (newest first), Jan–Dec plus the year's compounded total. */
export function yearGrid(rets: MonthReturn[]): YearRow[] {
  const byYear = new Map<string, (MonthReturn | null)[]>()
  for (const r of rets) {
    const y = r.month.slice(0, 4)
    if (!byYear.has(y)) byYear.set(y, Array(12).fill(null))
    byYear.get(y)![Number(r.month.slice(5, 7)) - 1] = r
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, months]) => ({
      year,
      months,
      total: chain(months.filter((m): m is MonthReturn => m !== null).map((m) => m.ret)),
    }))
}

/** Restrict a book to some symbols (for "selected holdings" as a mini-portfolio). */
export function filterBook(book: Book, symbols: string[]): Book {
  const set = new Set(symbols.map((s) => s.toUpperCase()))
  const keep = <T extends { symbol: string }>(xs: T[]) => xs.filter((x) => set.has(x.symbol.toUpperCase()))
  return { lots: keep(book.lots), sales: keep(book.sales), dividends: keep(book.dividends) }
}
