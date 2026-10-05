import { describe, expect, it } from 'vitest'
import type { Lot, Quote, Sale } from '../types'
import { analyze, combineSummaries, formatHolding, matchLots, sharesHeld, visibleExtended } from './portfolio'

const lot = (over: Partial<Lot>): Lot => ({
  id: crypto.randomUUID(),
  symbol: 'AAPL',
  shares: 10,
  buyPrice: 100,
  buyDate: '2026-01-02',
  ...over,
})
const sale = (over: Partial<Sale>): Sale => ({
  id: crypto.randomUUID(),
  symbol: 'AAPL',
  shares: 5,
  price: 150,
  date: '2026-06-01',
  ...over,
})

const quote = (symbol: string, price: number, change = 0): Quote => ({
  symbol,
  price,
  change,
  changePct: 0,
  prevClose: price - change,
  updatedAt: '2026-10-04T15:00:00Z',
})

const today = new Date('2026-10-04T12:00:00')

describe('analyze — positions', () => {
  it('aggregates multiple lots of the same symbol', () => {
    const { positions } = analyze(
      { lots: [lot({ shares: 10, buyPrice: 100 }), lot({ symbol: 'aapl', shares: 10, buyPrice: 200 })] },
      { AAPL: quote('AAPL', 180, 2) },
    )
    const [p] = positions
    expect(p.shares).toBe(20)
    expect(p.costBasis).toBe(3000)
    expect(p.avgCost).toBe(150)
    expect(p.marketValue).toBe(3600)
    expect(p.gain).toBe(600)
    expect(p.gainPct).toBe(20)
    expect(p.dayChange).toBe(40)
  })

  it('includes fees in cost basis and reports losses', () => {
    const [p] = analyze({ lots: [lot({ shares: 5, buyPrice: 50, fees: 5 })] }, { AAPL: quote('AAPL', 40) }).positions
    expect(p.costBasis).toBe(255)
    expect(p.gain).toBe(-55)
    expect(p.gainPct).toBe(-21.57)
  })

  it('leaves value fields null when there is no quote', () => {
    const [p] = analyze({ lots: [lot({})] }, {}).positions
    expect(p.price).toBeNull()
    expect(p.gain).toBeNull()
    expect(p.weight).toBeNull()
  })

  it('computes weight including cash, holding period and annualized return', () => {
    const { positions, summary } = analyze(
      {
        lots: [
          lot({ shares: 10, buyPrice: 100, buyDate: '2024-10-04' }),
          lot({ symbol: 'KO', shares: 1, buyPrice: 50, buyDate: '2026-09-01' }),
        ],
      },
      { AAPL: quote('AAPL', 121), KO: quote('KO', 50) },
      {},
      { cash: 740, today },
    )
    const aapl = positions.find((p) => p.symbol === 'AAPL')!
    const ko = positions.find((p) => p.symbol === 'KO')!
    expect(summary.totalValue).toBe(2000)
    expect(summary.cash).toBe(740)
    expect(aapl.weight).toBe(60.5)
    expect(aapl.heldSince).toBe('2024-10-04')
    expect(aapl.holdingDays).toBe(730)
    expect(aapl.annualizedPct).toBeCloseTo(10, 0) // 21% over 2 years ≈ 10%/yr
    expect(ko.annualizedPct).toBeNull() // under a year
  })
})

describe('sales (FIFO)', () => {
  it('sells the oldest shares first and books realized gain', () => {
    const book = {
      lots: [
        lot({ shares: 10, buyPrice: 100, buyDate: '2026-01-02' }),
        lot({ shares: 10, buyPrice: 200, buyDate: '2026-03-01' }),
      ],
      sales: [sale({ shares: 15, price: 250, fees: 5 })],
      dividends: [],
    }
    const { realized, open } = matchLots(book)
    // 10 @100 + 5 @200 = 2000 cost; proceeds 15×250 − 5 = 3745
    expect(realized[0]).toMatchObject({ cost: 2000, proceeds: 3745, gain: 1745, unmatched: 0 })
    expect(open.map((l) => l.remaining)).toEqual([0, 5])

    const { positions, summary } = analyze(book, { AAPL: quote('AAPL', 300) })
    expect(positions[0].shares).toBe(5)
    expect(positions[0].costBasis).toBe(1000)
    expect(positions[0].realizedGain).toBe(1745)
    expect(summary.realizedGain).toBe(1745)
    expect(summary.totalReturn).toBe(500 + 1745)
  })

  it('does not match shares bought after the sale date and flags unmatched shares', () => {
    const { realized } = matchLots({ lots: [lot({ buyDate: '2026-07-01' })], sales: [sale({ shares: 3 })] })
    expect(realized[0].unmatched).toBe(3)
    expect(realized[0].cost).toBe(0)
  })

  it('drops fully sold positions but keeps their realized gain and dividends in the summary', () => {
    const { positions, summary } = analyze(
      {
        lots: [lot({ symbol: 'KO', shares: 2, buyPrice: 50 })],
        sales: [sale({ symbol: 'KO', shares: 2, price: 60 })],
        dividends: [{ id: 'd', symbol: 'KO', amount: 3.5, date: '2026-04-01' }],
      },
      {},
    )
    expect(positions).toEqual([])
    expect(summary.realizedGain).toBe(20)
    expect(summary.dividends).toBe(3.5)
    expect(summary.totalReturn).toBe(23.5)
  })

  it('reports shares held on a date', () => {
    const book = { lots: [lot({ shares: 10 })], sales: [sale({ id: 's1', shares: 4 })] }
    expect(sharesHeld(book, 'aapl', '2026-05-01')).toBe(10)
    expect(sharesHeld(book, 'AAPL', '2026-07-01')).toBe(6)
    expect(sharesHeld(book, 'AAPL', '2026-07-01', 's1')).toBe(10)
  })
})

describe('summary', () => {
  it('totals priced positions and lists missing quotes', () => {
    const { summary: s } = analyze(
      { lots: [lot({ symbol: 'AAPL' }), lot({ symbol: 'MSFT', shares: 2, buyPrice: 400 }), lot({ symbol: 'XYZ' })] },
      { AAPL: quote('AAPL', 110, 1), MSFT: quote('MSFT', 350, -5) },
    )
    expect(s.costBasis).toBe(1800)
    expect(s.marketValue).toBe(1800)
    expect(s.gain).toBe(0)
    expect(s.dayChange).toBe(0)
    expect(s.missingQuotes).toEqual(['XYZ'])
  })
})

describe('extended hours', () => {
  const q = { ...quote('AAPL', 200, 2), updatedAt: '2026-10-02T20:00:00Z' }
  const ext = { symbol: 'AAPL', price: 210, session: 'post' as const, updatedAt: '2026-10-02T22:00:00Z' }

  it('shows newer after-hours trades outside the regular session only', () => {
    expect(visibleExtended({ AAPL: ext }, { AAPL: q }, 'post')).toEqual({ AAPL: ext })
    expect(visibleExtended({ AAPL: ext }, { AAPL: q }, 'closed')).toEqual({ AAPL: ext })
    expect(visibleExtended({ AAPL: ext }, { AAPL: q }, 'regular')).toEqual({})
    const stale = { ...ext, updatedAt: '2026-10-02T15:00:00Z' }
    expect(visibleExtended({ AAPL: stale }, { AAPL: q }, 'post')).toEqual({})
  })

  it('computes the move vs the regular-session price and totals it', () => {
    const { positions, summary } = analyze({ lots: [lot({ shares: 10 })] }, { AAPL: q }, { AAPL: ext })
    expect(positions[0].extended).toEqual({ session: 'post', price: 210, change: 10, changePct: 5, valueChange: 100 })
    expect(summary.extendedChange).toBe(100)
    expect(summary.extendedSession).toBe('post')
    expect(analyze({ lots: [lot({})] }, { AAPL: q }).summary.extendedChange).toBeNull()
  })
})

it('formats holding periods', () => {
  expect(formatHolding(12)).toBe('12d')
  expect(formatHolding(150)).toBe('4m')
  expect(formatHolding(365)).toBe('1y')
  expect(formatHolding(800)).toBe('2y 2m')
  expect(formatHolding(null)).toBe('—')
})

describe('combineSummaries', () => {
  const base = analyze({ lots: [], sales: [], dividends: [] }, {}, {}, { cash: 0 }).summary
  it('adds up funds and recomputes the gain %', () => {
    const a = { ...base, costBasis: 100, marketValue: 150, cash: 10, totalValue: 160, gain: 50, dayChange: 2 }
    const b = { ...base, costBasis: 300, marketValue: 250, cash: 0, totalValue: 250, gain: -50, dayChange: -1 }
    const c = combineSummaries([a, { ...b, extendedChange: 3, extendedSession: 'post' as const, missingQuotes: ['X'] }])
    expect(c).toMatchObject({ costBasis: 400, totalValue: 410, cash: 10, gain: 0, gainPct: 0, dayChange: 1 })
    expect(c.extendedChange).toBe(3)
    expect(c.extendedSession).toBe('post')
    expect(c.missingQuotes).toEqual(['X'])
    expect(combineSummaries([a]).gainPct).toBe(50)
  })
})
