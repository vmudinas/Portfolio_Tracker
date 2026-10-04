import { expect, it, vi } from 'vitest'
import { createTwelveDataProvider } from './twelveData'

const json = (body: unknown) => new Response(JSON.stringify(body))
const make = (fetchFn: typeof fetch) => createTwelveDataProvider('TD', { fetchFn, throttle: async () => {} })

it('parses a time series and sends the key', async () => {
  const fetchFn = vi.fn(async () =>
    json({
      status: 'ok',
      values: [
        { datetime: '2026-10-01', close: '330.32' },
        { datetime: '2026-10-02', close: '333.69' },
      ],
    }),
  )
  expect(await make(fetchFn).getHistory('aapl', '1day', 260)).toEqual([
    { date: '2026-10-01', close: 330.32 },
    { date: '2026-10-02', close: 333.69 },
  ])
  const url = String(fetchFn.mock.calls[0])
  expect(url).toContain('symbol=AAPL')
  expect(url).toContain('apikey=TD')
  expect(url).toContain('order=asc')
})

it('maps errors', async () => {
  await expect(
    make(async () => json({ status: 'error', code: 401, message: 'bad' })).getHistory('X', '1day', 1),
  ).rejects.toMatchObject({ kind: 'auth' })
  await expect(
    make(async () => json({ status: 'error', code: 429, message: 'slow' })).getHistory('X', '1day', 1),
  ).rejects.toMatchObject({ kind: 'rate' })
  expect(
    await make(async () => json({ status: 'error', code: 400, message: 'symbol not found' })).getHistory(
      'X',
      '1day',
      1,
    ),
  ).toEqual([])
})
