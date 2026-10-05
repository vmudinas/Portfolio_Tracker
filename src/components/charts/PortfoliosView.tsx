import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useHistory } from '../../hooks/useHistory'
import { gainColor, money, signedMoney, signedPct } from '../../lib/format'
import { analyze } from '../../lib/portfolio'
import {
  fundMonthlyReturns,
  portfolioMonthlyReturns,
  returnStats,
  type MonthReturn,
  type ReturnStats,
} from '../../lib/returns'
import { buildPerformance } from '../../lib/performance'
import { holdingOneDay, holdingTwoWeek, portfolioOneDay, portfolioTwoWeek } from '../../lib/shortTerm'
import { cutoff, oneDaySeries } from '../../lib/trends'
import type { HistoryProvider, PricePoint } from '../../providers/HistoryProvider'
import type { Book, ExtendedQuote, Profile, Quote } from '../../types'
import { Card, Segmented } from '../ui'
import { axisTick, fmtDate, NEUTRAL, seriesColor } from './chartUtils'
import { StatsCells, StatsHeader } from './StatsColumns'
import { ChartMessage, NeedsHistoryKey, Swatch, TooltipBox } from './common'
import { BENCHMARK } from './PerformanceView'

type Range = '1D' | '2W' | '1Y' | '3Y' | '5Y' | 'All'
const COMBINED = '__combined'

interface Props {
  profiles: Profile[]
  activeId: string
  quotes: Record<string, Quote | undefined>
  extended: Record<string, ExtendedQuote | undefined>
  regularPrices: Record<string, number | undefined>
  riskFree: number
  provider: HistoryProvider | null
  onSwitch: (id: string) => void
  onOpenSettings: () => void
}

const bookOf = (p: Profile): Book => ({ lots: p.lots, sales: p.sales, dividends: p.dividends })
const monthLabel = (m: string) =>
  new Date(`${m}-15T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })

/** Side-by-side comparison of every profile (portfolio / fund), plus a combined total and the S&P 500. */
export default function PortfoliosView(props: Props) {
  const { profiles, quotes, extended, regularPrices, riskFree, provider } = props
  const [included, setIncluded] = useState<string[]>(() => profiles.map((p) => p.id))
  const [range, setRange] = useState<Range>('3Y')
  const [today] = useState(() => new Date())
  const inc = profiles.filter((p) => included.includes(p.id))

  // ---- Totals (live prices; no history needed)
  const totals = useMemo(
    () =>
      profiles.map((p) => {
        const a = analyze(bookOf(p), quotes, extended, { cash: p.cash })
        return { profile: p, summary: a.summary, holdings: a.positions.length }
      }),
    [profiles, quotes, extended],
  )
  const combined = useMemo(() => {
    const rows = totals.filter((t) => included.includes(t.profile.id)).map((t) => t.summary)
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0)
    const cost = sum('costBasis')
    const gain = sum('gain')
    return {
      totalValue: sum('totalValue'),
      costBasis: cost,
      gain,
      gainPct: cost ? (gain / cost) * 100 : 0,
      dayChange: sum('dayChange'),
      realizedGain: sum('realizedGain'),
      dividends: sum('dividends'),
      totalReturn: sum('totalReturn'),
    }
  }, [totals, included])

  // ---- Returns (monthly history)
  const symbols = useMemo(
    () => [...new Set([...profiles.flatMap((p) => p.lots.map((l) => l.symbol)), BENCHMARK])].sort(),
    [profiles],
  )
  const { histories, loading, error } = useHistory(provider ? symbols : [], provider, '1month', 240)
  // Daily closes for the 2W column and chart; 5-minute bars only while the 1D chart is shown.
  const daily = useHistory(provider ? symbols : [], provider, '1day', 260).histories
  const intraday = useHistory(provider && range === '1D' ? symbols : [], provider, '5min', 80)
  const prevCloses = useMemo(
    () => Object.fromEntries(Object.entries(quotes).flatMap(([k, q]) => (q?.prevClose ? [[k, q.prevClose]] : []))),
    [quotes],
  ) as Record<string, number>
  const series = useMemo(() => {
    const out: {
      id: string
      label: string
      returns: MonthReturn[]
      stats: ReturnStats
      oneDay: number | null
      twoWeek: number | null
      book?: Book
      slot?: number
      bench?: boolean
    }[] = []
    profiles.forEach((p, i) => {
      const r = portfolioMonthlyReturns(bookOf(p), histories, today, regularPrices).returns
      if (r.length || p.lots.length)
        out.push({
          id: p.id,
          label: p.name,
          returns: r,
          stats: returnStats(r, riskFree, today),
          oneDay: portfolioOneDay(bookOf(p), quotes),
          twoWeek: portfolioTwoWeek(bookOf(p), daily, today),
          book: bookOf(p),
          slot: i,
        })
    })
    if (inc.length > 1) {
      const book: Book = {
        lots: inc.flatMap((p) => p.lots),
        sales: inc.flatMap((p) => p.sales),
        dividends: inc.flatMap((p) => p.dividends),
      }
      const r = portfolioMonthlyReturns(book, histories, today, regularPrices).returns
      out.push({
        id: COMBINED,
        label: `Combined (${inc.length})`,
        returns: r,
        stats: returnStats(r, riskFree, today),
        oneDay: portfolioOneDay(book, quotes),
        twoWeek: portfolioTwoWeek(book, daily, today),
      })
    }
    const spy = histories[BENCHMARK]
    if (spy?.length) {
      const r = fundMonthlyReturns(spy, today, regularPrices[BENCHMARK])
      // ITD over the same months as your earliest portfolio, so it compares like for like.
      const since = out
        .map((x) => x.returns[0]?.month)
        .filter(Boolean)
        .sort()[0]
      const aligned = returnStats(since ? r.filter((x) => x.month >= since) : r, riskFree, today)
      const stats = returnStats(r, riskFree, today)
      out.push({
        id: BENCHMARK,
        label: 'S&P 500 (SPY)',
        returns: r,
        stats: { ...stats, itd: aligned.itd, itdAnnualized: aligned.itdAnnualized, inception: aligned.inception },
        oneDay: holdingOneDay(quotes[BENCHMARK]),
        twoWeek: holdingTwoWeek(daily[BENCHMARK], regularPrices[BENCHMARK], today),
        bench: true,
      })
    }
    return out
  }, [profiles, inc, histories, daily, quotes, regularPrices, riskFree, today])

  // ---- Growth chart: cumulative return per profile from the start of the range.
  const chart = useMemo(() => {
    const lines = series.filter((s) => s.id !== COMBINED)
    type ChartRow = Record<string, number | string | null>

    // 1D / 2W: time-weighted value from intraday or daily bars (1D starts from the previous close).
    if (range === '1D' || range === '2W') {
      let H: Record<string, PricePoint[] | undefined> = daily
      let from = cutoff(14, today)
      if (range === '1D') {
        const one = oneDaySeries(intraday.histories, prevCloses)
        H = one.histories
        from = one.day ?? cutoff(1, today)
      } else {
        // Start at the last close on or before the cut-off so the first day's move counts.
        let base = ''
        for (const pts of Object.values(daily)) {
          const hit = pts?.filter((p) => p.date <= from).at(-1)
          if (hit && hit.date > base) base = hit.date
        }
        from = base || from
      }
      const byX = new Map<string, ChartRow>()
      const put = (x: string, id: string, v: number) => {
        const row = byX.get(x) ?? ({ x } as ChartRow)
        row[id] = Math.round(v * 100) / 100
        byX.set(x, row)
      }
      for (const s of lines) {
        if (s.bench) {
          const pts = (H[BENCHMARK] ?? []).filter((p) => p.date >= from)
          const base = pts[0]?.close
          if (base) for (const p of pts) put(p.date, s.id, (p.close / base - 1) * 100)
        } else if (s.book) {
          for (const r of buildPerformance(s.book, H, undefined, from).rows) put(r.date, s.id, r.portfolioPct)
        }
      }
      const rows = [...byX.values()].sort((a, b) => String(a.x).localeCompare(String(b.x)))
      return { rows, lines }
    }

    const months = range === 'All' ? Infinity : Number(range[0]) * 12
    const all = [...new Set(lines.flatMap((s) => s.returns.map((r) => r.month)))].sort()
    const firstPortfolio = lines
      .filter((s) => !s.bench)
      .map((s) => s.returns[0]?.month)
      .filter(Boolean)
      .sort()[0]
    const window = all
      .filter((m) => !firstPortfolio || m >= firstPortfolio)
      .slice(Number.isFinite(months) ? -months : 0)
    if (!window.length) return { rows: [] as ChartRow[], lines }
    const cum: Record<string, number> = {}
    const rows: ChartRow[] = []
    window.forEach((m, i) => {
      const row: ChartRow = { x: m }
      for (const s of lines) {
        const r = s.returns.find((x) => x.month === m)
        if (r) {
          // A line that starts mid-chart begins at 0% at the end of the month before its first return.
          if (cum[s.id] === undefined && i > 0) rows[i - 1][s.id] = 0
          cum[s.id] = (1 + (cum[s.id] ?? 0)) * (1 + r.ret) - 1
        }
        row[s.id] = cum[s.id] === undefined ? null : Math.round(cum[s.id] * 10000) / 100
      }
      rows.push(row)
    })
    return { rows, lines }
  }, [series, range, daily, intraday.histories, prevCloses, today])
  const xLabel = (x: string, long = false) => (range === '1D' || range === '2W' ? fmtDate(x, long) : monthLabel(x))

  const toggle = (id: string) => setIncluded((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
          <h2 className="font-semibold">Your portfolios</h2>
          <p className="text-xs text-slate-500">
            Tick portfolios to include in the combined total. Click a name to open it.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[820px] text-sm" aria-label="Portfolio totals">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase dark:bg-slate-800/50">
              <tr>
                <th className="w-10 py-2 pl-4" />
                <th className="py-2 text-left font-medium">Portfolio</th>
                <th className="py-2 text-right font-medium">Value</th>
                <th className="py-2 text-right font-medium">Cost</th>
                <th className="py-2 text-right font-medium">Unrealized</th>
                <th className="py-2 text-right font-medium">Today</th>
                <th className="py-2 text-right font-medium">Realized</th>
                <th className="py-2 text-right font-medium">Dividends</th>
                <th className="py-2 pr-4 text-right font-medium">Total return</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
              {totals.map(({ profile: p, summary: s, holdings }, i) => (
                <tr key={p.id}>
                  <td className="py-2 pl-4">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-teal-700"
                      checked={included.includes(p.id)}
                      onChange={() => toggle(p.id)}
                      aria-label={`Include ${p.name}`}
                    />
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 font-semibold"
                      onClick={() => props.onSwitch(p.id)}
                    >
                      <Swatch color={seriesColor(i)} />
                      {p.name}
                    </button>
                    <span className="ml-5 text-xs text-slate-500">
                      {holdings} holdings{p.id === props.activeId ? ' · open' : ''}
                    </span>
                  </td>
                  <td className="py-2 text-right font-medium">{money(s.totalValue)}</td>
                  <td className="py-2 text-right">{money(s.costBasis)}</td>
                  <td className={`py-2 text-right ${gainColor(s.gain)}`}>
                    {signedMoney(s.gain)} <span className="text-xs">{signedPct(s.gainPct)}</span>
                  </td>
                  <td className={`py-2 text-right ${gainColor(s.dayChange)}`}>{signedMoney(s.dayChange)}</td>
                  <td className={`py-2 text-right ${gainColor(s.realizedGain)}`}>{signedMoney(s.realizedGain)}</td>
                  <td className={`py-2 text-right ${gainColor(s.dividends)}`}>{signedMoney(s.dividends)}</td>
                  <td className={`py-2 pr-4 text-right font-medium ${gainColor(s.totalReturn)}`}>
                    {signedMoney(s.totalReturn)}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold dark:bg-slate-800/40">
                <td />
                <td className="py-2">Combined ({inc.length})</td>
                <td className="py-2 text-right">{money(combined.totalValue)}</td>
                <td className="py-2 text-right">{money(combined.costBasis)}</td>
                <td className={`py-2 text-right ${gainColor(combined.gain)}`}>
                  {signedMoney(combined.gain)} <span className="text-xs">{signedPct(combined.gainPct)}</span>
                </td>
                <td className={`py-2 text-right ${gainColor(combined.dayChange)}`}>
                  {signedMoney(combined.dayChange)}
                </td>
                <td className={`py-2 text-right ${gainColor(combined.realizedGain)}`}>
                  {signedMoney(combined.realizedGain)}
                </td>
                <td className={`py-2 text-right ${gainColor(combined.dividends)}`}>
                  {signedMoney(combined.dividends)}
                </td>
                <td className={`py-2 pr-4 text-right ${gainColor(combined.totalReturn)}`}>
                  {signedMoney(combined.totalReturn)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {profiles.length < 2 && (
          <p className="px-4 pb-3 text-xs text-slate-500">
            You have one portfolio. Create more from the profile menu (top right) to compare them here.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Performance comparison</h2>
          {provider && (
            <Segmented
              label="Range"
              value={range}
              onChange={setRange}
              options={(['1D', '2W', '1Y', '3Y', '5Y', 'All'] as const).map((r) => ({ id: r, label: r }))}
            />
          )}
        </div>
        {!provider ? (
          <NeedsHistoryKey onOpenSettings={props.onOpenSettings} />
        ) : (
          <>
            <div className="mt-3 h-72">
              {chart.rows.length < 2 ? (
                <ChartMessage>
                  {loading.length
                    ? `Loading monthly history (${symbols.length - loading.length}/${symbols.length})…`
                    : (error ?? 'Not enough history yet.')}
                </ChartMessage>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart.rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="x"
                      tickFormatter={(x: string) => xLabel(x)}
                      minTickGap={30}
                      tick={axisTick}
                      axisLine={{ stroke: 'var(--chart-grid)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`}
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                      domain={['auto', 'auto']}
                    />
                    <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="3 3" />
                    <Tooltip
                      cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }}
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <TooltipBox
                            title={xLabel(String(label), true)}
                            items={[...payload]
                              .filter((p) => typeof p.value === 'number')
                              .sort((a, b) => Number(b.value) - Number(a.value))
                              .map((p) => {
                                const s = chart.lines.find((l) => l.id === p.dataKey)!
                                return {
                                  key: s.id,
                                  label: s.label,
                                  color: s.bench ? NEUTRAL : seriesColor(s.slot ?? 0),
                                  dashed: s.bench,
                                  value: signedPct(Number(p.value)),
                                }
                              })}
                          />
                        ) : null
                      }
                    />
                    {chart.lines.map((s) => (
                      <Line
                        key={s.id}
                        dataKey={s.id}
                        name={s.label}
                        type="monotone"
                        stroke={s.bench ? NEUTRAL : seriesColor(s.slot ?? 0)}
                        strokeWidth={2}
                        strokeDasharray={s.bench ? '5 4' : undefined}
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
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              {chart.lines.map((s) => (
                <span key={s.id} className="flex items-center gap-1.5">
                  <Swatch color={s.bench ? NEUTRAL : seriesColor(s.slot ?? 0)} dashed={s.bench} /> {s.label}
                </span>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm" aria-label="Portfolio returns">
                <thead className="text-xs text-slate-500">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 text-left font-medium" />
                    <StatsHeader />
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {series.map((s) => (
                    <tr
                      key={s.id}
                      className={`border-b border-slate-100 dark:border-slate-800 ${s.id === COMBINED ? 'font-semibold' : ''} ${s.bench ? 'text-slate-600 dark:text-slate-300' : ''}`}
                    >
                      <td className="py-2 font-semibold">{s.label}</td>
                      <StatsCells r={s} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Time-weighted price returns from monthly closes (buying/selling doesn’t count as gain; cash and dividends
              excluded). The chart starts each line at 0% from the beginning of the range (or the portfolio’s first
              month); 1D runs from yesterday’s close in 5-minute steps, 2W uses daily closes. 2Y and 3Y are annualized.
              Sharpe uses a {riskFree}% risk-free rate.
              {loading.length > 0 && ` Loading ${loading.length} more…`}
            </p>
          </>
        )}
      </Card>
    </div>
  )
}
