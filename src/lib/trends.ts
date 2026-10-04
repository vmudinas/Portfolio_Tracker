import type { HistoryInterval, PricePoint } from '../providers/HistoryProvider'

export type RangeId = '1M' | '3M' | '6M' | '1Y' | '5Y'
export type TrendMode = 'percent' | 'price'

export const RANGES: { id: RangeId; days: number; interval: HistoryInterval; points: number }[] = [
  { id: '1M', days: 31, interval: '1day', points: 260 },
  { id: '3M', days: 92, interval: '1day', points: 260 },
  { id: '6M', days: 183, interval: '1day', points: 260 },
  { id: '1Y', days: 366, interval: '1day', points: 260 },
  { id: '5Y', days: 5 * 366, interval: '1week', points: 265 },
]

export const rangeSpec = (id: RangeId) => RANGES.find((r) => r.id === id) ?? RANGES[3]

export type TrendRow = { date: string } & Record<string, number | string | null>

export interface SeriesStats {
  symbol: string
  start: number
  end: number
  changePct: number
}

function cutoff(days: number, today: Date): string {
  const d = new Date(today)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
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
): { rows: TrendRow[]; stats: SeriesStats[] } {
  const from = cutoff(rangeSpec(range).days, today)
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
