export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Squarified treemap (Bruls, Huizing & van Wijk): lays out `values` inside `rect`
 * with tiles as close to square as possible. Returns one rect per input, same order.
 */
export function squarify(values: number[], rect: Rect): Rect[] {
  const out: Rect[] = new Array(values.length)
  const total = values.reduce((s, v) => s + Math.max(v, 0), 0)
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return values.map(() => ({ x: rect.x, y: rect.y, w: 0, h: 0 }))

  const scale = (rect.w * rect.h) / total
  const items = values
    .map((v, i) => ({ i, area: Math.max(v, 0) * scale }))
    .filter((it) => it.area > 0)
    .sort((a, b) => b.area - a.area)
  for (let k = 0; k < values.length; k++) if (!(values[k] > 0)) out[k] = { x: rect.x, y: rect.y, w: 0, h: 0 }

  let { x, y, w, h } = rect
  let row: typeof items = []

  const worst = (r: typeof items, side: number) => {
    const sum = r.reduce((s, it) => s + it.area, 0)
    const max = Math.max(...r.map((it) => it.area))
    const min = Math.min(...r.map((it) => it.area))
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
  }

  const layoutRow = (r: typeof items) => {
    const sum = r.reduce((s, it) => s + it.area, 0)
    if (w >= h) {
      // place a column on the left
      const colW = sum / h
      let cy = y
      for (const it of r) {
        const ih = it.area / colW
        out[it.i] = { x, y: cy, w: colW, h: ih }
        cy += ih
      }
      x += colW
      w -= colW
    } else {
      const rowH = sum / w
      let cx = x
      for (const it of r) {
        const iw = it.area / rowH
        out[it.i] = { x: cx, y, w: iw, h: rowH }
        cx += iw
      }
      y += rowH
      h -= rowH
    }
  }

  for (const it of items) {
    const side = Math.min(w, h)
    if (row.length === 0 || worst([...row, it], side) <= worst(row, side)) row.push(it)
    else {
      layoutRow(row)
      row = [it]
    }
  }
  if (row.length) layoutRow(row)
  return out
}
