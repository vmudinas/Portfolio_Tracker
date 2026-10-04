import { RateLimiter } from '../lib/rateLimiter'
import type { MarketSession, MarketStatus, Quote } from '../types'
import { ProviderError, type QuoteProvider, type SymbolMatch, type Trade } from './QuoteProvider'

const BASE = 'https://finnhub.io/api/v1'
const WS = 'wss://ws.finnhub.io'

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
  WebSocketImpl?: typeof WebSocket
}

interface FinnhubMarketStatus {
  isOpen: boolean
  session: string | null
  holiday: string | null
}

interface FinnhubTradeMsg {
  type: string
  data?: { s: string; p: number; t: number }[]
}

const SESSIONS: Record<string, MarketSession> = { 'pre-market': 'pre', regular: 'regular', 'post-market': 'post' }

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
  const WebSocketImpl = opts.WebSocketImpl ?? (typeof WebSocket === 'undefined' ? undefined : WebSocket)

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

    async getMarketStatus() {
      const m = await get<FinnhubMarketStatus>('/stock/market-status', { exchange: 'US' })
      const status: MarketStatus = {
        session: (m.session && SESSIONS[m.session]) || (m.isOpen ? 'regular' : 'closed'),
        holiday: m.holiday || null,
      }
      return status
    },

    // The WebSocket feed is separate from the REST rate limit (free plan: up to 50 symbols).
    streamTrades(symbols, onTrade) {
      if (!WebSocketImpl || symbols.length === 0) return () => {}
      const Impl = WebSocketImpl
      let ws: WebSocket | null = null
      let stopped = false
      let retry = 0
      let timer: ReturnType<typeof setTimeout> | undefined
      const list = symbols.slice(0, 50)
      const send = (type: 'subscribe' | 'unsubscribe') =>
        list.forEach((symbol) => ws?.send(JSON.stringify({ type, symbol })))

      const connect = () => {
        ws = new Impl(`${WS}?token=${encodeURIComponent(apiKey)}`)
        ws.onopen = () => {
          retry = 0
          send('subscribe')
        }
        ws.onmessage = (e: MessageEvent) => {
          try {
            const msg = JSON.parse(String(e.data)) as FinnhubTradeMsg
            if (msg.type !== 'trade' || !msg.data) return
            for (const t of msg.data) onTrade({ symbol: t.s, price: t.p, time: t.t } satisfies Trade)
          } catch {
            /* ignore malformed frames */
          }
        }
        ws.onclose = () => {
          if (!stopped) timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++))
        }
        ws.onerror = () => ws?.close()
      }
      connect()

      return () => {
        stopped = true
        clearTimeout(timer)
        if (ws?.readyState === 1) send('unsubscribe')
        ws?.close()
      }
    },
  }
}
