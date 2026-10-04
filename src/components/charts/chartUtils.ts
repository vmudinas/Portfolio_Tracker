// Shared chart constants and formatters (kept out of component files for fast refresh).
export const seriesColor = (slot: number) => `var(--series-${(slot % 8) + 1})`
export const NEUTRAL = 'var(--chart-neutral)'
export const axisTick = { fill: 'var(--chart-axis)', fontSize: 12 }

export const fmtDate = (d: string, long = false) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(
    'en-US',
    long ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' },
  )
