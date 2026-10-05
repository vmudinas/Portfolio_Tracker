import { useCallback, useEffect, useRef, useState } from 'react'
import { RateLimiter } from '../lib/rateLimiter'
import { INDEX_ETFS, MARKET_UNIVERSE } from '../lib/marketUniverse'
import { ProviderError, type QuoteProvider } from '../providers/QuoteProvider'
import type { MarketSession, Quote } from '../types'
import { useVisibleInterval } from './useVisibleInterval'

const CACHE_KEY = 'portfolio-tracker:market'
const REFRESH_MS = 5 * 60_000
const CLOSED_STALE_MS = 12 * 60 * 60_000
const BATCH = 5

// Stay well under Finnhub's 60/min so the portfolio's own price refresh always has room.
const marketLimiter = new RateLimiter(40, 60_000)

type Cached = Quote & { fetchedAt: number }

function read(): Record<string, Cached> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, Cached>
  } catch {
    return {}
  }
}

export const MARKET_SYMBOLS = [...INDEX_ETFS.map((e) => e.symbol), ...MARKET_UNIVERSE.map((s) => s.symbol)]

export interface MarketBoard {
  quotes: Record<string, Cached>
  loading: boolean
  /** How many symbols are still waiting to load. */
  pending: number
  error: string | null
  updatedAt: number | null
  refresh: () => void
}

/**
 * Quotes for the ~100 large caps on the heat map (plus index ETFs). Only runs while `enabled`
 * (a market tab is open). Refreshes every 5 minutes during the regular session; otherwise uses
 * cached prices unless they're more than 12 hours old.
 */
export function useMarketBoard(
  provider: QuoteProvider | null,
  session: MarketSession | null,
  enabled: boolean,
): MarketBoard {
  const [quotes, setQuotes] = useState<Record<string, Cached>>(read)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const force = useRef(false)
  const live = session === 'regular' || session === null

  const refresh = useCallback(() => {
    force.current = true
    setTick((t) => t + 1)
  }, [])
  const bump = useCallback(() => setTick((t) => t + 1), [])
  useVisibleInterval(bump, enabled && provider && live ? REFRESH_MS : null)

  useEffect(() => {
    if (!enabled || !provider) return
    const now = Date.now()
    const cache = read()
    const forced = force.current
    force.current = false
    const maxAge = live ? REFRESH_MS - 5000 : CLOSED_STALE_MS
    // Indexes first, then biggest companies, so the map fills in from the largest tiles.
    const due = MARKET_SYMBOLS.filter((s) => forced || !cache[s] || now - cache[s].fetchedAt > maxAge)
    if (!due.length) return
    let cancelled = false

    void (async () => {
      setPending(due.length)
      setError(null)
      for (let i = 0; i < due.length && !cancelled; i += BATCH) {
        const batch = due.slice(i, i + BATCH)
        const got: Record<string, Cached> = {}
        let fatal = false
        await Promise.all(
          batch.map(async (s) => {
            try {
              await marketLimiter.acquire()
              if (cancelled) return
              const q = await provider.getQuote(s)
              if (q) got[s] = { ...q, fetchedAt: Date.now() }
            } catch (e) {
              setError(e instanceof ProviderError ? e.message : 'Could not load market prices.')
              if (e instanceof ProviderError && e.kind === 'auth') fatal = true
            }
          }),
        )
        if (cancelled) return
        if (Object.keys(got).length) {
          setQuotes((prev) => {
            const next = { ...prev, ...got }
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify(next))
            } catch {
              /* ignore */
            }
            return next
          })
        }
        setPending((p) => Math.max(0, p - batch.length))
        if (fatal) break
      }
      if (!cancelled) setPending(0)
    })()

    return () => {
      cancelled = true
      setPending(0)
    }
  }, [enabled, provider, tick, live])

  const times = Object.values(quotes).map((q) => q.fetchedAt)
  return {
    quotes,
    loading: pending > 0,
    pending,
    error,
    updatedAt: times.length ? Math.max(...times) : null,
    refresh,
  }
}
