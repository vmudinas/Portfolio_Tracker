import { useEffect, useState, type FormEvent } from 'react'
import { todayIso } from '../lib/format'
import { validateLot, type LotErrors } from '../lib/validateLot'
import type { QuoteProvider, SymbolMatch } from '../providers/QuoteProvider'
import type { LotInput } from '../state/reducer'
import type { Lot } from '../types'
import { Button, Field, inputClass, Modal } from './ui'

interface Props {
  initial?: Lot | { symbol: string }
  provider: QuoteProvider | null
  onSave: (lot: LotInput) => void
  onClose: () => void
}

export function LotForm({ initial, provider, onSave, onClose }: Props) {
  const existing = initial && 'id' in initial ? initial : undefined
  const [values, setValues] = useState({
    symbol: initial?.symbol ?? '',
    shares: existing ? String(existing.shares) : '',
    buyPrice: existing ? String(existing.buyPrice) : '',
    buyDate: existing?.buyDate || todayIso(),
    fees: existing?.fees !== undefined ? String(existing.fees) : '',
    notes: existing?.notes ?? '',
  })
  const [errors, setErrors] = useState<LotErrors>({})
  const [search, setSearch] = useState<{ q: string; items: SymbolMatch[] }>({ q: '', items: [] })
  const [symbolFocused, setSymbolFocused] = useState(false)

  const set = (k: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }))

  // Debounced symbol search while typing.
  useEffect(() => {
    const q = values.symbol.trim()
    if (!provider || !symbolFocused || !q) return
    let cancelled = false
    const t = setTimeout(() => {
      provider
        .search(q)
        .then((items) => !cancelled && setSearch({ q, items }))
        .catch(() => !cancelled && setSearch({ q, items: [] }))
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [values.symbol, provider, symbolFocused])

  const matches = symbolFocused && search.q === values.symbol.trim() ? search.items : []

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs = validateLot(values)
    setErrors(errs)
    if (Object.keys(errs).length) return
    onSave({
      symbol: values.symbol.trim().toUpperCase(),
      shares: Number(values.shares),
      buyPrice: Number(values.buyPrice),
      buyDate: values.buyDate,
      ...(values.fees.trim() ? { fees: Number(values.fees) } : {}),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    })
  }

  return (
    <Modal title={existing ? `Edit ${existing.symbol} purchase` : 'Add a purchase'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="relative">
          <Field label="Symbol" error={errors.symbol}>
            <input
              className={`${inputClass} uppercase`}
              value={values.symbol}
              onChange={set('symbol')}
              onFocus={() => setSymbolFocused(true)}
              onBlur={() => setTimeout(() => setSymbolFocused(false), 150)}
              placeholder="AAPL"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </Field>
          {matches.length > 0 && (
            <ul
              role="listbox"
              aria-label="Matching symbols"
              className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
              {matches.map((m) => (
                <li key={m.symbol}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setValues((v) => ({ ...v, symbol: m.symbol }))
                      setSymbolFocused(false)
                    }}
                  >
                    <span className="font-semibold">{m.symbol}</span>
                    <span className="truncate text-slate-500">{m.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Shares" error={errors.shares}>
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
          <Field label="Price paid per share ($)" error={errors.buyPrice}>
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={values.buyPrice}
              onChange={set('buyPrice')}
              placeholder="150.00"
            />
          </Field>
          <Field label="Purchase date" error={errors.buyDate}>
            <input
              className={inputClass}
              type="date"
              max={todayIso()}
              value={values.buyDate}
              onChange={set('buyDate')}
            />
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
        <Field label="Notes" hint="Optional">
          <input className={inputClass} value={values.notes} onChange={set('notes')} placeholder="e.g. bought in IRA" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            {existing ? 'Save changes' : 'Add purchase'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
