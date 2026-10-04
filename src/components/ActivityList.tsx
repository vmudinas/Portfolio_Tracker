import { useState } from 'react'
import { gainColor, money, shares as fmtShares, signedMoney } from '../lib/format'
import type { Book, RealizedSale } from '../types'
import type { TxHandlers } from './HoldingsTable'
import type { TxKind } from './TransactionForm'
import { Button, Card, ConfirmDelete, Segmented } from './ui'

type Filter = 'all' | TxKind

interface Item {
  kind: TxKind
  id: string
  date: string
  symbol: string
  text: string
  amount: number
  gain?: number
  warn?: string
  notes?: string
}

const BADGE: Record<TxKind, string> = {
  buy: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  sell: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  dividend: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
}

/** Every purchase, sale and dividend for this profile, newest first. */
export function ActivityList({
  book,
  realized,
  onEdit,
  onDelete,
  onNew,
}: TxHandlers & { book: Book; realized: RealizedSale[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const items: Item[] = [
    ...book.lots.map<Item>((l) => ({
      kind: 'buy',
      id: l.id,
      date: l.buyDate,
      symbol: l.symbol,
      text: `Bought ${fmtShares(l.shares)} @ ${money(l.buyPrice)}${l.fees ? ` + ${money(l.fees)} fees` : ''}`,
      amount: -(l.shares * l.buyPrice + (l.fees ?? 0)),
      notes: l.notes,
    })),
    ...realized.map<Item>((r) => ({
      kind: 'sell',
      id: r.sale.id,
      date: r.sale.date,
      symbol: r.sale.symbol,
      text: `Sold ${fmtShares(r.sale.shares)} @ ${money(r.sale.price)}${r.sale.fees ? ` − ${money(r.sale.fees)} fees` : ''}`,
      amount: r.sale.shares * r.sale.price - (r.sale.fees ?? 0),
      gain: r.gain,
      warn: r.unmatched > 0 ? `${fmtShares(r.unmatched)} shares had no earlier purchase` : undefined,
      notes: r.sale.notes,
    })),
    ...book.dividends.map<Item>((d) => ({
      kind: 'dividend',
      id: d.id,
      date: d.date,
      symbol: d.symbol,
      text: 'Dividend',
      amount: d.amount,
      notes: d.notes,
    })),
  ]
    .filter((i) => filter === 'all' || i.kind === filter)
    .filter((i) => !query.trim() || i.symbol.includes(query.trim().toUpperCase()))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const findTx = (i: Item) => {
    if (i.kind === 'buy') return { kind: 'buy' as const, lot: book.lots.find((l) => l.id === i.id)! }
    if (i.kind === 'sell') return { kind: 'sell' as const, sale: book.sales.find((s) => s.id === i.id)! }
    return { kind: 'dividend' as const, dividend: book.dividends.find((d) => d.id === i.id)! }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Filter activity"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'All' },
            { id: 'buy', label: 'Buys' },
            { id: 'sell', label: 'Sales' },
            { id: 'dividend', label: 'Dividends' },
          ]}
        />
        <div className="flex items-center gap-2">
          <input
            aria-label="Filter by symbol"
            placeholder="Symbol"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm uppercase placeholder:normal-case dark:border-slate-700 dark:bg-slate-950"
          />
          <Button onClick={() => onNew('sell', '')}>Record sale</Button>
          <Button onClick={() => onNew('dividend', '')}>Record dividend</Button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No transactions yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800" aria-label="Transactions">
          {items.map((i) => (
            <li key={`${i.kind}-${i.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
              <span className="w-24 text-slate-500 tabular-nums">{i.date || 'No date'}</span>
              <span className={`w-20 rounded-full px-2 py-0.5 text-center text-xs font-medium ${BADGE[i.kind]}`}>
                {i.kind === 'buy' ? 'Buy' : i.kind === 'sell' ? 'Sell' : 'Dividend'}
              </span>
              <span className="w-16 font-semibold">{i.symbol}</span>
              <span className="min-w-0 flex-1 tabular-nums">
                {i.text}
                {i.warn && <span className="block text-xs text-amber-600">{i.warn}</span>}
                {i.notes && <span className="block text-xs text-slate-500 italic">{i.notes}</span>}
              </span>
              <span className="text-right tabular-nums">
                <span className="block">{signedMoney(i.amount)}</span>
                {i.gain !== undefined && (
                  <span className={`block text-xs ${gainColor(i.gain)}`}>Realized {signedMoney(i.gain)}</span>
                )}
              </span>
              <span className="flex gap-1">
                <Button
                  variant="ghost"
                  className="px-2 py-1"
                  onClick={() => onEdit(findTx(i))}
                  aria-label={`Edit ${i.symbol} ${i.kind} from ${i.date}`}
                >
                  Edit
                </Button>
                <ConfirmDelete
                  onConfirm={() => onDelete(i.kind, i.id)}
                  label={`Delete ${i.symbol} ${i.kind} from ${i.date}`}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
