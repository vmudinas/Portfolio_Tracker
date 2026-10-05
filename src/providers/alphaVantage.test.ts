import { expect, it } from 'vitest'
import { fetchTopMovers } from './alphaVantage'

const json = (b: unknown) => async () => new Response(JSON.stringify(b))

it('parses gainers, losers and most active', async () => {
  const row = {
    ticker: 'ABC',
    price: '3.49',
    change_amount: '2.32',
    change_percentage: '198.2906%',
    volume: '189656005',
  }
  const m = await fetchTopMovers(
    'k',
    json({
      last_updated: '2026-10-02 16:15:59 US/Eastern',
      top_gainers: [row],
      top_losers: [],
      most_actively_traded: [],
    }),
  )
  expect(m.updated).toMatch(/2026-10-02/)
  expect(m.gainers[0]).toEqual({ symbol: 'ABC', price: 3.49, change: 2.32, changePct: 198.2906, volume: 189656005 })
})

it('turns Alpha Vantage notes into errors', async () => {
  await expect(
    fetchTopMovers('k', json({ Information: 'We have detected your API key as ... 25 requests per day.' })),
  ).rejects.toMatchObject({ kind: 'rate' })
  await expect(
    fetchTopMovers('k', json({ Information: 'the parameter apikey is invalid or missing.' })),
  ).rejects.toMatchObject({ kind: 'auth' })
})
