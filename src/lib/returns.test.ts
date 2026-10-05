import { describe, expect, it } from 'vitest'
import type { Book } from '../types'
import {
  chain,
  filterBook,
  fundMonthlyReturns,
  portfolioMonthlyReturns,
  returnStats,
  sharpe,
  yearGrid,
} from './returns'

const today = new Date('2026-10-04T12:00:00')
const monthly = (start: string, closes: number[]) => {
  let [y, m] = start.split('-').map(Number)
  return closes.map((close) => {
    const p = { date: `${y}-${String(m).padStart(2, '0')}-01`, close }
    if (m === 12) {
      m = 1
      y++
    } else m++
    return p
  })
}

describe('fund monthly returns', () => {
  it('computes month-over-month returns and marks the current month partial', () => {
    const r = fundMonthlyReturns(monthly('2026-07', [100, 110, 99, 104]), today)
    expect(r.map((x) => x.month)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(r[0].ret).toBeCloseTo(0.1)
    expect(r[1].ret).toBeCloseTo(-0.1)
    expect(r[2].partial).toBe(true)
  })

  it('uses the live price for the current month when given', () => {
    const r = fundMonthlyReturns(monthly('2026-08', [100, 110]), today, 121)
    expect(r.at(-1)).toMatchObject({ month: '2026-10', partial: true })
    expect(r.at(-1)!.ret).toBeCloseTo(0.1)
  })
})

describe('portfolio monthly returns (Modified Dietz)', () => {
  const hist = { AAPL: monthly('2026-06', [100, 110, 110, 121, 121]) } // Jun..Oct month closes

  it('does not count new money as a gain', () => {
    const book: Book = {
      lots: [
        { id: '1', symbol: 'AAPL', shares: 10, buyPrice: 100, buyDate: '2026-06-30' },
        // Doubling the position on the last day of August must not move August's return.
        { id: '2', symbol: 'AAPL', shares: 10, buyPrice: 110, buyDate: '2026-08-31' },
      ],
      sales: [],
      dividends: [],
    }
    const { returns, missing } = portfolioMonthlyReturns(book, hist, today)
    expect(missing).toEqual([])
    const by = Object.fromEntries(returns.map((r) => [r.month, r.ret]))
    expect(by['2026-06']).toBeUndefined() // bought at the month's last close: no exposure yet
    expect(by['2026-07']).toBeCloseTo(0.1)
    expect(by['2026-08']).toBeCloseTo(0)
    expect(by['2026-09']).toBeCloseTo(0.1)
    expect(returns.at(-1)).toMatchObject({ month: '2026-10', partial: true })
  })

  it('treats sales as withdrawals and supports a subset of holdings', () => {
    const book: Book = {
      lots: [
        { id: '1', symbol: 'AAPL', shares: 10, buyPrice: 100, buyDate: '2026-06-30' },
        { id: '2', symbol: 'ZZZ', shares: 1, buyPrice: 5, buyDate: '2026-06-30' },
      ],
      sales: [{ id: 's', symbol: 'AAPL', shares: 5, price: 110, date: '2026-07-31' }],
      dividends: [],
    }
    const { returns, missing } = portfolioMonthlyReturns(filterBook(book, ['AAPL']), hist, today)
    expect(missing).toEqual([])
    expect(returns.find((r) => r.month === '2026-07')!.ret).toBeCloseTo(0.1)
    expect(returns.find((r) => r.month === '2026-09')!.ret).toBeCloseTo(0.1)
    expect(portfolioMonthlyReturns(book, hist, today).missing).toEqual(['ZZZ'])
  })
})

describe('stats', () => {
  it('computes YTD, 1Y, ITD and Sharpe only when enough history exists', () => {
    // 30 months of alternating +2% / +1%
    const rets = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(2024, 4 + i, 1)
      return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, ret: i % 2 ? 0.01 : 0.02 }
    })
    const s = returnStats(rets, 0, today)
    expect(rets.at(-1)!.month).toBe('2026-10')
    expect(s.ytd).toBeCloseTo(chain(rets.filter((r) => r.month.startsWith('2026')).map((r) => r.ret)))
    expect(s.oneYear).toBeCloseTo(chain(rets.slice(-12).map((r) => r.ret)))
    expect(s.itd).toBeCloseTo(chain(rets.map((r) => r.ret)))
    expect(s.inception).toBe('2024-05')
    expect(s.itdAnnualized).not.toBeNull()
    expect(s.sharpe[1]).not.toBeNull()
    expect(s.sharpe[3]).toBeNull() // only 30 months
    // 2Y return is annualized over the last 24 full months; 3Y needs 36
    expect(s.twoYear).toBeCloseTo(Math.pow(1 + chain(rets.slice(-24).map((r) => r.ret)), 0.5) - 1)
    expect(s.threeYear).toBeNull()
  })

  it('annualizes Sharpe from monthly returns with a risk-free rate', () => {
    const rets: number[] = Array.from({ length: 12 }, (_, i) => (i % 2 ? 0.02 : 0.0))
    // mean 1%/mo, rf 0 ⇒ (0.01 / sd) × √12
    const sd = Math.sqrt(rets.reduce((s, r) => s + (r - 0.01) ** 2, 0) / 11)
    expect(sharpe(rets, 0)).toBeCloseTo((0.01 / sd) * Math.sqrt(12))
    expect(sharpe(rets, 12)).toBeCloseTo(0) // rf 1%/mo cancels the mean
    expect(sharpe(rets.slice(0, 6), 0)).toBeNull()
  })

  it('lets a holding use its real purchase price for ITD', () => {
    const s = returnStats([{ month: '2026-09', ret: 0.1 }], 4, today, { itd: 0.5, since: '2025-01-15' })
    expect(s.itd).toBe(0.5)
    expect(s.inception).toBe('2025-01-15')
    expect(s.itdAnnualized).toBeCloseTo(
      Math.pow(1.5, 1 / ((today.getTime() - Date.parse('2025-01-15T00:00:00')) / (365.25 * 86400000))) - 1,
    )
  })
})

it('builds a year × month grid, newest year first', () => {
  const grid = yearGrid([
    { month: '2025-12', ret: 0.1 },
    { month: '2026-01', ret: 0.1 },
    { month: '2026-02', ret: -0.1 },
  ])
  expect(grid.map((g) => g.year)).toEqual(['2026', '2025'])
  expect(grid[0].months[0]!.ret).toBe(0.1)
  expect(grid[0].months[2]).toBeNull()
  expect(grid[0].total).toBeCloseTo(1.1 * 0.9 - 1)
  expect(grid[1].months[11]!.ret).toBe(0.1)
})
