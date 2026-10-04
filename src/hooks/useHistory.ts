import { useEffect, useState } from 'react'
import type { HistoryInterval, HistoryProvider, PricePoint } from '../providers/HistoryProvider'
import { ProviderError } from '../providers/QuoteProvider'

const TTL_MS = 6 * 60 * 60_000
const cacheKey = (interval: HistoryInterval) => `portfolio-tracker:history:${interval}`

type Cache = Record<string, { fetchedAt: number; points: PricePoint[] }>

function readCache(interval: HistoryInterval): Cache {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(interval)) ?? '{}') as Cache
  } catch {
    return {}
  }
}

function writeCache(interval: HistoryInterval, cache: Cache) {
  try {
    localStorage.setItem(cacheKey(interval), JSON.stringify(cache))
  } catch {
    /* storage full — charts still work for this visit */
  }
}

export interface HistoryState {
  histories: Record<string, PricePoint[]>
  loading: string[]
  error: string | null
}

/** Price history for each symbol, cached in localStorage for 6 hours (history only changes once a day). */
export function useHistory(
  symbols: string[],
  provider: HistoryProvider | null,
  interval: HistoryInterval,
  points: number,
): HistoryState {
  const [cache, setCache] = useState<Cache>(() => readCache(interval))
  const [cacheInterval, setCacheInterval] = useState(interval)
  const [loading, setLoading] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const key = [...symbols].sort().join(',')

  // Switching between daily and weekly data swaps the cache (derived during render, no effect needed).
  if (cacheInterval !== interval) {
    setCacheInterval(interval)
    setCache(readCache(interval))
  }

  useEffect(() => {
    if (!provider || !key) return
    const now = Date.now()
    const current = readCache(interval)
    const due = key.split(',').filter((s) => !current[s] || now - current[s].fetchedAt > TTL_MS)
    if (due.length === 0) return
    let cancelled = false

    void (async () => {
      setLoading(due)
      setError(null)
      for (const symbol of due) {
        if (cancelled) return
        try {
          const pts = await provider.getHistory(symbol, interval, points)
          if (cancelled) return
          const next = { ...readCache(interval), [symbol]: { fetchedAt: Date.now(), points: pts } }
          writeCache(interval, next)
          setCache(next)
        } catch (e) {
          if (cancelled) return
          setError(e instanceof ProviderError ? e.message : 'Could not load price history.')
          if (e instanceof ProviderError && e.kind === 'auth') break
        }
        setLoading((l) => l.filter((s) => s !== symbol))
      }
      if (!cancelled) setLoading([])
    })()

    return () => {
      cancelled = true
    }
  }, [provider, key, interval, points])

  const histories: Record<string, PricePoint[]> = {}
  for (const s of symbols) if (cache[s]) histories[s] = cache[s].points
  return { histories, loading, error }
}
