import { describe, expect, it } from 'vitest'
import { assignSlots, buildTrendRows } from './trends'

const today = new Date('2026-10-04T12:00:00')
const hist = {
  AAPL: [
    { date: '2026-01-02', close: 50 },
    { date: '2026-09-01', close: 100 },
    { date: '2026-09-15', close: 110 },
    { date: '2026-10-02', close: 120 },
  ],
  MSFT: [
    { date: '2026-09-01', close: 400 },
    { date: '2026-10-02', close: 380 },
  ],
}

describe('buildTrendRows', () => {
  it('indexes each series to its first point in the range', () => {
    const { rows, stats } = buildTrendRows(hist, ['AAPL', 'MSFT'], '1M', 'percent', today)
    expect(rows.map((r) => r.date)).toEqual(['2026-09-15', '2026-10-02'])
    expect(rows[1]).toMatchObject({ AAPL: 9.09 })
    expect(rows[0].MSFT).toBeNull() // no MSFT point on that date
    expect(stats).toEqual([
      { symbol: 'AAPL', start: 110, end: 120, changePct: expect.closeTo(9.09, 2) },
      { symbol: 'MSFT', start: 380, end: 380, changePct: 0 },
    ])
  })

  it('returns raw closes in price mode and respects longer ranges', () => {
    const { rows } = buildTrendRows(hist, ['AAPL'], '1Y', 'price', today)
    expect(rows.map((r) => r.AAPL)).toEqual([50, 100, 110, 120])
  })
})

describe('assignSlots', () => {
  it('keeps colours stable when others are removed and reuses freed slots', () => {
    const a = assignSlots({}, ['AAPL', 'MSFT', 'NVDA'], 8)
    expect(a).toEqual({ AAPL: 0, MSFT: 1, NVDA: 2 })
    const b = assignSlots(a, ['AAPL', 'NVDA'], 8)
    expect(b).toEqual({ AAPL: 0, NVDA: 2 })
    expect(assignSlots(b, ['AAPL', 'NVDA', 'KO'], 8)).toEqual({ AAPL: 0, NVDA: 2, KO: 1 })
  })

  it('never exceeds the palette size', () => {
    const many = ['A', 'B', 'C']
    expect(Object.keys(assignSlots({}, many, 2))).toEqual(['A', 'B'])
  })
})
