import { useState, type FormEvent } from 'react'
import { todayIso } from '../lib/format'
import { sharesHeld } from '../lib/portfolio'
import { validateTransaction, type TxErrors } from '../lib/validateLot'
import type { QuoteProvider } from '../providers/QuoteProvider'
import type { DividendInput, LotInput, SaleInput } from '../state/reducer'
import type { Book, Dividend, Lot, Sale } from '../types'
import { SymbolInput } from './SymbolInput'
import { Button, Field, inputClass, Modal } from './ui'

export type TxKind = 'buy' | 'sell' | 'dividend'

export type TxEditing =
  | { kind: 'buy'; lot?: Lot; symbol?: string }
  | { kind: 'sell'; sale?: Sale; symbol?: string }
  | { kind: 'dividend'; dividend?: Dividend; symbol?: string }

export type TxSave =
  | { kind: 'buy'; id?: string; input: LotInput }
  | { kind: 'sell'; id?: string; input: SaleInput }
  | { kind: 'dividend'; id?: string; input: DividendInput }

interface Props {
  editing: TxEditing
  book: Book
  provider: QuoteProvider | null
  onSave: (tx: TxSave) => void
  onClose: () => void
}

const KIND_LABEL: Record<TxKind, string> = { buy: 'Buy', sell: 'Sell', dividend: 'Dividend' }

function initialValues(e: TxEditing) {
  const base = { symbol: e.symbol ?? '', shares: '', price: '', date: todayIso(), fees: '', amount: '', notes: '' }
  if (e.kind === 'buy' && e.lot)
    return {
      ...base,
      symbol: e.lot.symbol,
      shares: String(e.lot.shares),
      price: String(e.lot.buyPrice),
      date: e.lot.buyDate || todayIso(),
      fees: e.lot.fees !== undefined ? String(e.lot.fees) : '',
      notes: e.lot.notes ?? '',
    }
  if (e.kind === 'sell' && e.sale)
    return {
      ...base,
      symbol: e.sale.symbol,
      shares: String(e.sale.shares),
      price: String(e.sale.price),
      date: e.sale.date || todayIso(),
      fees: e.sale.fees !== undefined ? String(e.sale.fees) : '',
      notes: e.sale.notes ?? '',
    }
  if (e.kind === 'dividend' && e.dividend)
    return {
      ...base,
      symbol: e.dividend.symbol,
      amount: String(e.dividend.amount),
      date: e.dividend.date || todayIso(),
      notes: e.dividend.notes ?? '',
    }
  return base
}

export function TransactionForm({ editing, book, provider, onSave, onClose }: Props) {
  const existingId =
    editing.kind === 'buy' ? editing.lot?.id : editing.kind === 'sell' ? editing.sale?.id : editing.dividend?.id
  const [kind, setKind] = useState<TxKind>(editing.kind)
  const [values, setValues] = useState(() => initialValues(editing))
  const [errors, setErrors] = useState<TxErrors>({})

  const set = (k: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }))

  const held =
    kind === 'sell' && values.symbol.trim()
      ? sharesHeld(book, values.symbol, values.date, editing.kind === 'sell' ? editing.sale?.id : undefined)
      : undefined

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs = validateTransaction(kind, values, held)
    setErrors(errs)
    if (Object.keys(errs).length) return
    const symbol = values.symbol.trim().toUpperCase()
    const extra = {
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    }
    const fees = values.fees.trim() ? { fees: Number(values.fees) } : {}
    if (kind === 'buy')
      onSave({
        kind,
        id: existingId,
        input: {
          symbol,
          shares: Number(values.shares),
          buyPrice: Number(values.price),
          buyDate: values.date,
          ...fees,
          ...extra,
        },
      })
    else if (kind === 'sell')
      onSave({
        kind,
        id: existingId,
        input: {
          symbol,
          shares: Number(values.shares),
          price: Number(values.price),
          date: values.date,
          ...fees,
          ...extra,
        },
      })
    else onSave({ kind, id: existingId, input: { symbol, amount: Number(values.amount), date: values.date, ...extra } })
  }

  const title = existingId
    ? `Edit ${values.symbol.toUpperCase()} ${kind === 'buy' ? 'purchase' : kind === 'sell' ? 'sale' : 'dividend'}`
    : kind === 'buy'
      ? 'Add a purchase'
      : kind === 'sell'
        ? 'Record a sale'
        : 'Record a dividend'

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {!existingId && (
          <div
            role="group"
            aria-label="Transaction type"
            className="grid grid-cols-3 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700"
          >
            {(['buy', 'sell', 'dividend'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k)
                  setErrors({})
                }}
                className={`rounded-md py-1.5 text-sm font-medium ${kind === k ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}

        <Field label="Symbol" error={errors.symbol}>
          <SymbolInput
            value={values.symbol}
            onChange={(v) => setValues((s) => ({ ...s, symbol: v }))}
            provider={provider}
          />
        </Field>

        {kind === 'dividend' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount received ($)" error={errors.amount} hint="Total, not per share">
              <input
                className={inputClass}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={values.amount}
                onChange={set('amount')}
                placeholder="12.50"
              />
            </Field>
            <Field label="Date" error={errors.date}>
              <input className={inputClass} type="date" max={todayIso()} value={values.date} onChange={set('date')} />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Shares"
              error={errors.shares}
              hint={held !== undefined ? `${+held.toFixed(6)} held on that date` : undefined}
            >
              <input
                className={inputClass}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={values.shares}
                onChange={set('shares')}
                placeholder="10"
              />
            </Field>
            <Field
              label={kind === 'buy' ? 'Price paid per share ($)' : 'Sale price per share ($)'}
              error={errors.price}
            >
              <input
                className={inputClass}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={values.price}
                onChange={set('price')}
                placeholder="150.00"
              />
            </Field>
            <Field label={kind === 'buy' ? 'Purchase date' : 'Sale date'} error={errors.date}>
              <input className={inputClass} type="date" max={todayIso()} value={values.date} onChange={set('date')} />
            </Field>
            <Field label="Fees ($)" error={errors.fees} hint="Optional">
              <input
                className={inputClass}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={values.fees}
                onChange={set('fees')}
                placeholder="0"
              />
            </Field>
          </div>
        )}
        {kind === 'sell' && (
          <p className="text-xs text-slate-500">Sales use your oldest shares first (FIFO) to work out realized gain.</p>
        )}
        <Field label="Notes" hint="Optional">
          <input className={inputClass} value={values.notes} onChange={set('notes')} placeholder="e.g. bought in IRA" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            {existingId
              ? 'Save changes'
              : kind === 'buy'
                ? 'Add purchase'
                : kind === 'sell'
                  ? 'Record sale'
                  : 'Record dividend'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
