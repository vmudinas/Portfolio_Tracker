import { Fragment, useState } from 'react'
import { lotCost } from '../lib/portfolio'
import { extendedLabel, gainColor, money, shares as fmtShares, signedMoney, signedPct } from '../lib/format'
import type { Lot, Position } from '../types'
import { Button, Card } from './ui'

type SortKey = 'symbol' | 'marketValue' | 'gain' | 'gainPct' | 'dayChange'

const columns: { key: SortKey | null; label: string; align?: 'right' }[] = [
  { key: 'symbol', label: 'Symbol' },
  { key: null, label: 'Shares', align: 'right' },
  { key: null, label: 'Avg cost', align: 'right' },
  { key: null, label: 'Price', align: 'right' },
  { key: 'marketValue', label: 'Value', align: 'right' },
  { key: 'gain', label: 'Gain / loss', align: 'right' },
  { key: 'dayChange', label: 'Today', align: 'right' },
]

interface Props {
  positions: Position[]
  unknown: string[]
  onEdit: (lot: Lot) => void
  onDelete: (lot: Lot) => void
  onAddLot: (symbol: string) => void
}

export function HoldingsTable({ positions, unknown, onEdit, onDelete, onAddLot }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'marketValue', dir: -1 })
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [confirming, setConfirming] = useState<string | null>(null)

  const sorted = [...positions].sort((a, b) => {
    if (sort.key === 'symbol') return a.symbol.localeCompare(b.symbol) * sort.dir
    const av = a[sort.key] ?? -Infinity
    const bv = b[sort.key] ?? -Infinity
    return (av - bv) * sort.dir
  })

  const lotProps = { confirming, setConfirming, onEdit, onDelete, onAddLot }
  const toggle = (symbol: string) => setOpen((o) => ({ ...o, [symbol]: !o[symbol] }))

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'symbol' ? 1 : -1 }))

  return (
    <>
      {/* Phones: one card per position */}
      <ul className="space-y-2 sm:hidden" aria-label="Holdings">
        {sorted.map((p) => {
          const isOpen = !!open[p.symbol]
          return (
            <li key={p.symbol}>
              <Card className="overflow-hidden">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  className="flex w-full items-start justify-between gap-3 p-4 text-left"
                  onClick={() => toggle(p.symbol)}
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{p.symbol}</p>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {fmtShares(p.shares)} sh · avg {money(p.avgCost)} · now {money(p.price)}
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
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/70 px-2 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                    <LotList position={p} {...lotProps} />
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
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase dark:bg-slate-800/50">
              <tr>
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
                const isUnknown = unknown.includes(p.symbol)
                return (
                  <Fragment key={p.symbol}>
                    <tr
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      onClick={() => toggle(p.symbol)}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? 'Hide' : 'Show'} purchases of ${p.symbol}`}
                          className="flex items-center gap-2 font-semibold"
                        >
                          <span className="w-3 text-xs text-slate-400">{isOpen ? '▼' : '▶'}</span>
                          {p.symbol}
                        </button>
                        {isUnknown && <span className="ml-6 text-xs text-amber-600">Symbol not found</span>}
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
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{money(p.marketValue)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${gainColor(p.gain)}`}>
                        <div className="font-medium">{signedMoney(p.gain)}</div>
                        <div className="text-xs">{signedPct(p.gainPct)}</div>
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${gainColor(p.dayChange)}`}>
                        {signedMoney(p.dayChange)}
                        {p.extended && (
                          <div className={`text-xs ${gainColor(p.extended.valueChange)}`}>
                            {signedMoney(p.extended.valueChange)}
                          </div>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/70 dark:bg-slate-950/40">
                        <td colSpan={columns.length} className="px-4 py-3">
                          <LotList position={p} {...lotProps} />
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

interface LotListProps {
  position: Position
  confirming: string | null
  setConfirming: (id: string | null) => void
  onEdit: (lot: Lot) => void
  onDelete: (lot: Lot) => void
  onAddLot: (symbol: string) => void
}

function LotList({ position, confirming, setConfirming, onEdit, onDelete, onAddLot }: LotListProps) {
  return (
    <>
      <ul className="space-y-2">
        {position.lots.map((lot) => {
          const cost = lotCost(lot)
          const value = position.price === null ? null : lot.shares * position.price
          const gain = value === null ? null : value - cost
          return (
            <li key={lot.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 pl-6 text-sm">
              <span className="w-24 text-slate-500">{lot.buyDate || 'No date'}</span>
              <span className="tabular-nums">
                {fmtShares(lot.shares)} @ {money(lot.buyPrice)}
                {lot.fees ? <span className="text-slate-500"> + {money(lot.fees)} fees</span> : null}
              </span>
              <span className={`tabular-nums ${gainColor(gain)}`}>
                {signedMoney(gain)} ({signedPct(gain === null || cost === 0 ? null : (gain / cost) * 100)})
              </span>
              {lot.notes && <span className="text-slate-500 italic">{lot.notes}</span>}
              <span className="ml-auto flex gap-1">
                <Button
                  variant="ghost"
                  className="px-2 py-1"
                  onClick={() => onEdit(lot)}
                  aria-label={`Edit ${lot.symbol} purchase from ${lot.buyDate}`}
                >
                  Edit
                </Button>
                {confirming === lot.id ? (
                  <Button
                    variant="danger"
                    className="px-2 py-1"
                    onClick={() => {
                      onDelete(lot)
                      setConfirming(null)
                    }}
                  >
                    Confirm delete
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-rose-600"
                    onClick={() => setConfirming(lot.id)}
                    aria-label={`Delete ${lot.symbol} purchase from ${lot.buyDate}`}
                  >
                    Delete
                  </Button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <Button
        variant="ghost"
        className="mt-2 ml-4 px-2 py-1 text-teal-700 dark:text-teal-400"
        onClick={() => onAddLot(position.symbol)}
      >
        + Add another {position.symbol} purchase
      </Button>
    </>
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
