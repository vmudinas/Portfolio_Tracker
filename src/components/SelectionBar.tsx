import type { ReactNode } from 'react'
import { gainColor, money, signedMoney, signedPct } from '../lib/format'
import type { Dividend, Position, RealizedSale } from '../types'
import { Button } from './ui'

interface Props {
  positions: Position[]
  realized: RealizedSale[]
  dividends: Dividend[]
  totalValue: number
  onCompare: () => void
  onReturns: () => void
  onClear: () => void
}

/** Combined totals for the ticked holdings. */
export function SelectionBar({ positions, realized, dividends, totalValue, onCompare, onReturns, onClear }: Props) {
  const symbols = new Set(positions.map((p) => p.symbol))
  const priced = positions.filter((p) => p.marketValue !== null)
  const value = priced.reduce((s, p) => s + (p.marketValue ?? 0), 0)
  const cost = priced.reduce((s, p) => s + p.costBasis, 0)
  const gain = value - cost
  const day = priced.reduce((s, p) => s + (p.dayChange ?? 0), 0)
  const real = realized.filter((r) => symbols.has(r.sale.symbol)).reduce((s, r) => s + r.gain, 0)
  const div = dividends.filter((d) => symbols.has(d.symbol)).reduce((s, d) => s + d.amount, 0)
  const ext = priced.filter((p) => p.extended)
  const extTotal = ext.reduce((s, p) => s + (p.extended?.valueChange ?? 0), 0)

  return (
    <section
      aria-label="Selected holdings total"
      className="rounded-xl border border-teal-300 bg-teal-50/70 p-4 dark:border-teal-800 dark:bg-teal-950/30"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {positions.length} selected:{' '}
          <span className="font-normal text-slate-600 dark:text-slate-300">{[...symbols].join(', ')}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onCompare} disabled={positions.length < 1}>
            Compare chart
          </Button>
          <Button onClick={onReturns}>Returns &amp; Sharpe</Button>
          <Button variant="ghost" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        <Item label="Value">
          {money(value)}
          <span className="ml-1 text-xs font-normal text-slate-500">
            {totalValue > 0 ? `${((value / totalValue) * 100).toFixed(1)}%` : ''}
          </span>
        </Item>
        <Item label="Cost basis">{money(cost)}</Item>
        <Item label="Unrealized">
          <span className={gainColor(gain)}>
            {signedMoney(gain)} <span className="text-xs">{signedPct(cost ? (gain / cost) * 100 : 0)}</span>
          </span>
        </Item>
        <Item label="Today">
          <span className={gainColor(day)}>{signedMoney(day)}</span>
          {ext.length > 0 && (
            <span className={`ml-1 text-xs ${gainColor(extTotal)}`}>
              {ext[0].extended?.session === 'pre' ? 'Pre' : 'AH'} {signedMoney(extTotal)}
            </span>
          )}
        </Item>
        <Item label="Realized">
          <span className={gainColor(real)}>{signedMoney(real)}</span>
        </Item>
        <Item label="Dividends">
          <span className={gainColor(div)}>{signedMoney(div)}</span>
        </Item>
      </div>
    </section>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="font-semibold tabular-nums">{children}</p>
    </div>
  )
}
