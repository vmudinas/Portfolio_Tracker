import type { Lot, PortfolioSummary, Position, Quote } from '../types'

const round2 = (n: number) => Math.round(n * 100) / 100

export function lotCost(lot: Lot): number {
  return lot.shares * lot.buyPrice + (lot.fees ?? 0)
}

/** Group lots by symbol and value each position at its quote (if we have one). */
export function buildPositions(lots: Lot[], quotes: Record<string, Quote | undefined>): Position[] {
  const bySymbol = new Map<string, Lot[]>()
  for (const lot of lots) {
    const symbol = lot.symbol.trim().toUpperCase()
    bySymbol.set(symbol, [...(bySymbol.get(symbol) ?? []), lot])
  }

  return [...bySymbol.entries()]
    .map(([symbol, symbolLots]) => {
      const shares = symbolLots.reduce((s, l) => s + l.shares, 0)
      const costBasis = symbolLots.reduce((s, l) => s + lotCost(l), 0)
      const quote = quotes[symbol]
      const price = quote?.price ?? null
      const marketValue = price === null ? null : shares * price
      const gain = marketValue === null ? null : marketValue - costBasis
      return {
        symbol,
        shares,
        costBasis: round2(costBasis),
        avgCost: shares > 0 ? round2(costBasis / shares) : 0,
        price,
        marketValue: marketValue === null ? null : round2(marketValue),
        gain: gain === null ? null : round2(gain),
        gainPct: gain === null || costBasis === 0 ? null : round2((gain / costBasis) * 100),
        dayChange: quote ? round2(shares * quote.change) : null,
        lots: symbolLots,
      }
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}

/** Portfolio totals. Positions without a quote are listed in `missingQuotes` and left out of value/gain. */
export function summarize(positions: Position[]): PortfolioSummary {
  const priced = positions.filter((p) => p.marketValue !== null)
  const costBasis = priced.reduce((s, p) => s + p.costBasis, 0)
  const marketValue = priced.reduce((s, p) => s + (p.marketValue ?? 0), 0)
  const gain = marketValue - costBasis
  return {
    costBasis: round2(costBasis),
    marketValue: round2(marketValue),
    gain: round2(gain),
    gainPct: costBasis === 0 ? 0 : round2((gain / costBasis) * 100),
    dayChange: round2(priced.reduce((s, p) => s + (p.dayChange ?? 0), 0)),
    missingQuotes: positions.filter((p) => p.marketValue === null).map((p) => p.symbol),
  }
}
