import { useEffect, useState } from 'react'
import type { QuoteProvider } from '../providers/QuoteProvider'
import type { ExtendedQuote, MarketSession } from '../types'

const CACHE_KEY = 'portfolio-tracker:extended'
const FLUSH_MS = 1000

function readCache(): Record<string, ExtendedQuote> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, ExtendedQuote>
  } catch {
    return {}
  }
}

/**
 * During pre-market and after-hours, stream live trades and keep the latest price per symbol.
 * Kept in localStorage so Friday's after-hours price is still shown over the weekend.
 */
export function useExtendedHours(
  symbols: string[],
  provider: QuoteProvider | null,
  session: MarketSession | null,
): Record<string, ExtendedQuote> {
  const [ext, setExt] = useState<Record<string, ExtendedQuote>>(readCache)
  const key = [...new Set(symbols)].sort().join(',')

  useEffect(() => {
    if (!provider?.streamTrades || !key || (session !== 'pre' && session !== 'post')) return
    const extSession = session
    let pending: Record<string, ExtendedQuote> = {}
    const stop = provider.streamTrades(key.split(','), (t) => {
      const prev = pending[t.symbol]
      if (prev && Date.parse(prev.updatedAt) > t.time) return
      pending[t.symbol] = {
        symbol: t.symbol,
        price: t.price,
        session: extSession,
        updatedAt: new Date(t.time).toISOString(),
      }
    })
    // Trades can arrive many times a second; batch UI updates.
    const flush = setInterval(() => {
      if (Object.keys(pending).length === 0) return
      const batch = pending
      pending = {}
      setExt((prev) => {
        const next = { ...prev, ...batch }
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    }, FLUSH_MS)
    return () => {
      stop()
      clearInterval(flush)
    }
  }, [provider, key, session])

  return ext
}
