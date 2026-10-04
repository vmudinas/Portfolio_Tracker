import { describe, expect, it, vi } from 'vitest'
import { createFinnhubProvider } from './finnhub'
import { ProviderError } from './QuoteProvider'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const make = (fetchFn: typeof fetch) => createFinnhubProvider('KEY', { fetchFn, throttle: async () => {} })

describe('finnhub provider', () => {
  it('maps a quote and sends the token', async () => {
    const fetchFn = vi.fn(async () => json({ c: 190.5, d: 1.5, dp: 0.79, pc: 189, t: 1759500000 }))
    const q = await make(fetchFn).getQuote('aapl')
    expect(q).toMatchObject({ symbol: 'AAPL', price: 190.5, change: 1.5, changePct: 0.79, prevClose: 189 })
    expect(String(fetchFn.mock.calls[0])).toContain('symbol=AAPL')
    expect(String(fetchFn.mock.calls[0])).toContain('token=KEY')
  })

  it('returns null for unknown symbols', async () => {
    const q = await make(async () => json({ c: 0, d: null, dp: null, pc: 0, t: 0 })).getQuote('ZZZZ')
    expect(q).toBeNull()
  })

  it('raises auth and rate-limit errors', async () => {
    await expect(make(async () => json({}, 401)).getQuote('AAPL')).rejects.toMatchObject({ kind: 'auth' })
    await expect(make(async () => json({}, 429)).getQuote('AAPL')).rejects.toBeInstanceOf(ProviderError)
    await expect(
      make(async () => {
        throw new TypeError('offline')
      }).getQuote('AAPL'),
    ).rejects.toMatchObject({ kind: 'network' })
  })

  it('search returns US symbols only', async () => {
    const res = await make(async () =>
      json({
        result: [
          { symbol: 'AAPL', description: 'APPLE INC', type: 'Common Stock' },
          { symbol: 'AAPL.MX', description: 'x', type: 'y' },
        ],
      }),
    ).search('apple')
    expect(res).toEqual([{ symbol: 'AAPL', description: 'APPLE INC', type: 'Common Stock' }])
  })
})

describe('market status', () => {
  it('maps Finnhub sessions', async () => {
    const status = (body: object) => make(async () => json(body)).getMarketStatus!()
    expect(await status({ isOpen: false, session: 'pre-market', holiday: null })).toEqual({
      session: 'pre',
      holiday: null,
    })
    expect(await status({ isOpen: true, session: 'regular', holiday: null })).toEqual({
      session: 'regular',
      holiday: null,
    })
    expect(await status({ isOpen: false, session: 'post-market', holiday: null })).toEqual({
      session: 'post',
      holiday: null,
    })
    expect(await status({ isOpen: false, session: null, holiday: 'Christmas' })).toEqual({
      session: 'closed',
      holiday: 'Christmas',
    })
  })
})

describe('trade stream', () => {
  class FakeSocket {
    static last: FakeSocket
    readyState = 0
    sent: string[] = []
    url: string
    onopen: (() => void) | null = null
    onmessage: ((e: { data: string }) => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(url: string) {
      this.url = url
      FakeSocket.last = this
    }
    send(m: string) {
      this.sent.push(m)
    }
    close() {
      this.readyState = 3
    }
    open() {
      this.readyState = 1
      this.onopen?.()
    }
  }

  it('subscribes, forwards trades and unsubscribes', () => {
    const p = createFinnhubProvider('KEY', { WebSocketImpl: FakeSocket as unknown as typeof WebSocket })
    const trades: unknown[] = []
    const stop = p.streamTrades!(['AAPL', 'MSFT'], (t) => trades.push(t))
    const ws = FakeSocket.last
    expect(ws.url).toBe('wss://ws.finnhub.io?token=KEY')
    ws.open()
    expect(ws.sent).toEqual([
      JSON.stringify({ type: 'subscribe', symbol: 'AAPL' }),
      JSON.stringify({ type: 'subscribe', symbol: 'MSFT' }),
    ])
    ws.onmessage?.({ data: JSON.stringify({ type: 'ping' }) })
    ws.onmessage?.({ data: JSON.stringify({ type: 'trade', data: [{ s: 'AAPL', p: 201.5, t: 1000, v: 10 }] }) })
    expect(trades).toEqual([{ symbol: 'AAPL', price: 201.5, time: 1000 }])
    stop()
    expect(ws.sent.at(-1)).toBe(JSON.stringify({ type: 'unsubscribe', symbol: 'MSFT' }))
    expect(ws.readyState).toBe(3)
  })
})
