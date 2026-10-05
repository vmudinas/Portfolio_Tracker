import { describe, expect, it } from 'vitest'
import type { Book } from '../types'
import { holdingOneDay, holdingTwoWeek, portfolioOneDay, portfolioTwoWeek } from './shortTerm'
import { buildTrendRows, oneDaySeries } from './trends'

const today = new Date('2026-10-05T12:00:00')
const daily = (pairs: [string, number][]) => pairs.map(([date, close]) => ({ date, close }))

describe('short-term returns', () => {
  const aapl = daily([
    ['2026-09-18', 100], // 14 days before 2026-10-05 is 2026-09-21 (Mon) — the base is the close on/before it
    ['2026-09-21', 110],
    ['2026-09-28', 115],
    ['2026-10-02', 121],
  ])

  it('measures a holding over two weeks from the close on/before the cut-off', () => {
    expect(holdingTwoWeek(aapl, undefined, today)).toBeCloseTo(0.1) // 121 / 110
    expect(holdingTwoWeek(aapl, 132, today)).toBeCloseTo(0.2)
    expect(holdingTwoWeek([], 1, today)).toBeNull()
  })

  it('computes one-day moves for a holding and a portfolio', () => {
    const q = (symbol: string, price: number, change: number) => ({
      symbol,
      price,
      change,
      changePct: 0,
      prevClose: price - change,
      updatedAt: '',
    })
    expect(holdingOneDay(q('AAPL', 110, 10))).toBeCloseTo(0.1)
    const book: Book = {
      lots: [
        { id: '1', symbol: 'AAPL', shares: 10, buyPrice: 50, buyDate: '2025-01-01' },
        { id: '2', symbol: 'MSFT', shares: 1, buyPrice: 50, buyDate: '2025-01-01' },
      ],
      sales: [],
      dividends: [],
    }
    // AAPL 10 × (+10 on 100) and MSFT 1 × (−20 on 200): +80 / 1200
    expect(portfolioOneDay(book, { AAPL: q('AAPL', 110, 10), MSFT: q('MSFT', 180, -20) })).toBeCloseTo(80 / 1200)
  })

  it('computes a time-weighted two-week portfolio return that ignores new money', () => {
    const book: Book = {
      lots: [
        { id: '1', symbol: 'AAPL', shares: 10, buyPrice: 90, buyDate: '2026-01-01' },
        { id: '2', symbol: 'AAPL', shares: 10, buyPrice: 115, buyDate: '2026-09-28' },
      ],
      sales: [],
      dividends: [],
    }
    // 110 → 115 (+4.545%), then the purchase, then 115 → 121 (+5.217%) ⇒ +10%
    expect(portfolioTwoWeek(book, { AAPL: aapl }, today)).toBeCloseTo(0.1)
  })
})

describe('1D series', () => {
  it('keeps only the latest session and starts from the previous close', () => {
    const intraday = {
      AAPL: daily([
        ['2026-10-01 15:55:00', 99],
        ['2026-10-02 09:30:00', 101],
        ['2026-10-02 16:00:00', 104],
      ]),
    }
    const { histories, day } = oneDaySeries(intraday, { AAPL: 100 })
    expect(day).toBe('2026-10-02')
    expect(histories.AAPL.map((p) => p.close)).toEqual([100, 101, 104])
    const { rows, stats } = buildTrendRows(intraday, ['AAPL'], '1D', 'percent', today, { AAPL: 100 })
    expect(rows.map((r) => r.AAPL)).toEqual([0, 1, 4])
    expect(stats[0].changePct).toBeCloseTo(4)
  })
})
