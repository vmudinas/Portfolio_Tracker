import { RateLimiter } from '../lib/rateLimiter'
import type { Quote } from '../types'
import { ProviderError, type QuoteProvider, type SymbolMatch } from './QuoteProvider'

const BASE = 'https://finnhub.io/api/v1'

// Free tier: 60 calls/min and 30 calls/sec. Stay a little under both.
const perMinute = new RateLimiter(55, 60_000)
const perSecond = new RateLimiter(20, 1_000)
const defaultThrottle = async () => {
  await perMinute.acquire()
  await perSecond.acquire()
}

interface Options {
  fetchFn?: typeof fetch
  throttle?: () => Promise<void>
}

interface FinnhubQuote {
  c: number
  d: number | null
  dp: number | null
  pc: number
  t: number
}

interface FinnhubSearch {
  result?: { symbol: string; description: string; type: string }[]
}

export function createFinnhubProvider(apiKey: string, opts: Options = {}): QuoteProvider {
  const fetchFn = opts.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const throttle = opts.throttle ?? defaultThrottle

  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    await throttle()
    const url = `${BASE}${path}?${new URLSearchParams({ ...params, token: apiKey })}`
    let res: Response
    try {
      res = await fetchFn(url)
    } catch {
      throw new ProviderError('network', 'Could not reach Finnhub. Check your connection.')
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError('auth', 'Finnhub rejected the API key.')
    if (res.status === 429) throw new ProviderError('rate', 'Finnhub rate limit reached — retrying shortly.')
    if (!res.ok) throw new ProviderError('http', `Finnhub error ${res.status}.`)
    return (await res.json()) as T
  }

  return {
    name: 'Finnhub',

    async getQuote(symbol) {
      const s = symbol.trim().toUpperCase()
      const q = await get<FinnhubQuote>('/quote', { symbol: s })
      // Unknown symbols come back as all zeros.
      if (!q || (!q.c && !q.pc)) return null
      const quote: Quote = {
        symbol: s,
        price: q.c,
        change: q.d ?? 0,
        changePct: q.dp ?? 0,
        prevClose: q.pc,
        updatedAt: q.t ? new Date(q.t * 1000).toISOString() : new Date().toISOString(),
      }
      return quote
    },

    async search(query) {
      const q = query.trim()
      if (!q) return []
      const data = await get<FinnhubSearch>('/search', { q, exchange: 'US' })
      return (data.result ?? [])
        .filter((r) => !r.symbol.includes('.'))
        .slice(0, 8)
        .map<SymbolMatch>((r) => ({ symbol: r.symbol, description: r.description, type: r.type }))
    },
  }
}
