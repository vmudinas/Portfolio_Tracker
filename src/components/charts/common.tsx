import type { ReactNode } from 'react'
import { RANGES, type RangeId } from '../../lib/trends'
import { Button, Segmented } from '../ui'

export function RangePicker({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  return (
    <Segmented
      label="Time range"
      value={value}
      onChange={onChange}
      options={RANGES.map((r) => ({ id: r.id, label: r.id }))}
    />
  )
}

export function NeedsHistoryKey({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="py-6 text-center">
      <p className="mx-auto max-w-md text-sm text-slate-600 dark:text-slate-400">
        This chart needs price history, which Finnhub’s free plan doesn’t include. Add a free{' '}
        <a
          className="text-teal-700 underline dark:text-teal-400"
          href="https://twelvedata.com/register"
          target="_blank"
          rel="noreferrer"
        >
          Twelve Data
        </a>{' '}
        key to turn it on.
      </p>
      <Button variant="primary" className="mt-3" onClick={onOpenSettings}>
        Add Twelve Data key
      </Button>
    </div>
  )
}

export function ChartMessage({ children }: { children: ReactNode }) {
  return <p className="grid h-full place-items-center text-center text-sm text-slate-500">{children}</p>
}

interface TooltipItem {
  key: string
  label: string
  color: string
  dashed?: boolean
  value: string
}

/** Tooltip body: date + one row per series; text in ink colours, colour only on the swatch. */
export function TooltipBox({ title, items }: { title: string; items: TooltipItem[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-1 font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {items.map((i) => (
        <p key={i.key} className="flex items-center gap-2 tabular-nums">
          <Swatch color={i.color} dashed={i.dashed} />
          <span className="font-medium text-slate-700 dark:text-slate-200">{i.label}</span>
          <span className="ml-auto pl-3 text-slate-600 dark:text-slate-300">{i.value}</span>
        </p>
      ))}
    </div>
  )
}

export function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return dashed ? (
    <svg width="14" height="8" aria-hidden="true">
      <line x1="0" y1="4" x2="14" y2="4" stroke={color} strokeWidth="2" strokeDasharray="3 2" />
    </svg>
  ) : (
    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
  )
}
