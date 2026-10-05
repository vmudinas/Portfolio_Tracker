// Shared chart constants and formatters (kept out of component files for fast refresh).
export const seriesColor = (slot: number) => `var(--series-${(slot % 8) + 1})`
export const NEUTRAL = 'var(--chart-neutral)'
export const axisTick = { fill: 'var(--chart-axis)', fontSize: 12 }

const fmtDay = (d: string, long: boolean) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(
    'en-US',
    long ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' },
  )

/** Date label; intraday values ("YYYY-MM-DD HH:MM:SS", exchange time) show the time instead. */
export const fmtDate = (d: string, long = false) => {
  if (d.length <= 10) return fmtDay(d, long)
  const time = d.slice(11, 16)
  if (time === '00:00') return long ? `Previous close (before ${fmtDay(d.slice(0, 10), true)})` : 'Prev close'
  return long ? `${fmtDay(d.slice(0, 10), true)} ${time} ET` : time
}

/** Fraction → signed percent text (0.012 → "+1.2%"); "—" when missing. */
export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(digits)}%`
