const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })

export const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : usd.format(n))
export const shares = (n: number) => num.format(n)

export function signedMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${usd.format(Math.abs(n))}`
}

export function signedPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`
}

/** Tailwind text colour for a gain/loss value. */
export function gainColor(n: number | null | undefined): string {
  if (!n) return 'text-slate-500 dark:text-slate-400'
  return n > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
}

/** Today's date in the user's local time zone, as YYYY-MM-DD. */
export function todayIso(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
