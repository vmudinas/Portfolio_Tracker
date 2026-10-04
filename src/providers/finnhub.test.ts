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
