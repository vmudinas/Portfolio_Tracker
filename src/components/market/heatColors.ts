/** Finviz-style diverging scale for daily % change; text colour picked for contrast on each step. */
const STEPS: { max: number; bg: string; fg: string }[] = [
  { max: -3, bg: '#8f1d25', fg: '#ffffff' },
  { max: -2, bg: '#b8323b', fg: '#ffffff' },
  { max: -1, bg: '#d35a62', fg: '#ffffff' },
  { max: -0.1, bg: '#e9a1a5', fg: '#3b0d10' },
  { max: 0.1, bg: '#8b95a5', fg: '#0f172a' },
  { max: 1, bg: '#8fd1a8', fg: '#062e17' },
  { max: 2, bg: '#3fa466', fg: '#ffffff' },
  { max: 3, bg: '#22804b', fg: '#ffffff' },
  { max: Infinity, bg: '#135f36', fg: '#ffffff' },
]

export function heatColor(pct: number | null | undefined) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return { bg: '#cbd5e1', fg: '#334155' }
  for (const s of STEPS) if (pct < s.max || s.max === Infinity) return s
  return STEPS[STEPS.length - 1]
}

export const HEAT_LEGEND = [-3, -2, -1, 0, 1, 2, 3]
