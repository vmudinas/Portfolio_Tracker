import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MarketBoard } from '../../hooks/useMarketBoard'
import { gainColor, money, signedPct } from '../../lib/format'
import { MARKET_UNIVERSE } from '../../lib/marketUniverse'
import { fetchTopMovers, type Mover, type TopMovers as Movers } from '../../providers/alphaVantage'
import { ProviderError } from '../../providers/QuoteProvider'
import { Button, Card, Segmented } from '../ui'

type Source = 'large' | 'market'
const AV_CACHE = 'portfolio-tracker:top-movers'
const AV_TTL_MS = 15 * 60_000

interface Props {
  board: MarketBoard
  alphaVantageKey?: string
  owned: string[]
  watchlist: string[]
  onWatch: (symbol: string) => void
  onOpenSettings: () => void
}

function readAv(): { at: number; data: Movers } | null {
  try {
    return JSON.parse(localStorage.getItem(AV_CACHE) ?? 'null') as { at: number; data: Movers } | null
  } catch {
    return null
  }
}

/** Top 20 gainers and losers: among large caps (no extra key) or the whole US market (Alpha Vantage). */
export function TopMovers({ board, alphaVantageKey, owned, watchlist, onWatch, onOpenSettings }: Props) {
  const [source, setSource] = useState<Source>('large')
  const [av, setAv] = useState(readAv)
  const [avError, setAvError] = useState<string | null>(null)
  const [avLoading, setAvLoading] = useState(false)
  const [minPrice, setMinPrice] = useState(true)

  const loadAv = useCallback(
    async (force = false) => {
      if (!alphaVantageKey) return
      const cached = readAv()
      if (!force && cached && Date.now() - cached.at < AV_TTL_MS) return setAv(cached)
      setAvLoading(true)
      setAvError(null)
      try {
        const data = await fetchTopMovers(alphaVantageKey)
        const next = { at: Date.now(), data }
        try {
          localStorage.setItem(AV_CACHE, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        setAv(next)
      } catch (e) {
        setAvError(e instanceof ProviderError ? e.message : 'Could not load market movers.')
      } finally {
        setAvLoading(false)
      }
    },
    [alphaVantageKey],
  )

  useEffect(() => {
    if (source !== 'market' || !alphaVantageKey) return
    const cached = readAv()
    if (cached && Date.now() - cached.at < AV_TTL_MS) return
    const t = setTimeout(() => void loadAv(), 0)
    return () => clearTimeout(t)
  }, [source, alphaVantageKey, loadAv])

  const large = useMemo(() => {
    const rows: (Mover & { name: string })[] = MARKET_UNIVERSE.flatMap((s) => {
      const q = board.quotes[s.symbol]
      return q
        ? [{ symbol: s.symbol, name: s.name, price: q.price, change: q.change, changePct: q.changePct, volume: NaN }]
        : []
    })
    const sorted = [...rows].sort((a, b) => b.changePct - a.changePct)
    return {
      gainers: sorted.filter((r) => r.changePct > 0).slice(0, 20),
      losers: [...sorted]
        .reverse()
        .filter((r) => r.changePct < 0)
        .slice(0, 20),
      count: rows.length,
    }
  }, [board.quotes])

  const filter = (rows: Mover[]) => (minPrice ? rows.filter((r) => r.price >= 5) : rows)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Universe"
          value={source}
          onChange={setSource}
          options={[
            { id: 'large', label: 'Large caps (top 100)' },
            { id: 'market', label: 'Whole US market' },
          ]}
        />
        {source === 'market' && alphaVantageKey && (
          <span className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={minPrice} onChange={(e) => setMinPrice(e.target.checked)} />
              Hide stocks under $5
            </label>
            <Button className="px-2 py-1 text-xs" onClick={() => void loadAv(true)} disabled={avLoading}>
              ↻ Refresh
            </Button>
          </span>
        )}
      </div>

      {source === 'large' && (
        <>
          <p className="text-xs text-slate-500">
            Among the ~100 largest US companies (same data as the heat map)
            {board.loading ? ` · loading ${large.count}/${MARKET_UNIVERSE.length}…` : ''}.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <MoverTable
              title="Top 20 gainers"
              rows={large.gainers}
              owned={owned}
              watchlist={watchlist}
              onWatch={onWatch}
            />
            <MoverTable
              title="Top 20 losers"
              rows={large.losers}
              owned={owned}
              watchlist={watchlist}
              onWatch={onWatch}
            />
          </div>
        </>
      )}

      {source === 'market' && !alphaVantageKey && (
        <Card className="p-5 text-center text-sm">
          <p className="mx-auto max-w-md text-slate-600 dark:text-slate-400">
            Whole-market movers come from Alpha Vantage’s free API (25 requests a day — the list is cached for 15
            minutes). Get a free key at{' '}
            <a
              className="text-teal-700 underline dark:text-teal-400"
              href="https://www.alphavantage.co/support/#api-key"
              target="_blank"
              rel="noreferrer"
            >
              alphavantage.co
            </a>
            .
          </p>
          <Button variant="primary" className="mt-3" onClick={onOpenSettings}>
            Add Alpha Vantage key
          </Button>
        </Card>
      )}

      {source === 'market' && alphaVantageKey && (
        <>
          <p className="text-xs text-slate-500">
            All US-listed stocks{av ? ` · as of ${av.data.updated}` : ''}. Small, illiquid stocks and warrants often top
            these lists.
            {avLoading && ' Loading…'}
            {avError && <span className="text-rose-600"> {avError}</span>}
          </p>
          {av && (
            <div className="grid gap-4 lg:grid-cols-2">
              <MoverTable
                title="Top gainers"
                rows={filter(av.data.gainers)}
                owned={owned}
                watchlist={watchlist}
                onWatch={onWatch}
                showVolume
              />
              <MoverTable
                title="Top losers"
                rows={filter(av.data.losers)}
                owned={owned}
                watchlist={watchlist}
                onWatch={onWatch}
                showVolume
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MoverTable({
  title,
  rows,
  owned,
  watchlist,
  onWatch,
  showVolume = false,
}: {
  title: string
  rows: (Mover & { name?: string })[]
  owned: string[]
  watchlist: string[]
  onWatch: (s: string) => void
  showVolume?: boolean
}) {
  return (
    <Card className="overflow-hidden">
      <h3 className="border-b border-slate-100 px-4 py-2 font-semibold dark:border-slate-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">No data yet.</p>
      ) : (
        <table className="w-full text-sm" aria-label={title}>
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1.5 pl-4 text-left font-medium">#</th>
              <th className="py-1.5 text-left font-medium">Symbol</th>
              <th className="py-1.5 text-right font-medium">Price</th>
              <th className="py-1.5 text-right font-medium">Change</th>
              {showVolume && <th className="hidden py-1.5 text-right font-medium sm:table-cell">Volume</th>}
              <th className="py-1.5 pr-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
            {rows.map((r, i) => (
              <tr key={r.symbol}>
                <td className="py-1.5 pl-4 text-slate-400">{i + 1}</td>
                <td className="py-1.5">
                  <span className="font-semibold">{r.symbol}</span>
                  {owned.includes(r.symbol) && (
                    <span className="text-teal-600" title="In your portfolio">
                      {' '}
                      ★
                    </span>
                  )}
                  {r.name && <span className="ml-2 hidden text-xs text-slate-500 md:inline">{r.name}</span>}
                </td>
                <td className="py-1.5 text-right">{money(r.price)}</td>
                <td className={`py-1.5 text-right font-medium ${gainColor(r.changePct)}`}>{signedPct(r.changePct)}</td>
                {showVolume && (
                  <td className="hidden py-1.5 text-right text-slate-500 sm:table-cell">
                    {Number.isFinite(r.volume) ? r.volume.toLocaleString() : ''}
                  </td>
                )}
                <td className="py-1.5 pr-3 text-right">
                  <Button
                    variant="ghost"
                    className="px-2 py-0.5 text-xs"
                    onClick={() => onWatch(r.symbol)}
                    disabled={watchlist.includes(r.symbol)}
                    aria-label={`Add ${r.symbol} to watchlist`}
                    title={watchlist.includes(r.symbol) ? 'On your watchlist' : 'Add to watchlist'}
                  >
                    {watchlist.includes(r.symbol) ? '✓' : '+'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
