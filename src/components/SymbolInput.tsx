import { useEffect, useState } from 'react'
import type { QuoteProvider, SymbolMatch } from '../providers/QuoteProvider'
import { inputClass } from './ui'

interface Props {
  value: string
  onChange: (v: string) => void
  provider: QuoteProvider | null
  id?: string
  placeholder?: string
  'aria-label'?: string
}

/** Ticker field with debounced Finnhub symbol suggestions. */
export function SymbolInput({ value, onChange, provider, id, placeholder = 'AAPL', ...rest }: Props) {
  const [search, setSearch] = useState<{ q: string; items: SymbolMatch[] }>({ q: '', items: [] })
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const q = value.trim()
    if (!provider || !focused || !q) return
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
  }, [value, provider, focused])

  const matches = focused && search.q === value.trim() ? search.items : []

  return (
    <div className="relative">
      <input
        id={id}
        aria-label={rest['aria-label']}
        className={`${inputClass} uppercase placeholder:normal-case`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
      />
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
                  onChange(m.symbol)
                  setFocused(false)
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
  )
}
