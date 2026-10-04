import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { useHistory } from '../hooks/useHistory'
import { gainColor, money, signedPct } from '../lib/format'
import { assignSlots, buildTrendRows, RANGES, rangeSpec, type RangeId, type TrendMode } from '../lib/trends'
import type { HistoryProvider } from '../providers/HistoryProvider'
import { Button, Card } from './ui'

const MAX_SERIES = 8
const PREFS_KEY = 'portfolio-tracker:trends'
const color = (slot: number) => `var(--series-${slot + 1})`

interface Prefs {
  range: RangeId
  mode: TrendMode
  slots: Record<string, number> | null
}

function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null
    return { range: p?.range ?? '6M', mode: p?.mode ?? 'percent', slots: p?.slots ?? null }
  } catch {
    return { range: '6M', mode: 'percent', slots: null }
  }
}

interface Props {
  /** Holdings, biggest position first. */
  symbols: string[]
  provider: HistoryProvider | null
  onOpenSettings: () => void
}

const fmtDate = (d: string, long = false) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(
    'en-US',
    long ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' },
  )

export default function TrendsPanel({ symbols, provider, onOpenSettings }: Props) {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const slots = useMemo(() => {
    const saved = prefs.slots ?? assignSlots({}, symbols.slice(0, 3), MAX_SERIES)
    const kept = Object.keys(saved).filter((s) => symbols.includes(s))
    return assignSlots(saved, kept, MAX_SERIES)
  }, [prefs.slots, symbols])
  const selected = symbols.filter((s) => slots[s] !== undefined)
  const mode: TrendMode = selected.length === 1 ? prefs.mode : 'percent'
  const spec = rangeSpec(prefs.range)

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, slots }))
    } catch {
      /* ignore */
    }
  }, [prefs, slots])

  const { histories, loading, error } = useHistory(selected, provider, spec.interval, spec.points)
  const { rows, stats } = useMemo(
    () => buildTrendRows(histories, selected, prefs.range, mode),
    [histories, selected, prefs.range, mode],
  )

  const toggle = (symbol: string) =>
    setPrefs((p) => {
      const next = selected.includes(symbol) ? selected.filter((s) => s !== symbol) : [...selected, symbol]
      return { ...p, slots: assignSlots(slots, next, MAX_SERIES) }
    })

  if (!provider) {
    return (
      <Card className="p-5">
        <h2 className="font-semibold">Trends</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Charts need price history, which Finnhub’s free plan doesn’t include. Add a free{' '}
          <a
            className="text-teal-700 underline dark:text-teal-400"
            href="https://twelvedata.com/register"
            target="_blank"
            rel="noreferrer"
          >
            Twelve Data
          </a>{' '}
          key to turn them on.
        </p>
        <Button variant="primary" className="mt-3" onClick={onOpenSettings}>
          Add Twelve Data key
        </Button>
      </Card>
    )
  }

  const valueFmt = (v: number) => (mode === 'percent' ? signedPct(v) : money(v))
  const lastIndex = rows.length - 1
  const showEndLabels = selected.length <= 4

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Trends</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Time range"
            className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700"
          >
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={prefs.range === r.id}
                onClick={() => setPrefs((p) => ({ ...p, range: r.id }))}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${prefs.range === r.id ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {r.id}
              </button>
            ))}
          </div>
          <div
            role="group"
            aria-label="Chart mode"
            className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700"
          >
            {(['percent', 'price'] as const).map((m) => {
              const disabled = m === 'price' && selected.length !== 1
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  disabled={disabled}
                  title={disabled ? 'Select one stock to see its price' : undefined}
                  onClick={() => setPrefs((p) => ({ ...p, mode: m }))}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${mode === m ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  {m === 'percent' ? '% change' : 'Price'}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Stock picker doubles as the legend: swatch = series colour. */}
      <div role="group" aria-label="Stocks to chart" className="mt-3 flex flex-wrap gap-1.5">
        {symbols.map((s) => {
          const on = slots[s] !== undefined
          const full = !on && selected.length >= MAX_SERIES
          const stat = stats.find((x) => x.symbol === s)
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              disabled={full}
              title={full ? `Up to ${MAX_SERIES} stocks at once` : undefined}
              onClick={() => toggle(s)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${on ? 'border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100' : 'border-dashed border-slate-300 text-slate-500 hover:border-slate-400 dark:border-slate-700'}`}
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: on ? color(slots[s]) : 'transparent',
                  boxShadow: on ? undefined : 'inset 0 0 0 1.5px currentColor',
                }}
              />
              {s}
              {on && stat && <span className={gainColor(stat.changePct)}>{signedPct(stat.changePct)}</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-4 h-72 sm:h-80" aria-hidden={rows.length === 0}>
        {selected.length === 0 ? (
          <p className="grid h-full place-items-center text-sm text-slate-500">Pick one or more stocks above.</p>
        ) : rows.length === 0 ? (
          <p className="grid h-full place-items-center text-sm text-slate-500">
            {loading.length ? 'Loading price history…' : (error ?? 'No price history for this range.')}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: showEndLabels ? 56 : 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => fmtDate(d)}
                minTickGap={40}
                tick={{ fill: 'var(--chart-axis)', fontSize: 12 }}
                axisLine={{ stroke: 'var(--chart-grid)' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => (mode === 'percent' ? `${v > 0 ? '+' : ''}${v}%` : `$${v}`)}
                tick={{ fill: 'var(--chart-axis)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={56}
                domain={['auto', 'auto']}
              />
              {mode === 'percent' && <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="3 3" />}
              <Tooltip
                content={(p: TooltipContentProps<ValueType, NameType>) => (
                  <TrendTooltip {...p} format={valueFmt} slots={slots} />
                )}
                cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
              />
              {selected.map((s) => (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={s}
                  name={s}
                  stroke={color(slots[s])}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }}
                  connectNulls
                  isAnimationActive={false}
                  label={
                    showEndLabels
                      ? ({ x, y, index }: { x?: number | string; y?: number | string; index?: number }) =>
                          index === lastIndex && x !== undefined && y !== undefined ? (
                            <text
                              x={Number(x) + 6}
                              y={Number(y)}
                              dy={4}
                              fontSize={12}
                              fontWeight={600}
                              className="fill-slate-700 dark:fill-slate-200"
                            >
                              {s}
                            </text>
                          ) : null
                      : false
                  }
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {mode === 'percent' ? 'Change since the start of the range.' : 'Closing price.'}{' '}
          {spec.interval === '1week' ? 'Weekly' : 'Daily'} closes from Twelve Data.
          {loading.length > 0 && rows.length > 0 && ' Loading…'}
        </span>
        {error && rows.length > 0 && <span className="text-rose-600">{error}</span>}
      </div>

      {stats.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-400">
            View as table
          </summary>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 font-medium">Stock</th>
                <th className="py-1 text-right font-medium">Start ({fmtDate(String(rows[0].date), true)})</th>
                <th className="py-1 text-right font-medium">Latest</th>
                <th className="py-1 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {stats.map((s) => (
                <tr key={s.symbol} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1 font-medium">{s.symbol}</td>
                  <td className="py-1 text-right">{money(s.start)}</td>
                  <td className="py-1 text-right">{money(s.end)}</td>
                  <td className={`py-1 text-right ${gainColor(s.changePct)}`}>{signedPct(s.changePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </Card>
  )
}

function TrendTooltip({
  active,
  payload,
  label,
  format,
  slots,
}: TooltipContentProps<ValueType, NameType> & { format: (v: number) => string; slots: Record<string, number> }) {
  if (!active || !payload?.length) return null
  const items = [...payload]
    .filter((p) => typeof p.value === 'number')
    .sort((a, b) => Number(b.value) - Number(a.value))
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-1 font-medium text-slate-700 dark:text-slate-200">{fmtDate(String(label), true)}</p>
      {items.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 tabular-nums">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: color(slots[String(p.dataKey)]) }}
            aria-hidden="true"
          />
          <span className="font-medium text-slate-700 dark:text-slate-200">{String(p.dataKey)}</span>
          <span className="ml-auto pl-3 text-slate-600 dark:text-slate-300">{format(Number(p.value))}</span>
        </p>
      ))}
    </div>
  )
}
