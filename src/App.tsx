import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { ActivityList } from './components/ActivityList'
import { CashDialog } from './components/CashDialog'
import { EmptyState } from './components/EmptyState'
import { HoldingsTable, type TxHandlers } from './components/HoldingsTable'
import { MarketBadge } from './components/MarketBadge'
import { ProfileSwitcher } from './components/ProfileSwitcher'
import { SettingsDialog } from './components/SettingsDialog'
import { SummaryCards } from './components/SummaryCards'
import { ThemeToggle } from './components/ThemeToggle'
import { TransactionForm, type TxEditing, type TxSave } from './components/TransactionForm'
import { Button, Tabs } from './components/ui'
import { WatchlistPanel } from './components/WatchlistPanel'
import { describeAlert, useAlerts } from './hooks/useAlerts'
import { useExtendedHours } from './hooks/useExtendedHours'
import { useMarketStatus } from './hooks/useMarketStatus'
import { useQuotes } from './hooks/useQuotes'
import { useTheme } from './hooks/useTheme'
import { money } from './lib/format'
import { analyze, visibleExtended } from './lib/portfolio'
import { defaultState, parseDividend, parseLot, parseSale } from './lib/storage'
import { createFinnhubProvider } from './providers/finnhub'
import type { HistoryProvider } from './providers/HistoryProvider'
import type { QuoteProvider } from './providers/QuoteProvider'
import { createTwelveDataProvider } from './providers/twelveData'
import { activeProfile } from './state/reducer'
import { useAppState } from './state/useAppState'
import type { Dividend, Lot, Sale } from './types'

// Charts (and the charting library) load only when opened, keeping the first page load small.
const ChartsPanel = lazy(() => import('./components/charts/ChartsPanel'))

type Tab = 'holdings' | 'activity' | 'watchlist'

interface Props {
  /** Injected in tests; defaults to Finnhub with the user's key. */
  providerFactory?: (apiKey: string) => QuoteProvider
  historyFactory?: (apiKey: string) => HistoryProvider
}

function App({ providerFactory = createFinnhubProvider, historyFactory = createTwelveDataProvider }: Props) {
  const [state, dispatch] = useAppState()
  const [theme, setTheme] = useTheme()
  const [editing, setEditing] = useState<TxEditing | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cashOpen, setCashOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('holdings')
  const [notice, setNotice] = useState<string | null>(null)

  const profile = activeProfile(state)
  const apiKey = state.settings.finnhubApiKey
  const provider = useMemo(() => (apiKey ? providerFactory(apiKey) : null), [apiKey, providerFactory])
  const tdKey = state.settings.twelveDataApiKey
  const historyProvider = useMemo(() => (tdKey ? historyFactory(tdKey) : null), [tdKey, historyFactory])
  const showCharts = !!state.settings.showTrends

  // Everything that needs a live price: holdings, watchlist, and armed alerts.
  const symbols = useMemo(
    () =>
      [
        ...new Set([
          ...profile.lots.map((l) => l.symbol),
          ...profile.watchlist,
          ...profile.alerts.filter((a) => !a.triggeredAt).map((a) => a.symbol),
        ]),
      ].sort(),
    [profile.lots, profile.watchlist, profile.alerts],
  )
  const market = useMarketStatus(provider)
  const session = market?.session ?? null
  const { quotes, unknown, error, loading, lastUpdated, refresh } = useQuotes(
    symbols,
    provider,
    state.settings.refreshSeconds,
    session,
  )
  const extendedAll = useExtendedHours(symbols, provider, session)
  const extended = useMemo(() => visibleExtended(extendedAll, quotes, session), [extendedAll, quotes, session])

  const book = useMemo(() => ({ lots: profile.lots, sales: profile.sales, dividends: profile.dividends }), [profile])
  const { positions, summary, realized } = useMemo(
    () => analyze(book, quotes, extended, { cash: profile.cash }),
    [book, quotes, extended, profile.cash],
  )
  const bySize = useMemo(
    () => [...positions].sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0)).map((p) => p.symbol),
    [positions],
  )

  const latestPrices = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [s, q] of Object.entries(quotes)) if (q) out[s] = extended[s]?.price ?? q.price
    return out
  }, [quotes, extended])
  const onTrigger = useCallback((id: string, at: string) => dispatch({ type: 'alert/trigger', id, at }), [dispatch])
  const { fired, dismiss } = useAlerts(profile.alerts, latestPrices, onTrigger)

  const tx: TxHandlers = {
    onEdit: setEditing,
    onDelete: (kind, id) =>
      dispatch({ type: kind === 'buy' ? 'lot/delete' : kind === 'sell' ? 'sale/delete' : 'dividend/delete', id }),
    onNew: (kind, symbol) => setEditing({ kind, symbol } as TxEditing),
  }

  const saveTx = (t: TxSave) => {
    if (t.kind === 'buy')
      dispatch(t.id ? { type: 'lot/update', id: t.id, lot: t.input } : { type: 'lot/add', lot: t.input })
    else if (t.kind === 'sell')
      dispatch(t.id ? { type: 'sale/update', id: t.id, sale: t.input } : { type: 'sale/add', sale: t.input })
    else
      dispatch(
        t.id ? { type: 'dividend/update', id: t.id, dividend: t.input } : { type: 'dividend/add', dividend: t.input },
      )
    setEditing(null)
  }

  const loadSample = async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sample-portfolio.json`)
      const data = (await res.json()) as {
        lots: unknown[]
        sales?: unknown[]
        dividends?: unknown[]
        cash?: number
        watchlist?: string[]
      }
      const ok = <T,>(x: T | null): x is T => x !== null
      dispatch({
        type: 'book/import',
        book: {
          lots: data.lots.map(parseLot).filter(ok) as Lot[],
          sales: (data.sales ?? []).map(parseSale).filter(ok) as Sale[],
          dividends: (data.dividends ?? []).map(parseDividend).filter(ok) as Dividend[],
        },
      })
      if (data.cash) dispatch({ type: 'cash/set', cash: data.cash })
      for (const s of data.watchlist ?? []) dispatch({ type: 'watchlist/add', symbol: s })
    } catch {
      setNotice('Could not load the sample portfolio.')
    }
  }

  const hasActivity = profile.lots.length + profile.sales.length + profile.dividends.length > 0
  const watchCount = profile.watchlist.length + profile.alerts.filter((a) => !a.triggeredAt).length

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-9 w-9" />
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio Tracker</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProfileSwitcher
            profiles={state.profiles}
            activeId={profile.id}
            onSwitch={(id) => dispatch({ type: 'profile/switch', id })}
            onAdd={(name) => dispatch({ type: 'profile/add', name })}
            onRename={(id, name) => dispatch({ type: 'profile/rename', id, name })}
            onDelete={(id) => dispatch({ type: 'profile/delete', id })}
          />
          <ThemeToggle theme={theme} onChange={setTheme} />
          <Button aria-label="Settings" title="Settings" onClick={() => setSettingsOpen(true)}>
            ⚙<span className="hidden sm:inline">Settings</span>
          </Button>
        </div>
      </header>

      <main className="mt-6 flex-1 space-y-4">
        {!apiKey && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <span>Add your free Finnhub API key to load current prices.</span>
            <Button variant="primary" onClick={() => setSettingsOpen(true)}>
              Add API key
            </Button>
          </div>
        )}
        {(error || notice) && (
          <div
            role="alert"
            className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
          >
            {error ?? notice}
          </div>
        )}
        {fired.map((a) => (
          <div
            key={a.id}
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-sm text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100"
          >
            <span>
              🔔 <strong>{describeAlert(a)}</strong> — now {money(latestPrices[a.symbol])}
            </span>
            <Button variant="ghost" className="px-2 py-1" onClick={() => dismiss(a.id)} aria-label="Dismiss alert">
              ✕
            </Button>
          </div>
        ))}

        {!hasActivity && tab === 'holdings' ? (
          <EmptyState onAdd={() => setEditing({ kind: 'buy' })} onLoadSample={loadSample} />
        ) : (
          <>
            <SummaryCards summary={summary} onEditCash={() => setCashOpen(true)} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500" aria-live="polite">
                <MarketBadge status={market} />
                {loading
                  ? 'Updating prices…'
                  : lastUpdated
                    ? session === 'regular' || session === null
                      ? `Prices updated ${lastUpdated.toLocaleTimeString()} · may be delayed`
                      : `Last regular-session prices · auto-refresh paused until the market opens`
                    : apiKey
                      ? 'Loading prices…'
                      : 'Prices not loaded'}
                {summary.missingQuotes.length > 0 && !loading && ` · no price for ${summary.missingQuotes.join(', ')}`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  aria-pressed={showCharts}
                  onClick={() => dispatch({ type: 'settings/update', settings: { showTrends: !showCharts } })}
                >
                  {showCharts ? 'Hide charts' : '📈 Charts'}
                </Button>
                <Button onClick={refresh} disabled={!provider || loading}>
                  ↻ Refresh
                </Button>
                <Button variant="primary" onClick={() => setEditing({ kind: 'buy' })}>
                  + Add transaction
                </Button>
              </div>
            </div>
            {showCharts && (
              <Suspense fallback={<p className="text-sm text-slate-500">Loading charts…</p>}>
                <ChartsPanel
                  positions={positions}
                  cash={profile.cash}
                  book={book}
                  symbols={bySize}
                  historyProvider={historyProvider}
                  quoteProvider={provider}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              </Suspense>
            )}
          </>
        )}

        {(hasActivity || tab !== 'holdings') && (
          <>
            <Tabs
              label="Sections"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'holdings', label: `Holdings (${positions.length})` },
                { id: 'activity', label: 'Activity' },
                { id: 'watchlist', label: `Watchlist & alerts${watchCount ? ` (${watchCount})` : ''}` },
              ]}
            />
            {tab === 'holdings' &&
              (positions.length ? (
                <HoldingsTable
                  positions={positions}
                  realized={realized}
                  dividends={profile.dividends}
                  unknown={unknown}
                  {...tx}
                />
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">
                  No open positions. Past sales and dividends are in Activity.
                </p>
              ))}
            {tab === 'activity' && <ActivityList book={book} realized={realized} {...tx} />}
            {tab === 'watchlist' && (
              <WatchlistPanel
                watchlist={profile.watchlist}
                alerts={profile.alerts}
                quotes={quotes}
                extended={extended}
                unknown={unknown}
                provider={provider}
                onAdd={(symbol) => dispatch({ type: 'watchlist/add', symbol })}
                onRemove={(symbol) => dispatch({ type: 'watchlist/remove', symbol })}
                onAddAlert={(alert) => dispatch({ type: 'alert/add', alert })}
                onDeleteAlert={(id) => dispatch({ type: 'alert/delete', id })}
                onRearm={(id) => dispatch({ type: 'alert/rearm', id })}
              />
            )}
          </>
        )}
      </main>

      <footer className="mt-10 text-xs text-slate-500">
        Data stays in this browser. Prices from Finnhub (may be delayed); history from Twelve Data. Not financial
        advice.
      </footer>

      {editing && (
        <TransactionForm
          editing={editing}
          book={book}
          provider={provider}
          onClose={() => setEditing(null)}
          onSave={saveTx}
        />
      )}
      {cashOpen && (
        <CashDialog
          cash={profile.cash}
          onClose={() => setCashOpen(false)}
          onSave={(cash) => dispatch({ type: 'cash/set', cash })}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          state={state}
          theme={theme}
          onTheme={setTheme}
          onClose={() => setSettingsOpen(false)}
          onSave={(settings) => dispatch({ type: 'settings/update', settings })}
          onImport={(next) => dispatch({ type: 'state/replace', state: next })}
          onImportBook={(b) => dispatch({ type: 'book/import', book: b })}
          onClearAll={() => dispatch({ type: 'state/replace', state: defaultState() })}
        />
      )}
    </div>
  )
}

export default App
