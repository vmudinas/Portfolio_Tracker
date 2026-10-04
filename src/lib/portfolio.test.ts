import { describe, expect, it } from 'vitest'
import type { Lot, Quote } from '../types'
import { buildPositions, summarize } from './portfolio'

const lot = (over: Partial<Lot>): Lot => ({
  id: crypto.randomUUID(),
  symbol: 'AAPL',
  shares: 10,
  buyPrice: 100,
  buyDate: '2026-01-02',
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

describe('buildPositions', () => {
  it('aggregates multiple lots of the same symbol', () => {
    const [p] = buildPositions(
      [lot({ shares: 10, buyPrice: 100 }), lot({ symbol: 'aapl', shares: 10, buyPrice: 200 })],
      { AAPL: quote('AAPL', 180, 2) },
    )
    expect(p.shares).toBe(20)
    expect(p.costBasis).toBe(3000)
    expect(p.avgCost).toBe(150)
    expect(p.marketValue).toBe(3600)
    expect(p.gain).toBe(600)
    expect(p.gainPct).toBe(20)
    expect(p.dayChange).toBe(40)
  })

  it('includes fees in cost basis and reports losses', () => {
    const [p] = buildPositions([lot({ shares: 5, buyPrice: 50, fees: 5 })], { AAPL: quote('AAPL', 40) })
    expect(p.costBasis).toBe(255)
    expect(p.gain).toBe(-55)
    expect(p.gainPct).toBe(-21.57)
  })

  it('leaves value fields null when there is no quote', () => {
    const [p] = buildPositions([lot({})], {})
    expect(p.price).toBeNull()
    expect(p.gain).toBeNull()
  })
})

describe('summarize', () => {
  it('totals priced positions and lists missing quotes', () => {
    const positions = buildPositions(
      [lot({ symbol: 'AAPL' }), lot({ symbol: 'MSFT', shares: 2, buyPrice: 400 }), lot({ symbol: 'XYZ' })],
      { AAPL: quote('AAPL', 110, 1), MSFT: quote('MSFT', 350, -5) },
    )
    const s = summarize(positions)
    expect(s.costBasis).toBe(1800)
    expect(s.marketValue).toBe(1800)
    expect(s.gain).toBe(0)
    expect(s.dayChange).toBe(0)
    expect(s.missingQuotes).toEqual(['XYZ'])
  })
})
