import { useMemo, useState } from 'react'
import { EmptyState } from './components/EmptyState'
import { HoldingsTable } from './components/HoldingsTable'
import { LotForm } from './components/LotForm'
import { MarketBadge } from './components/MarketBadge'
import { ProfileSwitcher } from './components/ProfileSwitcher'
import { SettingsDialog } from './components/SettingsDialog'
import { SummaryCards } from './components/SummaryCards'
import { Button } from './components/ui'
import { useExtendedHours } from './hooks/useExtendedHours'
import { useMarketStatus } from './hooks/useMarketStatus'
import { useQuotes } from './hooks/useQuotes'
import { buildPositions, summarize, visibleExtended } from './lib/portfolio'
import { defaultState, parseState } from './lib/storage'
import { createFinnhubProvider } from './providers/finnhub'
import type { QuoteProvider } from './providers/QuoteProvider'
import { activeProfile } from './state/reducer'
import { useAppState } from './state/useAppState'
import type { Lot } from './types'

type Editing = { lot?: Lot; symbol?: string } | null

interface Props {
  /** Injected in tests; defaults to Finnhub with the user's key. */
  providerFactory?: (apiKey: string) => QuoteProvider
}

function App({ providerFactory = createFinnhubProvider }: Props) {
  const [state, dispatch] = useAppState()
  const [editing, setEditing] = useState<Editing>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const profile = activeProfile(state)
  const apiKey = state.settings.finnhubApiKey
  const provider = useMemo(() => (apiKey ? providerFactory(apiKey) : null), [apiKey, providerFactory])

  const symbols = useMemo(() => [...new Set(profile.lots.map((l) => l.symbol))], [profile.lots])
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

  const positions = useMemo(() => buildPositions(profile.lots, quotes, extended), [profile.lots, quotes, extended])
  const summary = useMemo(() => summarize(positions), [positions])

  const loadSample = async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sample-portfolio.json`)
      const data = (await res.json()) as { lots: unknown[] }
      const parsed = parseState({ version: 1, profiles: [{ name: 'sample', lots: data.lots }] })
      if (parsed) dispatch({ type: 'lots/replace', lots: parsed.profiles[0].lots })
    } catch {
      setNotice('Could not load the sample portfolio.')
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-9 w-9" />
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio Tracker</h1>
        </div>
        <div className="flex items-center gap-2">
          <ProfileSwitcher
            profiles={state.profiles}
            activeId={profile.id}
            onSwitch={(id) => dispatch({ type: 'profile/switch', id })}
            onAdd={(name) => dispatch({ type: 'profile/add', name })}
            onRename={(id, name) => dispatch({ type: 'profile/rename', id, name })}
            onDelete={(id) => dispatch({ type: 'profile/delete', id })}
          />
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

        {profile.lots.length === 0 ? (
          <EmptyState onAdd={() => setEditing({})} onLoadSample={loadSample} />
        ) : (
          <>
            <SummaryCards summary={summary} />
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
              <div className="flex gap-2">
                <Button onClick={refresh} disabled={!provider || loading}>
                  ↻ Refresh
                </Button>
                <Button variant="primary" onClick={() => setEditing({})}>
                  + Add stock
                </Button>
              </div>
            </div>
            <HoldingsTable
              positions={positions}
              unknown={unknown}
              onEdit={(lot) => setEditing({ lot })}
              onDelete={(lot) => dispatch({ type: 'lot/delete', id: lot.id })}
              onAddLot={(symbol) => setEditing({ symbol })}
            />
          </>
        )}
      </main>

      <footer className="mt-10 text-xs text-slate-500">
        Data stays in this browser. Prices from Finnhub, may be delayed. Not financial advice.
      </footer>

      {editing && (
        <LotForm
          initial={editing.lot ?? (editing.symbol ? { symbol: editing.symbol } : undefined)}
          provider={provider}
          onClose={() => setEditing(null)}
          onSave={(lot) => {
            if (editing.lot) dispatch({ type: 'lot/update', id: editing.lot.id, lot })
            else dispatch({ type: 'lot/add', lot })
            setEditing(null)
          }}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          state={state}
          onClose={() => setSettingsOpen(false)}
          onSave={(settings) => dispatch({ type: 'settings/update', settings })}
          onImport={(next) => dispatch({ type: 'state/replace', state: next })}
          onClearAll={() => dispatch({ type: 'state/replace', state: defaultState() })}
        />
      )}
    </div>
  )
}

export default App
