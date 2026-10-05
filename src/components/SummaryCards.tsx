import { extendedLabel, gainColor, money, signedMoney, signedPct } from '../lib/format'
import type { PortfolioSummary } from '../types'
import { Card } from './ui'

export function SummaryCards({
  summary,
  onEditCash,
  label = 'Portfolio summary',
}: {
  summary: PortfolioSummary
  /** Omit to show cash as plain text (e.g. the all-funds total). */
  onEditCash?: () => void
  label?: string
}) {
  const s = summary
  return (
    <section aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card className="p-4">
        <Label>Total value</Label>
        <Big>{money(s.totalValue)}</Big>
        <p className="text-sm text-slate-500 tabular-nums">
          Stocks {money(s.marketValue)} ·{' '}
          {onEditCash ? (
            <button
              type="button"
              onClick={onEditCash}
              className="underline decoration-dotted underline-offset-2 hover:text-slate-800 dark:hover:text-slate-200"
              aria-label={`Cash ${money(s.cash)}, edit`}
            >
              Cash {money(s.cash)}
            </button>
          ) : (
            <>Cash {money(s.cash)}</>
          )}
        </p>
      </Card>
      <Card className="p-4">
        <Label>Unrealized gain / loss</Label>
        <Big className={gainColor(s.gain)}>{signedMoney(s.gain)}</Big>
        <p className="text-sm tabular-nums">
          <span className={`font-medium ${gainColor(s.gain)}`}>{signedPct(s.gainPct)}</span>
          <span className="text-slate-500"> · cost {money(s.costBasis)}</span>
        </p>
      </Card>
      <Card className="p-4">
        <Label>Today’s change</Label>
        <Big className={gainColor(s.dayChange)}>{signedMoney(s.dayChange)}</Big>
        {s.extendedChange !== null && s.extendedSession && (
          <p className="text-sm tabular-nums">
            <span className="text-slate-500">{extendedLabel(s.extendedSession)} </span>
            <span className={`font-medium ${gainColor(s.extendedChange)}`}>{signedMoney(s.extendedChange)}</span>
          </p>
        )}
      </Card>
      <Card className="p-4">
        <Label>Total return</Label>
        <Big className={gainColor(s.totalReturn)}>{signedMoney(s.totalReturn)}</Big>
        <p className="text-sm text-slate-500 tabular-nums">
          Realized <span className={gainColor(s.realizedGain)}>{signedMoney(s.realizedGain)}</span> · Dividends{' '}
          <span className={gainColor(s.dividends)}>{signedMoney(s.dividends)}</span>
        </p>
      </Card>
    </section>
  )
}

const Label = ({ children }: { children: string }) => (
  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{children}</p>
)
const Big = ({ children, className = '' }: { children: string; className?: string }) => (
  <p className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${className}`}>{children}</p>
)
