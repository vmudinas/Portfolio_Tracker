import { describe, expect, it } from 'vitest'
import type { Book } from '../types'
import { buildPerformance } from './performance'

const pts = (closes: [string, number][]) => closes.map(([date, close]) => ({ date, close }))

describe('buildPerformance', () => {
  const histories = {
    AAPL: pts([
      ['2026-09-01', 100],
      ['2026-09-02', 110],
      ['2026-09-03', 110],
      ['2026-09-04', 121],
    ]),
  }
  const spy = pts([
    ['2026-09-01', 500],
    ['2026-09-04', 525],
  ])

  it('tracks value, net invested, and a return that ignores new money', () => {
    const book: Book = {
      lots: [
        { id: '1', symbol: 'AAPL', shares: 10, buyPrice: 100, buyDate: '2026-09-01' },
        // Doubling the position mid-way must not count as a gain.
        { id: '2', symbol: 'AAPL', shares: 10, buyPrice: 110, buyDate: '2026-09-03' },
      ],
      sales: [],
      dividends: [],
    }
    const { rows, missing } = buildPerformance(book, histories, spy, '2026-08-01')
    expect(missing).toEqual([])
    expect(rows.map((r) => r.value)).toEqual([1000, 1100, 2200, 2420])
    expect(rows.map((r) => r.invested)).toEqual([1000, 1000, 2100, 2100])
    // +10% then flat then +10% ⇒ +21% time-weighted
    expect(rows.map((r) => r.portfolioPct)).toEqual([0, 10, 10, 21])
    expect(rows[0].benchmarkPct).toBe(0)
    expect(rows[3].benchmarkPct).toBe(5)
  })

  it('accounts for sales and reports symbols without history', () => {
    const book: Book = {
      lots: [
        { id: '1', symbol: 'AAPL', shares: 10, buyPrice: 100, buyDate: '2026-09-01' },
        { id: '2', symbol: 'ZZZ', shares: 1, buyPrice: 5, buyDate: '2026-09-01' },
      ],
      sales: [{ id: 's', symbol: 'AAPL', shares: 5, price: 110, date: '2026-09-03' }],
      dividends: [],
    }
    const { rows, missing } = buildPerformance(book, histories, undefined, '2026-09-02')
    expect(missing).toEqual(['ZZZ'])
    expect(rows[0].date).toBe('2026-09-02')
    expect(rows.find((r) => r.date === '2026-09-03')?.value).toBe(550)
    // the sale is a cash flow, not a loss: flat on 09-03, then 550 → 605 is +10%
    expect(rows.at(-1)?.portfolioPct).toBe(10)
  })
})
