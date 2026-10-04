import { gainColor, money, signedMoney, signedPct } from '../lib/format'
import type { PortfolioSummary } from '../types'
import { Card } from './ui'

export function SummaryCards({ summary }: { summary: PortfolioSummary }) {
  const items = [
    { label: 'Total value', value: money(summary.marketValue), sub: null, color: '' },
    { label: 'Cost basis', value: money(summary.costBasis), sub: null, color: '' },
    {
      label: 'Total gain / loss',
      value: signedMoney(summary.gain),
      sub: signedPct(summary.gainPct),
      color: gainColor(summary.gain),
    },
    { label: "Today's change", value: signedMoney(summary.dayChange), sub: null, color: gainColor(summary.dayChange) },
  ]
  return (
    <section aria-label="Portfolio summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <Card key={it.label} className="p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{it.label}</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${it.color}`}>{it.value}</p>
          {it.sub && <p className={`text-sm font-medium tabular-nums ${it.color}`}>{it.sub}</p>}
        </Card>
      ))}
    </section>
  )
}
