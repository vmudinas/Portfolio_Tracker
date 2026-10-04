import { useCallback, useEffect, useRef, useState } from 'react'
import { ProviderError, type QuoteProvider } from '../providers/QuoteProvider'
import type { MarketSession, Quote } from '../types'
import { useVisibleInterval } from './useVisibleInterval'

const CACHE_KEY = 'portfolio-tracker:quotes'
const BATCH = 5

function readCache(): Record<string, Quote> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, Quote>
  } catch {
    return {}
  }
}

function writeCache(quotes: Record<string, Quote>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(quotes))
  } catch {
    /* ignore */
  }
}

export interface QuotesState {
  quotes: Record<string, Quote>
  /** Symbols the provider does not know. */
  unknown: string[]
  /** Blocking problem (bad key, offline, rate limit). */
  error: string | null
  loading: boolean
  lastUpdated: Date | null
  refresh: () => void
}

/**
 * Regular-session quotes for `symbols`.
 * - Regular session (or unknown): refresh every `refreshSeconds` while the tab is visible.
 * - Pre/post/closed: fetch each symbol once per page load, then stop — prices don't change.
 * - When the regular session ends, fetch once more to pick up the closing price.
 * Last prices are cached in localStorage so a reload shows numbers immediately.
 */
export function useQuotes(
  symbols: string[],
  provider: QuoteProvider | null,
  refreshSeconds: number,
  session: MarketSession | null = null,
): QuotesState {
  const [quotes, setQuotes] = useState<Record<string, Quote>>(readCache)
  const [unknown, setUnknown] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tick, setTick] = useState(0)
  const forceRef = useRef(false)
  // When each symbol was last fetched in this page load; only used to decide what is due.
  const fetchedAtRef = useRef<Record<string, number>>({})
  const live = session === 'regular' || session === null

  const key = [...new Set(symbols)].sort().join(',')

  const refresh = useCallback(() => {
    forceRef.current = true
    setTick((t) => t + 1)
  }, [])

  const bump = useCallback(() => setTick((t) => t + 1), [])
  useVisibleInterval(bump, provider && live ? refreshSeconds * 1000 : null)

  // Session changes: entering regular → refresh now; leaving regular → one last fetch for the close.
  const prevSession = useRef(session)
  useEffect(() => {
    const prev = prevSession.current
    prevSession.current = session
    if (prev === session || prev === null) return
    if (prev === 'regular' || session === 'regular') {
      forceRef.current = true
      setTick((t) => t + 1)
    }
  }, [session])

  useEffect(() => {
    if (!provider || !key) return
    let cancelled = false
    const force = forceRef.current
    forceRef.current = false
    const now = Date.now()
    const due = key.split(',').filter((s) => {
      if (force) return true
      const last = fetchedAtRef.current[s]
      if (last === undefined) return true
      return live && now - last >= refreshSeconds * 1000 - 1000
    })
    if (due.length === 0) return

    void (async () => {
      setLoading(true)
      const got: Record<string, Quote> = {}
      const missing: string[] = []
      const stamps: Record<string, number> = {}
      let problem: string | null = null
      for (let i = 0; i < due.length && !cancelled; i += BATCH) {
        const batch = due.slice(i, i + BATCH)
        const results = await Promise.allSettled(batch.map((s) => provider.getQuote(s)))
        results.forEach((r, j) => {
          const s = batch[j]
          if (r.status === 'fulfilled') {
            stamps[s] = Date.now()
            if (r.value) got[s] = r.value
            else missing.push(s)
          } else {
            problem = r.reason instanceof ProviderError ? r.reason.message : 'Could not load prices.'
          }
        })
        const fatal = results.some(
          (r) => r.status === 'rejected' && r.reason instanceof ProviderError && r.reason.kind === 'auth',
        )
        if (fatal) break
      }
      if (cancelled) return
      setQuotes((prev) => {
        const next = { ...prev, ...got }
        writeCache(next)
        return next
      })
      fetchedAtRef.current = { ...fetchedAtRef.current, ...stamps }
      setUnknown((prev) => [...new Set([...prev.filter((s) => !(s in stamps)), ...missing])])
      setError(problem)
      if (Object.keys(stamps).length) setLastUpdated(new Date())
      setLoading(false)
    })()

    return () => {
      cancelled = true
      setLoading(false)
    }
  }, [provider, key, tick, refreshSeconds, live])

  return { quotes, unknown, error, loading, lastUpdated, refresh }
}
