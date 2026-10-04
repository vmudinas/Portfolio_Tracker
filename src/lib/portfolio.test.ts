import { describe, expect, it } from 'vitest'
import type { Lot, Quote } from '../types'
import { buildPositions, summarize, visibleExtended } from './portfolio'

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
    const positions = buildPositions([lot({ shares: 10 })], { AAPL: q }, { AAPL: ext })
    expect(positions[0].extended).toEqual({ session: 'post', price: 210, change: 10, changePct: 5, valueChange: 100 })
    const s = summarize(positions)
    expect(s.extendedChange).toBe(100)
    expect(s.extendedSession).toBe('post')
    expect(summarize(buildPositions([lot({})], { AAPL: q })).extendedChange).toBeNull()
  })
})
