import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useHistory } from '../../hooks/useHistory'
import { gainColor, money, signedPct } from '../../lib/format'
import { assignSlots, buildTrendRows, rangeSpec, type RangeId, type TrendMode } from '../../lib/trends'
import type { HistoryProvider } from '../../providers/HistoryProvider'
import { Segmented } from '../ui'
import { ChartMessage, RangePicker, Swatch, TooltipBox } from './common'
import { axisTick, fmtDate, NEUTRAL, seriesColor } from './chartUtils'
import { BENCHMARK } from './PerformanceView'

const MAX_SERIES = 8
const PREFS_KEY = 'portfolio-tracker:trends'

interface Prefs {
  range: RangeId
  mode: TrendMode
  slots: Record<string, number> | null
  benchmark: boolean
}

function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null
    return {
      range: p?.range ?? '6M',
      mode: p?.mode ?? 'percent',
      slots: p?.slots ?? null,
      benchmark: p?.benchmark ?? true,
    }
  } catch {
    return { range: '6M', mode: 'percent', slots: null, benchmark: true }
  }
}

/** Compare selected holdings (and optionally the S&P 500) as % change or price. */
export default function CompareView({
  symbols,
  provider,
  preselect,
  prevCloses = {},
}: {
  symbols: string[]
  provider: HistoryProvider
  prevCloses?: Record<string, number | undefined>
  /** Start with exactly these stocks selected (from "Compare selected"). */
  preselect?: string[]
}) {
  const [today] = useState(() => new Date())
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const p = readPrefs()
    return preselect?.length
      ? { ...p, mode: 'percent', slots: assignSlots({}, preselect.slice(0, MAX_SERIES), MAX_SERIES) }
      : p
  })
  const slots = useMemo(() => {
    const saved = prefs.slots ?? assignSlots({}, symbols.slice(0, 3), MAX_SERIES)
    const kept = Object.keys(saved).filter((s) => symbols.includes(s))
    return assignSlots(saved, kept, MAX_SERIES)
  }, [prefs.slots, symbols])
  const selected = symbols.filter((s) => slots[s] !== undefined)
  const mode: TrendMode = selected.length === 1 ? prefs.mode : 'percent'
  const withBench = prefs.benchmark && mode === 'percent' && !selected.includes(BENCHMARK)
  const spec = rangeSpec(prefs.range)

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, slots }))
    } catch {
      /* ignore */
    }
  }, [prefs, slots])

  const fetchKey = (withBench ? [...selected, BENCHMARK] : selected).join(',')
  const fetchList = fetchKey ? fetchKey.split(',') : []
  const { histories, loading, error } = useHistory(fetchList, provider, spec.interval, spec.points)
  const { rows, stats } = buildTrendRows(histories, fetchList, prefs.range, mode, today, prevCloses)

  const toggle = (symbol: string) =>
    setPrefs((p) => {
      const next = selected.includes(symbol) ? selected.filter((s) => s !== symbol) : [...selected, symbol]
      return { ...p, slots: assignSlots(slots, next, MAX_SERIES) }
    })

  const valueFmt = (v: number) => (mode === 'percent' ? signedPct(v) : money(v))
  const lastIndex = rows.length - 1
  const showEndLabels = selected.length <= 4
  const benchStat = stats.find((s) => s.symbol === BENCHMARK)
  const colorOf = (s: string) => (s === BENCHMARK && withBench ? NEUTRAL : seriesColor(slots[s] ?? 0))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <RangePicker value={prefs.range} onChange={(range) => setPrefs((p) => ({ ...p, range }))} />
        <Segmented
          label="Chart mode"
          value={mode}
          onChange={(m) => setPrefs((p) => ({ ...p, mode: m }))}
          options={[
            { id: 'percent', label: '% change' },
            {
              id: 'price',
              label: 'Price',
              disabled: selected.length !== 1,
              title: selected.length !== 1 ? 'Select one stock to see its price' : undefined,
            },
          ]}
        />
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
                  background: on ? seriesColor(slots[s]) : 'transparent',
                  boxShadow: on ? undefined : 'inset 0 0 0 1.5px currentColor',
                }}
              />
              {s}
              {on && stat && <span className={gainColor(stat.changePct)}>{signedPct(stat.changePct)}</span>}
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={withBench}
          disabled={mode !== 'percent'}
          title={mode !== 'percent' ? 'Benchmark shows in % change mode' : 'Compare with the S&P 500'}
          onClick={() => setPrefs((p) => ({ ...p, benchmark: !p.benchmark }))}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${withBench ? 'border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100' : 'border-dashed border-slate-300 text-slate-500 dark:border-slate-700'}`}
        >
          <Swatch color={withBench ? NEUTRAL : 'var(--chart-axis)'} dashed />
          S&amp;P 500
          {withBench && benchStat && (
            <span className={gainColor(benchStat.changePct)}>{signedPct(benchStat.changePct)}</span>
          )}
        </button>
      </div>

      <div className="mt-4 h-72 sm:h-80">
        {selected.length === 0 ? (
          <ChartMessage>Pick one or more stocks above.</ChartMessage>
        ) : rows.length === 0 ? (
          <ChartMessage>
            {loading.length ? 'Loading price history…' : (error ?? 'No price history for this range.')}
          </ChartMessage>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: showEndLabels ? 64 : 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => fmtDate(d)}
                minTickGap={40}
                tick={axisTick}
                axisLine={{ stroke: 'var(--chart-grid)' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => (mode === 'percent' ? `${v > 0 ? '+' : ''}${v}%` : `$${v}`)}
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={56}
                domain={['auto', 'auto']}
              />
              {mode === 'percent' && <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="3 3" />}
              <Tooltip
                cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <TooltipBox
                      title={fmtDate(String(label), true)}
                      items={[...payload]
                        .filter((p) => typeof p.value === 'number')
                        .sort((a, b) => Number(b.value) - Number(a.value))
                        .map((p) => {
                          const k = String(p.dataKey)
                          return {
                            key: k,
                            label: k === BENCHMARK && withBench ? 'S&P 500' : k,
                            color: colorOf(k),
                            dashed: k === BENCHMARK && withBench,
                            value: valueFmt(Number(p.value)),
                          }
                        })}
                    />
                  ) : null
                }
              />
              {fetchList.map((s) => {
                const isBench = s === BENCHMARK && withBench
                return (
                  <Line
                    key={s}
                    type="monotone"
                    dataKey={s}
                    name={s}
                    stroke={colorOf(s)}
                    strokeWidth={2}
                    strokeDasharray={isBench ? '5 4' : undefined}
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
                                {isBench ? 'S&P' : s}
                              </text>
                            ) : null
                        : false
                    }
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {mode === 'percent' ? 'Change since the start of the range.' : 'Closing price.'}{' '}
        {spec.interval === '1week' ? 'Weekly' : 'Daily'} closes from Twelve Data.
        {loading.length > 0 && rows.length > 0 && ' Loading…'}
        {error && rows.length > 0 && <span className="text-rose-600"> {error}</span>}
      </p>

      {stats.length > 0 && rows.length > 0 && (
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
                  <td className="py-1 font-medium">
                    {s.symbol === BENCHMARK && withBench ? 'S&P 500 (SPY)' : s.symbol}
                  </td>
                  <td className="py-1 text-right">{money(s.start)}</td>
                  <td className="py-1 text-right">{money(s.end)}</td>
                  <td className={`py-1 text-right ${gainColor(s.changePct)}`}>{signedPct(s.changePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}
