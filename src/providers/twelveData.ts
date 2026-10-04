import { RateLimiter } from '../lib/rateLimiter'
import type { HistoryInterval, HistoryProvider, PricePoint } from './HistoryProvider'
import { ProviderError } from './QuoteProvider'

const BASE = 'https://api.twelvedata.com'

// Free plan: 8 requests/min, 800/day.
const perMinute = new RateLimiter(8, 61_000)

interface Options {
  fetchFn?: typeof fetch
  throttle?: () => Promise<void>
}

interface TimeSeries {
  status?: string
  code?: number
  message?: string
  values?: { datetime: string; close: string }[]
}

export function createTwelveDataProvider(apiKey: string, opts: Options = {}): HistoryProvider {
  const fetchFn = opts.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const throttle = opts.throttle ?? (() => perMinute.acquire())

  return {
    name: 'Twelve Data',
    async getHistory(symbol: string, interval: HistoryInterval, points: number): Promise<PricePoint[]> {
      await throttle()
      const params = new URLSearchParams({
        symbol: symbol.toUpperCase(),
        interval,
        outputsize: String(points),
        order: 'asc',
        apikey: apiKey,
      })
      let data: TimeSeries
      try {
        const res = await fetchFn(`${BASE}/time_series?${params}`)
        data = (await res.json()) as TimeSeries
      } catch {
        throw new ProviderError('network', 'Could not reach Twelve Data.')
      }
      if (data.status === 'error') {
        if (data.code === 401 || data.code === 403) throw new ProviderError('auth', 'Twelve Data rejected the API key.')
        if (data.code === 429) throw new ProviderError('rate', 'Twelve Data limit reached — try again in a minute.')
        if (data.code === 400 || data.code === 404) return [] // unknown symbol
        throw new ProviderError('http', data.message ?? 'Twelve Data error.')
      }
      return (data.values ?? [])
        .map((v) => ({ date: v.datetime.slice(0, 10), close: Number(v.close) }))
        .filter((p) => Number.isFinite(p.close))
    },
  }
}
