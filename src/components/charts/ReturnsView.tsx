import { useMemo, useState } from 'react'
import { useHistory } from '../../hooks/useHistory'
import { gainColor } from '../../lib/format'
import {
  filterBook,
  fundMonthlyReturns,
  portfolioMonthlyReturns,
  returnStats,
  yearGrid,
  type MonthReturn,
  type ReturnStats,
} from '../../lib/returns'
import type { HistoryProvider } from '../../providers/HistoryProvider'
import { holdingOneDay, holdingTwoWeek, portfolioOneDay, portfolioTwoWeek } from '../../lib/shortTerm'
import type { Book, Quote } from '../../types'
import { ChartMessage } from './common'
import { StatsCells, StatsHeader } from './StatsColumns'
import { BENCHMARK } from './PerformanceView'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PORTFOLIO = '__portfolio'
const SELECTION = '__selection'

interface Props {
  book: Book
  /** Holdings currently owned, biggest first. */
  held: string[]
  selected: string[]
  latestPrices: Record<string, number | undefined>
  quotes: Record<string, Quote | undefined>
  riskFree: number
  provider: HistoryProvider
}

interface Row {
  id: string
  label: string
  sub?: string
  returns: MonthReturn[]
  stats: ReturnStats
  oneDay: number | null
  twoWeek: number | null
  benchmark?: boolean
}

const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(digits)}%`

/** Background tint for a monthly return: stronger with size, capped at ±10%. Text always shows the value. */
function tint(r: number) {
  const a = Math.min(Math.abs(r) / 0.1, 1) * 0.35 + 0.06
  return r >= 0 ? `rgba(16, 185, 129, ${a})` : `rgba(244, 63, 94, ${a})`
}

export default function ReturnsView({ book, held, selected, latestPrices, quotes, riskFree, provider }: Props) {
  const everHeld = useMemo(() => [...new Set(book.lots.map((l) => l.symbol))], [book.lots])
  const symbols = useMemo(() => [...new Set([...everHeld, BENCHMARK])].sort(), [everHeld])
  const { histories, loading, error } = useHistory(symbols, provider, '1month', 240)
  // Daily closes for the 2-week column (shared cache with the Performance and Compare charts).
  const daily = useHistory(symbols, provider, '1day', 260).histories
  const [subject, setSubject] = useState<string>(PORTFOLIO)
  const [showBench, setShowBench] = useState(true)
  const [today] = useState(() => new Date())

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const port = portfolioMonthlyReturns(book, histories, today, latestPrices)
    if (port.returns.length) {
      out.push({
        id: PORTFOLIO,
        label: 'Whole portfolio',
        sub: port.missing.length ? `without ${port.missing.join(', ')}` : 'time-weighted',
        returns: port.returns,
        stats: returnStats(port.returns, riskFree, today),
        oneDay: portfolioOneDay(book, quotes),
        twoWeek: portfolioTwoWeek(book, daily, today),
      })
    }
    if (selected.length > 1) {
      const sel = portfolioMonthlyReturns(filterBook(book, selected), histories, today, latestPrices)
      if (sel.returns.length)
        out.push({
          id: SELECTION,
          label: `Selected (${selected.length})`,
          sub: selected.join(', '),
          returns: sel.returns,
          stats: returnStats(sel.returns, riskFree, today),
          oneDay: portfolioOneDay(filterBook(book, selected), quotes),
          twoWeek: portfolioTwoWeek(filterBook(book, selected), daily, today),
        })
    }
    const order = [...held, ...everHeld.filter((s) => !held.includes(s)).sort()]
    for (const s of order) {
      const pts = histories[s]
      if (!pts?.length) continue
      const rets = fundMonthlyReturns(pts, today, latestPrices[s])
      const first = book.lots
        .filter((l) => l.symbol === s && l.buyDate)
        .sort((a, b) => a.buyDate.localeCompare(b.buyDate))[0]
      const last = latestPrices[s] ?? pts.at(-1)!.close
      out.push({
        id: s,
        label: s,
        sub: held.includes(s) ? undefined : 'sold',
        returns: rets,
        oneDay: holdingOneDay(quotes[s]),
        twoWeek: holdingTwoWeek(daily[s], latestPrices[s], today),
        stats: returnStats(
          rets,
          riskFree,
          today,
          first && first.buyPrice > 0 ? { itd: last / first.buyPrice - 1, since: first.buyDate } : undefined,
        ),
      })
    }
    const spy = histories[BENCHMARK]
    if (spy?.length) {
      const rets = fundMonthlyReturns(spy, today, latestPrices[BENCHMARK])
      // Benchmark ITD over the same months as the portfolio, so the two compare like for like.
      const since = port.returns[0]?.month
      const aligned = since ? rets.filter((r) => r.month >= since) : rets
      const stats = returnStats(rets, riskFree, today)
      const itdStats = returnStats(aligned, riskFree, today)
      out.push({
        id: BENCHMARK,
        label: 'S&P 500 (SPY)',
        sub: 'benchmark',
        returns: rets,
        oneDay: holdingOneDay(quotes[BENCHMARK]),
        twoWeek: holdingTwoWeek(daily[BENCHMARK], latestPrices[BENCHMARK], today),
        stats: { ...stats, itd: itdStats.itd, itdAnnualized: itdStats.itdAnnualized, inception: itdStats.inception },
        benchmark: true,
      })
    }
    return out
  }, [book, histories, daily, quotes, latestPrices, riskFree, selected, held, everHeld, today])

  const current = rows.find((r) => r.id === subject) ?? rows[0]
  const grid = current ? yearGrid(current.returns) : []
  const spyRow = rows.find((r) => r.id === BENCHMARK)
  const spyByMonth = new Map(spyRow?.returns.map((r) => [r.month, r.ret]) ?? [])
  const spyGrid = new Map(spyRow ? yearGrid(spyRow.returns).map((g) => [g.year, g.total]) : [])

  if (!rows.length)
    return (
      <div className="h-40">
        <ChartMessage>
          {loading.length
            ? `Loading monthly history (${symbols.length - loading.length}/${symbols.length})…`
            : (error ?? 'Add purchases with dates to see returns.')}
        </ChartMessage>
      </div>
    )

  return (
    <div className="space-y-6">
      <section aria-label="Return statistics">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 pr-3 text-left font-medium">Click a row for its monthly returns</th>
                <StatsHeader />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r) => {
                const active = r.id === current?.id
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSubject(r.id)}
                    aria-selected={active}
                    className={`cursor-pointer border-b border-slate-100 dark:border-slate-800 ${active ? 'bg-teal-50 dark:bg-teal-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'} ${r.benchmark ? 'text-slate-600 dark:text-slate-300' : ''}`}
                  >
                    <td className="py-2 pr-3">
                      <button type="button" className="text-left font-semibold" onClick={() => setSubject(r.id)}>
                        {r.label}
                      </button>
                      {r.sub && <span className="ml-2 text-xs text-slate-500">{r.sub}</span>}
                    </td>
                    <StatsCells r={r} />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Price returns from monthly closes (dividends not included). Portfolio rows are time-weighted (Modified Dietz),
          so buying or selling doesn’t count as gain or loss; cash is excluded. Holding ITD is from your first purchase
          price. 1D is today vs the previous close; 2W uses daily closes. 2Y and 3Y are annualized. Sharpe = annualized
          excess return ÷ volatility of monthly returns, risk-free {riskFree}% — shown only when that many full months
          exist.
          {loading.length > 0 && ` Loading ${loading.length} more…`}
          {error && <span className="text-rose-600"> {error}</span>}
        </p>
      </section>

      {current && (
        <section aria-label="Monthly returns">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">
              Monthly returns — {current.label}
              {current.sub && <span className="ml-2 text-xs font-normal text-slate-500">{current.sub}</span>}
            </h3>
            {spyRow && !current.benchmark && (
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <input type="checkbox" checked={showBench} onChange={(e) => setShowBench(e.target.checked)} />
                Show S&amp;P 500 under each year
              </label>
            )}
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[820px] text-xs tabular-nums">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1.5 pr-2 text-left font-medium">Year</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="px-1 py-1.5 text-right font-medium">
                      {m}
                    </th>
                  ))}
                  <th className="py-1.5 pl-2 text-right font-semibold">Year</th>
                </tr>
              </thead>
              <tbody>
                {grid.map((g) => (
                  <YearRows
                    key={g.year}
                    year={g.year}
                    months={g.months}
                    total={g.total}
                    bench={
                      showBench && spyRow && !current.benchmark
                        ? { byMonth: spyByMonth, total: spyGrid.get(g.year) ?? null }
                        : null
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Year = months compounded. The current month is month-to-date (italic).
          </p>
        </section>
      )}
    </div>
  )
}

function YearRows({
  year,
  months,
  total,
  bench,
}: {
  year: string
  months: (MonthReturn | null)[]
  total: number
  bench: { byMonth: Map<string, number>; total: number | null } | null
}) {
  return (
    <>
      <tr className="border-t border-slate-100 dark:border-slate-800">
        <th scope="row" className="py-1 pr-2 text-left font-semibold">
          {year}
        </th>
        {months.map((m, i) => (
          <td key={i} className="px-0.5 py-0.5 text-right">
            {m ? (
              <span
                className={`block rounded px-1 py-1 text-slate-900 dark:text-slate-100 ${m.partial ? 'italic' : ''}`}
                style={{ background: tint(m.ret) }}
                title={m.partial ? 'Month to date' : undefined}
              >
                {pct(m.ret)}
              </span>
            ) : (
              <span className="block px-1 py-1 text-slate-300 dark:text-slate-700">·</span>
            )}
          </td>
        ))}
        <td className={`py-1 pl-2 text-right font-semibold ${gainColor(total)}`}>{pct(total)}</td>
      </tr>
      {bench && (
        <tr className="text-slate-500">
          <td className="pb-1 pr-2 text-left text-[11px]">S&amp;P 500</td>
          {months.map((_, i) => {
            const v = bench.byMonth.get(`${year}-${String(i + 1).padStart(2, '0')}`)
            return (
              <td key={i} className="px-1 pb-1 text-right text-[11px]">
                {v === undefined ? '' : pct(v)}
              </td>
            )
          })}
          <td className="pb-1 pl-2 text-right text-[11px]">{pct(bench.total)}</td>
        </tr>
      )}
    </>
  )
}
