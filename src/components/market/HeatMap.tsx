import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MarketBoard } from '../../hooks/useMarketBoard'
import { gainColor, money, signedPct } from '../../lib/format'
import { INDEX_ETFS, MARKET_UNIVERSE } from '../../lib/marketUniverse'
import { squarify, type Rect } from '../../lib/treemap'
import { Button, Card } from '../ui'
import { HEAT_LEGEND, heatColor } from './heatColors'

const SECTOR_HEADER = 16

interface Props {
  board: MarketBoard
  owned: string[]
  watchlist: string[]
  onWatch: (symbol: string) => void
  onBuy: (symbol: string) => void
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** S&P-100-style heat map: tiles sized by market cap, grouped by sector, coloured by today's % change. */
export function HeatMap({ board, owned, watchlist, onWatch, onBuy }: Props) {
  const [ref, width] = useWidth()
  const [focus, setFocus] = useState<string | null>(null)
  const height = width < 640 ? Math.max(520, width * 1.6) : Math.round(width * 0.55)

  const layout = useMemo(() => {
    if (!width) return []
    const sectors = [...new Set(MARKET_UNIVERSE.map((s) => s.sector))]
    const groups = sectors
      .map((sector) => {
        const stocks = MARKET_UNIVERSE.filter((s) => s.sector === sector)
        return { sector, stocks, cap: stocks.reduce((t, s) => t + s.approxCap, 0) }
      })
      .sort((a, b) => b.cap - a.cap)
    const sectorRects = squarify(
      groups.map((g) => g.cap),
      { x: 0, y: 0, w: width, h: height },
    )
    return groups.map((g, i) => {
      const r = sectorRects[i]
      const inner: Rect = {
        x: r.x + 1,
        y: r.y + SECTOR_HEADER,
        w: Math.max(0, r.w - 2),
        h: Math.max(0, r.h - SECTOR_HEADER - 1),
      }
      const tiles = squarify(
        g.stocks.map((s) => s.approxCap),
        inner,
      )
      return { ...g, rect: r, tiles: g.stocks.map((s, k) => ({ stock: s, rect: tiles[k] })) }
    })
  }, [width, height])

  const sectorChange = (sector: string) => {
    let w = 0
    let sum = 0
    for (const s of MARKET_UNIVERSE) {
      const q = board.quotes[s.symbol]
      if (s.sector !== sector || !q) continue
      w += s.approxCap
      sum += s.approxCap * q.changePct
    }
    return w ? sum / w : null
  }

  const focused = focus ? MARKET_UNIVERSE.find((s) => s.symbol === focus) : null
  const fq = focus ? board.quotes[focus] : undefined
  const loaded = MARKET_UNIVERSE.filter((s) => board.quotes[s.symbol]).length

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {INDEX_ETFS.map((e) => {
          const q = board.quotes[e.symbol]
          return (
            <Card key={e.symbol} className="px-3 py-2">
              <p className="text-xs text-slate-500">
                {e.name} <span className="text-slate-400">({e.symbol})</span>
              </p>
              <p className="flex items-baseline justify-between gap-2 tabular-nums">
                <span className="font-semibold">{money(q?.price)}</span>
                <span className={`text-sm font-medium ${gainColor(q?.changePct)}`}>{signedPct(q?.changePct)}</span>
              </p>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span aria-live="polite">
          {board.loading
            ? `Loading prices… ${loaded}/${MARKET_UNIVERSE.length} (about ${Math.ceil(board.pending / 40)} min — paced to stay within Finnhub’s free limit)`
            : board.updatedAt
              ? `Updated ${new Date(board.updatedAt).toLocaleTimeString()} · refreshes every 5 min while the market is open`
              : ''}
          {board.error && <span className="text-rose-600"> · {board.error}</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className="flex overflow-hidden rounded" aria-label="Colour scale">
            {HEAT_LEGEND.map((v) => {
              const c = heatColor(v === 0 ? 0 : v > 0 ? v - 0.5 : v + 0.5)
              return (
                <span
                  key={v}
                  className="px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                  style={{ background: c.bg, color: c.fg }}
                >
                  {v > 0 ? `+${v}` : v}%
                </span>
              )
            })}
          </span>
          <Button className="px-2 py-1 text-xs" onClick={board.refresh} disabled={board.loading}>
            ↻
          </Button>
        </span>
      </div>

      <div
        ref={ref}
        className="relative w-full overflow-hidden rounded-lg bg-slate-900 select-none"
        style={{ height }}
        role="img"
        aria-label="Market heat map"
      >
        {layout.map((g) => {
          const sc = sectorChange(g.sector)
          return (
            <div key={g.sector}>
              <div
                className="absolute truncate px-1 text-[11px] leading-4 font-semibold text-slate-200"
                style={{ left: g.rect.x, top: g.rect.y, width: g.rect.w, height: SECTOR_HEADER }}
                title={g.sector}
              >
                {g.sector.toUpperCase()}{' '}
                {sc !== null && <span className="font-normal opacity-80">{signedPct(sc)}</span>}
              </div>
              {g.tiles.map(({ stock, rect }) => {
                const q = board.quotes[stock.symbol]
                const c = heatColor(q?.changePct)
                const big = rect.w > 70 && rect.h > 44
                const small = rect.w < 34 || rect.h < 22
                return (
                  <button
                    key={stock.symbol}
                    type="button"
                    onClick={() => setFocus(stock.symbol)}
                    title={`${stock.name} (${stock.symbol})${q ? ` ${money(q.price)} ${signedPct(q.changePct)}` : ''}`}
                    aria-label={`${stock.symbol} ${q ? signedPct(q.changePct) : 'loading'}`}
                    className={`absolute flex flex-col items-center justify-center overflow-hidden border border-slate-900 text-center leading-tight ${focus === stock.symbol ? 'z-10 outline-2 outline-white' : ''}`}
                    style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, background: c.bg, color: c.fg }}
                  >
                    {!small && (
                      <>
                        <span className={`font-bold ${big ? 'text-base' : 'text-[11px]'}`}>
                          {stock.symbol}
                          {owned.includes(stock.symbol) && <span title="In your portfolio"> ★</span>}
                        </span>
                        <span className={`tabular-nums ${big ? 'text-sm' : 'text-[10px]'}`}>
                          {q ? signedPct(q.changePct) : '…'}
                        </span>
                        {big && rect.h > 70 && q && (
                          <span className="text-[11px] tabular-nums opacity-90">{money(q.price)}</span>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      {focused && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
          <span>
            <strong>{focused.symbol}</strong> <span className="text-slate-500">{focused.name}</span> · {focused.sector}
            {fq && (
              <>
                {' '}
                · <span className="tabular-nums">{money(fq.price)}</span>{' '}
                <span className={`tabular-nums ${gainColor(fq.changePct)}`}>
                  {signedPct(fq.changePct)} ({fq.change >= 0 ? '+' : '−'}
                  {money(Math.abs(fq.change))})
                </span>
              </>
            )}
            <span className="text-slate-500"> · ~${Math.round(focused.approxCap).toLocaleString()}bn market cap</span>
          </span>
          <span className="flex gap-2">
            <Button onClick={() => onWatch(focused.symbol)} disabled={watchlist.includes(focused.symbol)}>
              {watchlist.includes(focused.symbol) ? 'On watchlist' : '+ Watchlist'}
            </Button>
            <Button variant="primary" onClick={() => onBuy(focused.symbol)}>
              Record a buy
            </Button>
          </span>
        </Card>
      )}
      <p className="text-xs text-slate-500">
        The ~100 largest US companies (close to the S&amp;P 100), sized by market cap and grouped by sector; sector % is
        cap-weighted. ★ = you own it. Prices from Finnhub, may be delayed.
      </p>
    </div>
  )
}
