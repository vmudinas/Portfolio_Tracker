import { useCallback, useEffect, useRef, useState } from 'react'
import { ProviderError, type QuoteProvider } from '../providers/QuoteProvider'
import type { Quote } from '../types'

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
 * Fetch quotes for `symbols`, refreshing every `refreshSeconds` while the tab is visible.
 * Last known prices are cached in localStorage so a reload shows numbers immediately.
 */
export function useQuotes(symbols: string[], provider: QuoteProvider | null, refreshSeconds: number): QuotesState {
  const [quotes, setQuotes] = useState<Record<string, Quote>>(readCache)
  const [unknown, setUnknown] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tick, setTick] = useState(0)
  const forceRef = useRef(false)
  // When each symbol was last fetched; only used to decide what is due, so no re-render needed.
  const fetchedAtRef = useRef<Record<string, number>>({})

  const key = [...new Set(symbols)].sort().join(',')

  const refresh = useCallback(() => {
    forceRef.current = true
    setTick((t) => t + 1)
  }, [])

  // Periodic refresh while visible.
  useEffect(() => {
    if (!provider) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1)
    }, refreshSeconds * 1000)
    const onVisible = () => document.visibilityState === 'visible' && setTick((t) => t + 1)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [provider, refreshSeconds])

  useEffect(() => {
    if (!provider || !key) return
    let cancelled = false
    const force = forceRef.current
    forceRef.current = false
    const now = Date.now()
    const due = key
      .split(',')
      .filter((s) => force || now - (fetchedAtRef.current[s] ?? 0) >= refreshSeconds * 1000 - 1000)
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
  }, [provider, key, tick, refreshSeconds])

  return { quotes, unknown, error, loading, lastUpdated, refresh }
}
