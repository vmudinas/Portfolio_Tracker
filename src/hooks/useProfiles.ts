import { useEffect, useState } from 'react'
import type { CompanyProfile, QuoteProvider } from '../providers/QuoteProvider'

const KEY = 'portfolio-tracker:profiles'
const TTL_MS = 30 * 86_400_000

type Cache = Record<string, { at: number; profile: CompanyProfile | null }>

function read(): Cache {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Cache
  } catch {
    return {}
  }
}

/** Company name + industry per symbol (cached 30 days). `null` = fund/ETF or unknown. */
export function useProfiles(symbols: string[], provider: QuoteProvider | null) {
  const [cache, setCache] = useState<Cache>(read)
  const key = [...symbols].sort().join(',')

  useEffect(() => {
    if (!provider?.getProfile || !key) return
    const current = read()
    const due = key.split(',').filter((s) => !current[s] || Date.now() - current[s].at > TTL_MS)
    if (!due.length) return
    let cancelled = false
    void (async () => {
      for (const s of due) {
        if (cancelled) return
        try {
          const profile = await provider.getProfile!(s)
          const next = { ...read(), [s]: { at: Date.now(), profile } }
          try {
            localStorage.setItem(KEY, JSON.stringify(next))
          } catch {
            /* ignore */
          }
          if (!cancelled) setCache(next)
        } catch {
          /* leave uncached; retried next time */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [provider, key])

  const out: Record<string, CompanyProfile | null | undefined> = {}
  for (const s of symbols) out[s] = cache[s]?.profile
  return out
}
