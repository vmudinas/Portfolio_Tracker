import type { MarketStatus } from '../types'

const styles = {
  regular: {
    label: 'Market open',
    cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  pre: {
    label: 'Pre-market',
    cls: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  post: {
    label: 'After hours',
    cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    dot: 'bg-indigo-500',
  },
  closed: {
    label: 'Market closed',
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
} as const

export function MarketBadge({ status }: { status: MarketStatus | null }) {
  if (!status) return null
  const s = styles[status.session]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
      {status.holiday ? ` · ${status.holiday}` : ''}
    </span>
  )
}
