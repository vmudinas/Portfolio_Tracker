import { Fragment, useState, type ReactNode } from 'react'
import { formatHolding } from '../lib/portfolio'
import { extendedLabel, gainColor, money, shares as fmtShares, signedMoney, signedPct } from '../lib/format'
import type { Dividend, Position, RealizedSale } from '../types'
import type { TxEditing, TxKind } from './TransactionForm'
import { Button, Card, ConfirmDelete } from './ui'

type SortKey = 'symbol' | 'marketValue' | 'gain' | 'dayChange' | 'holdingDays'

const columns: { key: SortKey | null; label: string; align?: 'right' }[] = [
  { key: 'symbol', label: 'Symbol' },
  { key: null, label: 'Shares', align: 'right' },
  { key: null, label: 'Avg cost', align: 'right' },
  { key: null, label: 'Price', align: 'right' },
  { key: 'marketValue', label: 'Value / weight', align: 'right' },
  { key: 'gain', label: 'Gain / loss', align: 'right' },
  { key: 'dayChange', label: 'Today', align: 'right' },
  { key: 'holdingDays', label: 'Held', align: 'right' },
]

export interface TxHandlers {
  onEdit: (tx: TxEditing) => void
  onDelete: (kind: TxKind, id: string) => void
  onNew: (kind: TxKind, symbol: string) => void
}

interface Props extends TxHandlers {
  positions: Position[]
  realized: RealizedSale[]
  dividends: Dividend[]
  unknown: string[]
  /** Ticked holdings (for combined totals / comparison). */
  selected: string[]
  onToggleSelect: (symbol: string) => void
  onSelectAll: (all: boolean) => void
}

export function HoldingsTable({
  positions,
  realized,
  dividends,
  unknown,
  selected,
  onToggleSelect,
  onSelectAll,
  ...handlers
}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'marketValue', dir: -1 })
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const sorted = [...positions].sort((a, b) => {
    if (sort.key === 'symbol') return a.symbol.localeCompare(b.symbol) * sort.dir
    const av = a[sort.key] ?? -Infinity
    const bv = b[sort.key] ?? -Infinity
    return (av - bv) * sort.dir
  })

  const toggle = (symbol: string) => setOpen((o) => ({ ...o, [symbol]: !o[symbol] }))
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'symbol' ? 1 : -1 }))
  const detail = (p: Position) => (
    <PositionDetail
      position={p}
      sales={realized.filter((r) => r.sale.symbol === p.symbol)}
      dividends={dividends.filter((d) => d.symbol === p.symbol)}
      {...handlers}
    />
  )

  return (
    <>
      {/* Phones: one card per position */}
      <ul className="space-y-2 sm:hidden" aria-label="Holdings">
        {sorted.map((p) => {
          const isOpen = !!open[p.symbol]
          return (
            <li key={p.symbol}>
              <Card className={`overflow-hidden ${selected.includes(p.symbol) ? 'ring-2 ring-teal-600' : ''}`}>
                <div className="flex items-start">
                  <label className="flex items-center self-stretch py-4 pl-4">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-teal-700"
                      checked={selected.includes(p.symbol)}
                      onChange={() => onToggleSelect(p.symbol)}
                      aria-label={`Select ${p.symbol}`}
                    />
                  </label>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-start justify-between gap-3 p-4 pl-3 text-left"
                    onClick={() => toggle(p.symbol)}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {p.symbol}
                        {p.weight !== null && (
                          <span className="ml-2 text-xs font-normal text-slate-500">{p.weight.toFixed(1)}%</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                        {fmtShares(p.shares)} sh · avg {money(p.avgCost)} · now {money(p.price)}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        Held {formatHolding(p.holdingDays)}
                        {p.annualizedPct !== null && (
                          <span className={gainColor(p.annualizedPct)}> · {signedPct(p.annualizedPct)}/yr</span>
                        )}
                      </p>
                      {unknown.includes(p.symbol) && <p className="text-xs text-amber-600">Symbol not found</p>}
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p className="font-semibold">{money(p.marketValue)}</p>
                      <p className={`text-sm font-medium ${gainColor(p.gain)}`}>
                        {signedMoney(p.gain)} <span className="text-xs">({signedPct(p.gainPct)})</span>
                      </p>
                      <p className={`text-xs ${gainColor(p.dayChange)}`}>Today {signedMoney(p.dayChange)}</p>
                      {p.extended && <ExtendedLine move={p.extended} withValue />}
                    </div>
                  </button>
                </div>
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                    {detail(p)}
                  </div>
                )}
              </Card>
            </li>
          )
        })}
      </ul>

      {/* Tablets and up: sortable table */}
      <Card className="hidden overflow-hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase dark:bg-slate-800/50">
              <tr>
                <th scope="col" className="w-10 py-3 pl-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-teal-700"
                    aria-label="Select all holdings"
                    checked={positions.length > 0 && selected.length === positions.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.length > 0 && selected.length < positions.length
                    }}
                    onChange={(e) => onSelectAll(e.target.checked)}
                  />
                </th>
                {columns.map((c) => (
                  <th
                    key={c.label}
                    scope="col"
                    className={`px-4 py-3 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                    aria-sort={c.key && sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                  >
                    {c.key ? (
                      <button
                        type="button"
                        className="uppercase hover:text-slate-900 dark:hover:text-slate-100"
                        onClick={() => toggleSort(c.key!)}
                      >
                        {c.label}
                        {sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sorted.map((p) => {
                const isOpen = !!open[p.symbol]
                return (
                  <Fragment key={p.symbol}>
                    <tr
                      className={`cursor-pointer ${selected.includes(p.symbol) ? 'bg-teal-50/60 dark:bg-teal-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                      onClick={() => toggle(p.symbol)}
                    >
                      <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-teal-700"
                          checked={selected.includes(p.symbol)}
                          onChange={() => onToggleSelect(p.symbol)}
                          aria-label={`Select ${p.symbol}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${p.symbol}`}
                          className="flex items-center gap-2 font-semibold"
                        >
                          <span className="w-3 text-xs text-slate-400">{isOpen ? '▼' : '▶'}</span>
                          {p.symbol}
                        </button>
                        {unknown.includes(p.symbol) && (
                          <span className="ml-6 text-xs text-amber-600">Symbol not found</span>
                        )}
                        {p.lots.length > 1 && (
                          <span className="ml-6 block text-xs text-slate-500">{p.lots.length} purchases</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtShares(p.shares)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(p.avgCost)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div>{money(p.price)}</div>
                        {p.extended && <ExtendedLine move={p.extended} />}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div className="font-medium">{money(p.marketValue)}</div>
                        <div className="text-xs text-slate-500">
                          {p.weight === null ? '—' : `${p.weight.toFixed(1)}%`}
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${gainColor(p.gain)}`}>
                        <div className="font-medium">{signedMoney(p.gain)}</div>
                        <div className="text-xs">{signedPct(p.gainPct)}</div>
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${gainColor(p.dayChange)}`}>
                        {signedMoney(p.dayChange)}
                        {p.extended && (
                          <div className={`text-xs ${gainColor(p.extended.valueChange)}`}>
                            <span className="text-slate-500">{p.extended.session === 'pre' ? 'Pre ' : 'AH '}</span>
                            {signedMoney(p.extended.valueChange)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <div>{formatHolding(p.holdingDays)}</div>
                        <div
                          className={`text-xs ${p.annualizedPct === null ? 'text-slate-400' : gainColor(p.annualizedPct)}`}
                          title={
                            p.annualizedPct === null ? 'Annualized return shows after a year' : 'Annualized return'
                          }
                        >
                          {p.annualizedPct === null ? '—' : `${signedPct(p.annualizedPct)}/yr`}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/70 dark:bg-slate-950/40">
                        <td colSpan={columns.length + 1} className="px-6 py-3">
                          {detail(p)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

interface DetailProps extends TxHandlers {
  position: Position
  sales: RealizedSale[]
  dividends: Dividend[]
}

function PositionDetail({ position: p, sales, dividends, onEdit, onDelete, onNew }: DetailProps) {
  return (
    <div className="space-y-3 text-sm">
      <Section title="Purchases still held">
        {p.lots.map((lot) => {
          const cost = lot.remaining * lot.costPerShare
          const gain = p.price === null ? null : lot.remaining * p.price - cost
          return (
            <Row
              key={lot.id}
              date={lot.buyDate}
              main={
                <>
                  {fmtShares(lot.remaining)}
                  {lot.remaining < lot.shares && (
                    <span className="text-slate-500"> of {fmtShares(lot.shares)}</span>
                  )} @ {money(lot.buyPrice)}
                  {lot.fees ? <span className="text-slate-500"> + {money(lot.fees)} fees</span> : null}
                </>
              }
              value={
                <span className={gainColor(gain)}>
                  {signedMoney(gain)} ({signedPct(gain === null || cost === 0 ? null : (gain / cost) * 100)})
                </span>
              }
              notes={lot.notes}
              onEdit={() => onEdit({ kind: 'buy', lot })}
              onDelete={() => onDelete('buy', lot.id)}
              what={`${lot.symbol} purchase from ${lot.buyDate}`}
            />
          )
        })}
      </Section>
      {sales.length > 0 && (
        <Section title="Sales">
          {sales.map((r) => (
            <Row
              key={r.sale.id}
              date={r.sale.date}
              main={
                <>
                  Sold {fmtShares(r.sale.shares)} @ {money(r.sale.price)}
                  {r.unmatched > 0 && (
                    <span className="text-amber-600"> · {fmtShares(r.unmatched)} without a matching buy</span>
                  )}
                </>
              }
              value={<span className={gainColor(r.gain)}>Realized {signedMoney(r.gain)}</span>}
              notes={r.sale.notes}
              onEdit={() => onEdit({ kind: 'sell', sale: r.sale })}
              onDelete={() => onDelete('sell', r.sale.id)}
              what={`${r.sale.symbol} sale from ${r.sale.date}`}
            />
          ))}
        </Section>
      )}
      {dividends.length > 0 && (
        <Section title="Dividends">
          {dividends.map((d) => (
            <Row
              key={d.id}
              date={d.date}
              main="Dividend"
              value={<span className={gainColor(d.amount)}>{signedMoney(d.amount)}</span>}
              notes={d.notes}
              onEdit={() => onEdit({ kind: 'dividend', dividend: d })}
              onDelete={() => onDelete('dividend', d.id)}
              what={`${d.symbol} dividend from ${d.date}`}
            />
          ))}
        </Section>
      )}
      <div className="flex flex-wrap gap-1 pt-1">
        <Button
          variant="ghost"
          className="px-2 py-1 text-teal-700 dark:text-teal-400"
          onClick={() => onNew('buy', p.symbol)}
        >
          + Buy more
        </Button>
        <Button
          variant="ghost"
          className="px-2 py-1 text-teal-700 dark:text-teal-400"
          onClick={() => onNew('sell', p.symbol)}
        >
          Sell
        </Button>
        <Button
          variant="ghost"
          className="px-2 py-1 text-teal-700 dark:text-teal-400"
          onClick={() => onNew('dividend', p.symbol)}
        >
          + Dividend
        </Button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">{title}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  )
}

function Row(props: {
  date: string
  main: ReactNode
  value: ReactNode
  notes?: string
  onEdit: () => void
  onDelete: () => void
  what: string
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-1">
      <span className="w-24 text-slate-500 tabular-nums">{props.date || 'No date'}</span>
      <span className="tabular-nums">{props.main}</span>
      <span className="tabular-nums">{props.value}</span>
      {props.notes && <span className="text-slate-500 italic">{props.notes}</span>}
      <span className="ml-auto flex gap-1">
        <Button variant="ghost" className="px-2 py-1" onClick={props.onEdit} aria-label={`Edit ${props.what}`}>
          Edit
        </Button>
        <ConfirmDelete onConfirm={props.onDelete} label={`Delete ${props.what}`} />
      </span>
    </li>
  )
}

function ExtendedLine({ move, withValue = false }: { move: NonNullable<Position['extended']>; withValue?: boolean }) {
  return (
    <div className="text-xs whitespace-nowrap" title={`${extendedLabel(move.session)} price vs last close`}>
      <span className="text-slate-500">{move.session === 'pre' ? 'Pre' : 'AH'} </span>
      <span className="text-slate-700 dark:text-slate-300">{money(move.price)}</span>{' '}
      <span className={gainColor(move.change)}>
        {signedPct(move.changePct)}
        {withValue ? ` · ${signedMoney(move.valueChange)}` : ''}
      </span>
    </div>
  )
}
