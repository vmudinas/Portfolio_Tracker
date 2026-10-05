import type { HistoryInterval, PricePoint } from '../providers/HistoryProvider'

export type RangeId = '1D' | '2W' | '1M' | '3M' | '6M' | '1Y' | '5Y'
export type TrendMode = 'percent' | 'price'

export const RANGES: { id: RangeId; days: number; interval: HistoryInterval; points: number }[] = [
  // 1D = the latest trading session in 5-minute bars, measured from the previous close.
  { id: '1D', days: 1, interval: '5min', points: 80 },
  { id: '2W', days: 14, interval: '1day', points: 260 },
  { id: '1M', days: 31, interval: '1day', points: 260 },
  { id: '3M', days: 92, interval: '1day', points: 260 },
  { id: '6M', days: 183, interval: '1day', points: 260 },
  { id: '1Y', days: 366, interval: '1day', points: 260 },
  { id: '5Y', days: 5 * 366, interval: '1week', points: 265 },
]

export const rangeSpec = (id: RangeId) => RANGES.find((r) => r.id === id) ?? RANGES[5]

export type TrendRow = { date: string } & Record<string, number | string | null>

export interface SeriesStats {
  symbol: string
  start: number
  end: number
  changePct: number
}

export function cutoff(days: number, today: Date): string {
  const d = new Date(today)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Latest trading day present in the data (YYYY-MM-DD). */
export function latestDay(histories: Record<string, PricePoint[] | undefined>): string | null {
  let max: string | null = null
  for (const pts of Object.values(histories)) {
    const last = pts?.at(-1)?.date.slice(0, 10)
    if (last && (!max || last > max)) max = last
  }
  return max
}

/** Marker time used for the previous-close baseline point on 1D charts. */
export const PREV_CLOSE_TIME = '00:00:00'

/**
 * For 1D: keep only the latest session's bars and prepend each symbol's previous close,
 * so the day's move is measured from yesterday's close (like brokers show it).
 */
export function oneDaySeries(
  histories: Record<string, PricePoint[] | undefined>,
  prevCloses: Record<string, number | undefined>,
): { histories: Record<string, PricePoint[]>; day: string | null } {
  const day = latestDay(histories)
  const out: Record<string, PricePoint[]> = {}
  if (!day) return { histories: out, day }
  for (const [s, pts] of Object.entries(histories)) {
    const today = (pts ?? []).filter((p) => p.date.startsWith(day))
    if (!today.length) continue
    const pc = prevCloses[s]
    out[s] = pc ? [{ date: `${day} ${PREV_CLOSE_TIME}`, close: pc }, ...today] : today
  }
  return { histories: out, day }
}

/**
 * Merge per-symbol price histories into chart rows for the chosen range.
 * In percent mode each series is indexed to its first point in the range (0% = start),
 * so stocks with very different prices share one axis.
 */
export function buildTrendRows(
  histories: Record<string, PricePoint[] | undefined>,
  symbols: string[],
  range: RangeId,
  mode: TrendMode,
  today = new Date(),
  prevCloses: Record<string, number | undefined> = {},
): { rows: TrendRow[]; stats: SeriesStats[] } {
  let from = cutoff(rangeSpec(range).days, today)
  if (range === '1D') {
    const one = oneDaySeries(histories, prevCloses)
    histories = one.histories
    from = one.day ?? from
  }
  const byDate = new Map<string, TrendRow>()
  const stats: SeriesStats[] = []

  for (const symbol of symbols) {
    const points = (histories[symbol] ?? []).filter((p) => p.date >= from)
    if (points.length === 0) continue
    const base = points[0].close
    const end = points[points.length - 1].close
    stats.push({ symbol, start: base, end, changePct: base ? ((end - base) / base) * 100 : 0 })
    for (const p of points) {
      const row = byDate.get(p.date) ?? ({ date: p.date } as TrendRow)
      row[symbol] = mode === 'percent' ? Math.round(((p.close - base) / base) * 10000) / 100 : p.close
      byDate.set(p.date, row)
    }
  }

  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  // Fill missing cells with null so lines connect across gaps explicitly.
  for (const row of rows) for (const s of stats) if (!(s.symbol in row)) row[s.symbol] = null
  return { rows, stats }
}

/** Keep each selected symbol's colour slot stable; give new ones the lowest free slot. */
export function assignSlots(current: Record<string, number>, selected: string[], max: number): Record<string, number> {
  const next: Record<string, number> = {}
  for (const s of selected) if (current[s] !== undefined) next[s] = current[s]
  const used = new Set(Object.values(next))
  for (const s of selected) {
    if (next[s] !== undefined) continue
    let slot = 0
    while (used.has(slot) && slot < max) slot++
    if (slot >= max) continue
    next[s] = slot
    used.add(slot)
  }
  return next
}
