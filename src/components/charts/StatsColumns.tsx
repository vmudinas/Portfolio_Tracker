import { gainColor } from '../../lib/format'
import { SHARPE_YEARS, type ReturnStats } from '../../lib/returns'
import { fmtPct } from './chartUtils'

export interface RowReturns {
  /** Fractions (0.012 = +1.2%). */
  oneDay: number | null
  twoWeek: number | null
  stats: ReturnStats
}

const COLS: { label: string; title: string }[] = [
  { label: '1D', title: 'Today vs the previous close' },
  { label: '2W', title: 'Last two weeks (daily closes)' },
  { label: 'YTD', title: 'Year to date' },
  { label: '1Y', title: 'Last 12 full months' },
  { label: '2Y', title: 'Last 24 full months, annualized' },
  { label: '3Y', title: 'Last 36 full months, annualized' },
  { label: 'ITD', title: 'Inception to date — since your first purchase' },
  { label: 'ITD / yr', title: 'ITD, annualized' },
  ...SHARPE_YEARS.map((y) => ({ label: `Sharpe ${y}Y`, title: `Sharpe ratio over the last ${y * 12} full months` })),
]

/** Header cells for the shared return-statistics columns. */
export function StatsHeader() {
  return (
    <>
      {COLS.map((c) => (
        <th key={c.label} className="px-2 py-2 text-right font-medium whitespace-nowrap" title={c.title}>
          {c.label}
        </th>
      ))}
    </>
  )
}

/** Body cells matching StatsHeader. */
export function StatsCells({ r }: { r: RowReturns }) {
  const s = r.stats
  const cell = (v: number | null, title?: string) => (
    <td className={`px-2 py-2 text-right ${gainColor(v)}`} title={title}>
      {fmtPct(v)}
    </td>
  )
  return (
    <>
      {cell(r.oneDay)}
      {cell(r.twoWeek)}
      {cell(s.ytd)}
      {cell(s.oneYear)}
      {cell(s.twoYear)}
      {cell(s.threeYear)}
      {cell(s.itd, s.inception ? `Since ${s.inception}` : undefined)}
      {cell(s.itdAnnualized)}
      {SHARPE_YEARS.map((y) => (
        <td key={y} className="px-2 py-2 text-right">
          {s.sharpe[y] === null ? '—' : s.sharpe[y]!.toFixed(2)}
        </td>
      ))}
    </>
  )
}
