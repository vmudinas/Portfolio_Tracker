import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useHistory } from '../../hooks/useHistory'
import { gainColor, money, signedPct } from '../../lib/format'
import { buildPerformance } from '../../lib/performance'
import { rangeSpec, type RangeId } from '../../lib/trends'
import type { HistoryProvider } from '../../providers/HistoryProvider'
import type { Book } from '../../types'
import { Segmented } from '../ui'
import { ChartMessage, RangePicker, Swatch, TooltipBox } from './common'
import { axisTick, fmtDate, NEUTRAL, seriesColor } from './chartUtils'

export const BENCHMARK = 'SPY'
const BENCH_LABEL = 'S&P 500 (SPY)'

function cutoff(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const compactMoney = (v: number) =>
  Math.abs(v) >= 1e6
    ? `$${(v / 1e6).toFixed(1)}M`
    : Math.abs(v) >= 1e3
      ? `$${(v / 1e3).toFixed(0)}k`
      : `$${v.toFixed(0)}`

export default function PerformanceView({ book, provider }: { book: Book; provider: HistoryProvider }) {
  const [range, setRange] = useState<RangeId>('1Y')
  const [mode, setMode] = useState<'return' | 'value'>('return')
  const spec = rangeSpec(range)
  const symbols = useMemo(() => [...new Set([...book.lots.map((l) => l.symbol), BENCHMARK])].sort(), [book.lots])
  const { histories, loading, error } = useHistory(symbols, provider, spec.interval, spec.points)

  const { rows, missing } = useMemo(
    () => buildPerformance(book, histories, histories[BENCHMARK], cutoff(spec.days)),
    [book, histories, spec.days],
  )
  const last = rows.at(-1)
  const label = (k: string) =>
    k === 'portfolioPct'
      ? 'Your portfolio'
      : k === 'benchmarkPct'
        ? BENCH_LABEL
        : k === 'value'
          ? 'Value'
          : 'Net invested'
  const fmt = (k: string, v: number) => (k.endsWith('Pct') ? signedPct(v) : money(v))
  const colorOf = (k: string) => (k === 'portfolioPct' || k === 'value' ? seriesColor(0) : NEUTRAL)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm tabular-nums">
          {last && mode === 'return' ? (
            <>
              <span className="text-slate-500">Over {range}: </span>
              <span className={`font-semibold ${gainColor(last.portfolioPct)}`}>
                you {signedPct(last.portfolioPct)}
              </span>
              {last.benchmarkPct !== null && (
                <span className="text-slate-500">
                  {' '}
                  vs S&amp;P 500 <span className={gainColor(last.benchmarkPct)}>{signedPct(last.benchmarkPct)}</span>
                </span>
              )}
            </>
          ) : last ? (
            <>
              <span className="text-slate-500">Value </span>
              <span className="font-semibold">{money(last.value)}</span>
              <span className="text-slate-500"> · net invested {money(last.invested)}</span>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <RangePicker value={range} onChange={setRange} />
          <Segmented
            label="Chart mode"
            value={mode}
            onChange={setMode}
            options={[
              { id: 'return', label: 'Return vs S&P 500' },
              { id: 'value', label: 'Value $' },
            ]}
          />
        </div>
      </div>

      <div className="mt-3 h-72 sm:h-80">
        {rows.length < 2 ? (
          <ChartMessage>
            {loading.length
              ? `Loading price history (${symbols.length - loading.length}/${symbols.length})…`
              : (error ?? 'Not enough history in this range yet.')}
          </ChartMessage>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
                tickFormatter={(v: number) => (mode === 'return' ? `${v > 0 ? '+' : ''}${v}%` : compactMoney(v))}
                tick={axisTick}
                axisLine={false}
                tickLine={false}
                width={56}
                domain={['auto', 'auto']}
              />
              {mode === 'return' && <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="3 3" />}
              <Tooltip
                cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
                content={({ active, payload, label: l }) =>
                  active && payload?.length ? (
                    <TooltipBox
                      title={fmtDate(String(l), true)}
                      items={payload
                        .filter((p) => typeof p.value === 'number')
                        .map((p) => ({
                          key: String(p.dataKey),
                          label: label(String(p.dataKey)),
                          color: colorOf(String(p.dataKey)),
                          dashed: colorOf(String(p.dataKey)) === NEUTRAL,
                          value: fmt(String(p.dataKey), Number(p.value)),
                        }))}
                    />
                  ) : null
                }
              />
              {(mode === 'return' ? ['portfolioPct', 'benchmarkPct'] : ['value', 'invested']).map((k) => (
                <Line
                  key={k}
                  dataKey={k}
                  name={label(k)}
                  type="monotone"
                  stroke={colorOf(k)}
                  strokeWidth={2}
                  strokeDasharray={colorOf(k) === NEUTRAL ? '5 4' : undefined}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <Swatch color={seriesColor(0)} /> {mode === 'return' ? 'Your portfolio (time-weighted)' : 'Value of holdings'}
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch color={NEUTRAL} dashed /> {mode === 'return' ? BENCH_LABEL : 'Net invested (buys − sales)'}
        </span>
        <span>Price return; excludes dividends and cash.</span>
        {missing.length > 0 && <span className="text-amber-600">No history for {missing.join(', ')} — left out.</span>}
        {loading.length > 0 && rows.length >= 2 && <span>Loading…</span>}
        {error && rows.length >= 2 && <span className="text-rose-600">{error}</span>}
      </div>
    </div>
  )
}
