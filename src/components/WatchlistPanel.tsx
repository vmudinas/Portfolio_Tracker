import { useState, type FormEvent } from 'react'
import { describeAlert } from '../hooks/useAlerts'
import { gainColor, money, signedMoney, signedPct } from '../lib/format'
import { isTicker } from '../lib/validateLot'
import type { QuoteProvider } from '../providers/QuoteProvider'
import type { AlertInput } from '../state/reducer'
import type { ExtendedQuote, PriceAlert, Quote } from '../types'
import { SymbolInput } from './SymbolInput'
import { Button, Card, ConfirmDelete, inputClass } from './ui'

interface Props {
  watchlist: string[]
  alerts: PriceAlert[]
  quotes: Record<string, Quote | undefined>
  extended: Record<string, ExtendedQuote | undefined>
  unknown: string[]
  provider: QuoteProvider | null
  onAdd: (symbol: string) => void
  onRemove: (symbol: string) => void
  onAddAlert: (alert: AlertInput) => void
  onDeleteAlert: (id: string) => void
  onRearm: (id: string) => void
}

export function WatchlistPanel(props: Props) {
  const { watchlist, alerts, quotes, extended, unknown, provider } = props
  const [symbol, setSymbol] = useState('')
  const [alertForm, setAlertForm] = useState({ symbol: '', direction: 'above' as 'above' | 'below', price: '' })
  const [alertError, setAlertError] = useState<string>()
  const [permission, setPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!isTicker(symbol)) return
    props.onAdd(symbol.trim().toUpperCase())
    setSymbol('')
  }

  const askPermission = async () => {
    if (typeof Notification === 'undefined') return
    setPermission(await Notification.requestPermission())
  }

  const addAlert = (e: FormEvent) => {
    e.preventDefault()
    const price = Number(alertForm.price)
    if (!isTicker(alertForm.symbol)) return setAlertError('Enter a ticker like AAPL')
    if (!(price > 0)) return setAlertError('Enter a target price')
    setAlertError(undefined)
    props.onAddAlert({ symbol: alertForm.symbol.trim().toUpperCase(), direction: alertForm.direction, price })
    setAlertForm((f) => ({ ...f, price: '' }))
    if (permission === 'default') void askPermission()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="p-4 lg:col-span-3">
        <h2 className="font-semibold">Watchlist</h2>
        <p className="text-xs text-slate-500">Stocks you’re watching but don’t own.</p>
        <form onSubmit={add} className="mt-3 flex gap-2">
          <div className="flex-1">
            <SymbolInput
              value={symbol}
              onChange={setSymbol}
              provider={provider}
              aria-label="Symbol to watch"
              placeholder="Add a symbol, e.g. TSLA"
            />
          </div>
          <Button type="submit" variant="primary" disabled={!isTicker(symbol)}>
            Add
          </Button>
        </form>
        {watchlist.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Nothing on your watchlist yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="py-2 text-left font-medium">Symbol</th>
                <th className="py-2 text-right font-medium">Price</th>
                <th className="py-2 text-right font-medium">Today</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {watchlist.map((s) => {
                const q = quotes[s]
                const ext = extended[s]
                const count = alerts.filter((a) => a.symbol === s && !a.triggeredAt).length
                return (
                  <tr key={s}>
                    <td className="py-2 font-semibold">
                      {s}
                      {unknown.includes(s) && (
                        <span className="block text-xs font-normal text-amber-600">Symbol not found</span>
                      )}
                      {count > 0 && <span className="ml-2 text-xs font-normal text-slate-500">🔔 {count}</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {money(q?.price)}
                      {ext && q && (
                        <span className="block text-xs text-slate-500">
                          {ext.session === 'pre' ? 'Pre' : 'AH'} {money(ext.price)}{' '}
                          <span className={gainColor(ext.price - q.price)}>
                            {signedPct(((ext.price - q.price) / q.price) * 100)}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className={`py-2 text-right tabular-nums ${gainColor(q?.change)}`}>
                      {q ? (
                        <>
                          {signedMoney(q.change)} <span className="text-xs">({signedPct(q.changePct)})</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        className="px-2 py-1"
                        onClick={() => setAlertForm((f) => ({ ...f, symbol: s }))}
                        aria-label={`Set alert for ${s}`}
                      >
                        🔔
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-rose-600"
                        onClick={() => props.onRemove(s)}
                        aria-label={`Remove ${s} from watchlist`}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-4 lg:col-span-2">
        <h2 className="font-semibold">Price alerts</h2>
        <p className="text-xs text-slate-500">
          Checked whenever prices refresh while this site is open.
          {permission === 'granted' && ' Browser notifications are on.'}
          {permission === 'denied' && ' Notifications are blocked in your browser settings — alerts show on the page.'}
        </p>
        {permission === 'default' && (
          <Button className="mt-2" onClick={askPermission}>
            Turn on notifications
          </Button>
        )}
        <form onSubmit={addAlert} className="mt-3 space-y-2" aria-label="New price alert">
          <SymbolInput
            value={alertForm.symbol}
            onChange={(v) => setAlertForm((f) => ({ ...f, symbol: v }))}
            provider={provider}
            aria-label="Alert symbol"
          />
          <div className="flex gap-2">
            <select
              aria-label="Condition"
              className={inputClass}
              value={alertForm.direction}
              onChange={(e) => setAlertForm((f) => ({ ...f, direction: e.target.value as 'above' | 'below' }))}
            >
              <option value="above">Rises above</option>
              <option value="below">Falls below</option>
            </select>
            <input
              aria-label="Target price"
              className={inputClass}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="$ price"
              value={alertForm.price}
              onChange={(e) => setAlertForm((f) => ({ ...f, price: e.target.value }))}
            />
          </div>
          {alertError && <p className="text-xs text-rose-600">{alertError}</p>}
          <Button type="submit" variant="primary" className="w-full">
            Add alert
          </Button>
        </form>
        {alerts.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 text-sm dark:divide-slate-800" aria-label="Alerts">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  {describeAlert(a)}
                  <span className="block text-xs text-slate-500">
                    {a.triggeredAt
                      ? `Triggered ${new Date(a.triggeredAt).toLocaleString()}`
                      : `Now ${money(quotes[a.symbol]?.price)}`}
                  </span>
                </span>
                {a.triggeredAt && (
                  <Button variant="ghost" className="px-2 py-1" onClick={() => props.onRearm(a.id)}>
                    Re-arm
                  </Button>
                )}
                <ConfirmDelete onConfirm={() => props.onDeleteAlert(a.id)} label={`Delete alert ${describeAlert(a)}`} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
