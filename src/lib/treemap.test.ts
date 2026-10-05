import { describe, expect, it } from 'vitest'
import { squarify } from './treemap'

describe('squarify', () => {
  const rect = { x: 0, y: 0, w: 600, h: 400 }

  it('fills the rectangle with areas proportional to values', () => {
    const values = [6, 6, 4, 3, 2, 2, 1]
    const rects = squarify(values, rect)
    const total = values.reduce((a, b) => a + b, 0)
    rects.forEach((r, i) => expect(r.w * r.h).toBeCloseTo((values[i] / total) * 600 * 400, 3))
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-9)
      expect(r.y).toBeGreaterThanOrEqual(-1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(600 + 1e-6)
      expect(r.y + r.h).toBeLessThanOrEqual(400 + 1e-6)
    }
  })

  it('keeps tiles reasonably square', () => {
    const rects = squarify(
      Array.from({ length: 30 }, (_, i) => 30 - i),
      rect,
    )
    const worst = Math.max(...rects.map((r) => Math.max(r.w / r.h, r.h / r.w)))
    expect(worst).toBeLessThan(4)
  })

  it('gives zero-size tiles to zero or negative values', () => {
    const rects = squarify([5, 0, -1, 5], rect)
    expect(rects[1].w * rects[1].h).toBe(0)
    expect(rects[2].w * rects[2].h).toBe(0)
    expect(rects[0].w * rects[0].h).toBeCloseTo(120000)
  })
})
