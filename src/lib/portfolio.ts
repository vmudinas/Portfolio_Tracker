import type {
  Book,
  ExtendedQuote,
  Lot,
  MarketSession,
  OpenLot,
  PortfolioSummary,
  Position,
  Quote,
  RealizedSale,
} from '../types'

const round2 = (n: number) => Math.round(n * 100) / 100
const DAY_MS = 86_400_000
const EPS = 1e-9

export function lotCost(lot: Lot): number {
  return lot.shares * lot.buyPrice + (lot.fees ?? 0)
}

const norm = (s: string) => s.trim().toUpperCase()

/**
 * Match sales to purchases first-in, first-out (per symbol, by date).
 * A sale only consumes shares bought on or before its date.
 */
export function matchLots(book: Pick<Book, 'lots' | 'sales'>): { open: OpenLot[]; realized: RealizedSale[] } {
  const open: OpenLot[] = book.lots
    .map((l) => ({
      ...l,
      symbol: norm(l.symbol),
      remaining: l.shares,
      costPerShare: l.shares > 0 ? lotCost(l) / l.shares : 0,
    }))
    // Stable sort: undated purchases count as the oldest.
    .sort((a, b) => (a.buyDate || '0000').localeCompare(b.buyDate || '0000'))

  const sales = [...book.sales].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
  const realized: RealizedSale[] = []

  for (const sale of sales) {
    const symbol = norm(sale.symbol)
    let need = sale.shares
    let cost = 0
    for (const lot of open) {
      if (need <= EPS) break
      if (lot.symbol !== symbol || lot.remaining <= EPS) continue
      if (sale.date && lot.buyDate && lot.buyDate > sale.date) continue
      const take = Math.min(lot.remaining, need)
      lot.remaining -= take
      need -= take
      cost += take * lot.costPerShare
    }
    const matched = sale.shares - Math.max(need, 0)
    const proceeds = matched * sale.price - (sale.fees ?? 0)
    realized.push({
      sale,
      cost: round2(cost),
      proceeds: round2(proceeds),
      gain: round2(proceeds - cost),
      unmatched: need > EPS ? need : 0,
    })
  }
  return { open, realized }
}

/** Shares of `symbol` held on `date` (after earlier sales), optionally ignoring one sale being edited. */
export function sharesHeld(book: Pick<Book, 'lots' | 'sales'>, symbol: string, date: string, ignoreSaleId?: string) {
  const s = norm(symbol)
  const bought = book.lots
    .filter((l) => norm(l.symbol) === s && (!date || !l.buyDate || l.buyDate <= date))
    .reduce((t, l) => t + l.shares, 0)
  const sold = book.sales
    .filter((x) => x.id !== ignoreSaleId && norm(x.symbol) === s && (!date || !x.date || x.date <= date))
    .reduce((t, x) => t + x.shares, 0)
  return Math.max(0, bought - sold)
}

function extendedMove(shares: number, quote: Quote | undefined, ext: ExtendedQuote | undefined): Position['extended'] {
  if (!quote || !ext || !quote.price) return null
  const change = ext.price - quote.price
  return {
    session: ext.session,
    price: ext.price,
    change: round2(change),
    changePct: round2((change / quote.price) * 100),
    valueChange: round2(shares * change),
  }
}

/**
 * Which extended-hours trades to show: never during the regular session, and only trades
 * newer than the last regular-session quote (so Friday's after-hours price shows over the weekend,
 * and disappears once Monday's session starts).
 */
export function visibleExtended(
  ext: Record<string, ExtendedQuote>,
  quotes: Record<string, Quote | undefined>,
  session: MarketSession | null,
): Record<string, ExtendedQuote> {
  if (session === 'regular') return {}
  const out: Record<string, ExtendedQuote> = {}
  for (const [symbol, e] of Object.entries(ext)) {
    const q = quotes[symbol]
    if (q && Date.parse(e.updatedAt) > Date.parse(q.updatedAt)) out[symbol] = e
  }
  return out
}

export interface Analysis {
  positions: Position[]
  summary: PortfolioSummary
  realized: RealizedSale[]
}

interface Options {
  cash?: number
  today?: Date
}

/** Everything the dashboard shows, from purchases, sales, dividends and the latest quotes. */
export function analyze(
  book: Partial<Book> & { lots: Lot[] },
  quotes: Record<string, Quote | undefined>,
  extended: Record<string, ExtendedQuote | undefined> = {},
  { cash = 0, today = new Date() }: Options = {},
): Analysis {
  const full: Book = { lots: book.lots, sales: book.sales ?? [], dividends: book.dividends ?? [] }
  const { open, realized } = matchLots(full)

  const realizedBy = new Map<string, number>()
  for (const r of realized) realizedBy.set(norm(r.sale.symbol), (realizedBy.get(norm(r.sale.symbol)) ?? 0) + r.gain)
  const divBy = new Map<string, number>()
  for (const d of full.dividends) divBy.set(norm(d.symbol), (divBy.get(norm(d.symbol)) ?? 0) + d.amount)

  const bySymbol = new Map<string, OpenLot[]>()
  for (const lot of open) {
    if (lot.remaining <= EPS) continue
    bySymbol.set(lot.symbol, [...(bySymbol.get(lot.symbol) ?? []), lot])
  }

  const now = today.getTime()
  const positions: Position[] = [...bySymbol.entries()].map(([symbol, lots]) => {
    const shares = lots.reduce((s, l) => s + l.remaining, 0)
    const costBasis = lots.reduce((s, l) => s + l.remaining * l.costPerShare, 0)
    const quote = quotes[symbol]
    const price = quote?.price ?? null
    const marketValue = price === null ? null : shares * price
    const gain = marketValue === null ? null : marketValue - costBasis

    const dated = lots.filter((l) => l.buyDate)
    const heldSince = dated.length ? dated.map((l) => l.buyDate).sort()[0] : null
    const datedCost = dated.reduce((s, l) => s + l.remaining * l.costPerShare, 0)
    const holdingDays =
      dated.length && datedCost > 0
        ? Math.max(
            0,
            Math.round(
              dated.reduce(
                (s, l) => s + ((now - Date.parse(`${l.buyDate}T12:00:00`)) / DAY_MS) * l.remaining * l.costPerShare,
                0,
              ) / datedCost,
            ),
          )
        : null
    const years = holdingDays === null ? 0 : holdingDays / 365.25
    const annualizedPct =
      marketValue !== null && costBasis > 0 && years >= 1
        ? round2((Math.pow(marketValue / costBasis, 1 / years) - 1) * 100)
        : null

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
      extended: extendedMove(shares, quote, extended[symbol]),
      realizedGain: round2(realizedBy.get(symbol) ?? 0),
      dividends: round2(divBy.get(symbol) ?? 0),
      weight: null,
      heldSince,
      holdingDays,
      annualizedPct,
      lots,
    }
  })
  positions.sort((a, b) => a.symbol.localeCompare(b.symbol))

  const priced = positions.filter((p) => p.marketValue !== null)
  const stocks = priced.reduce((s, p) => s + (p.marketValue ?? 0), 0)
  const total = stocks + cash
  for (const p of positions)
    p.weight = p.marketValue === null || total <= 0 ? null : round2((p.marketValue / total) * 100)

  const costBasis = priced.reduce((s, p) => s + p.costBasis, 0)
  const gain = stocks - costBasis
  const realizedGain = realized.reduce((s, r) => s + r.gain, 0)
  const dividends = full.dividends.reduce((s, d) => s + d.amount, 0)
  const withExt = priced.filter((p) => p.extended)

  const summary: PortfolioSummary = {
    costBasis: round2(costBasis),
    marketValue: round2(stocks),
    cash: round2(cash),
    totalValue: round2(total),
    gain: round2(gain),
    gainPct: costBasis === 0 ? 0 : round2((gain / costBasis) * 100),
    dayChange: round2(priced.reduce((s, p) => s + (p.dayChange ?? 0), 0)),
    extendedChange: withExt.length ? round2(withExt.reduce((s, p) => s + (p.extended?.valueChange ?? 0), 0)) : null,
    extendedSession: withExt[0]?.extended?.session ?? null,
    realizedGain: round2(realizedGain),
    dividends: round2(dividends),
    totalReturn: round2(gain + realizedGain + dividends),
    missingQuotes: positions.filter((p) => p.marketValue === null).map((p) => p.symbol),
  }

  return { positions, summary, realized }
}

/** "2y 3m", "5m", "12d" */
export function formatHolding(days: number | null): string {
  if (days === null) return '—'
  if (days < 31) return `${days}d`
  const y = Math.floor(days / 365)
  const m = Math.floor((days - y * 365) / 30.4)
  return y ? (m ? `${y}y ${m}m` : `${y}y`) : `${m}m`
}

/** Adds up several portfolio summaries (e.g. every fund) into one total. */
export function combineSummaries(list: PortfolioSummary[]): PortfolioSummary {
  const sum = (f: (s: PortfolioSummary) => number) => round2(list.reduce((t, s) => t + f(s), 0))
  const costBasis = sum((s) => s.costBasis)
  const gain = sum((s) => s.gain)
  const withExt = list.filter((s) => s.extendedChange !== null)
  return {
    costBasis,
    marketValue: sum((s) => s.marketValue),
    cash: sum((s) => s.cash),
    totalValue: sum((s) => s.totalValue),
    gain,
    gainPct: costBasis ? (gain / costBasis) * 100 : 0,
    dayChange: sum((s) => s.dayChange),
    extendedChange: withExt.length ? round2(withExt.reduce((t, s) => t + (s.extendedChange ?? 0), 0)) : null,
    extendedSession: withExt.find((s) => s.extendedSession)?.extendedSession ?? null,
    realizedGain: sum((s) => s.realizedGain),
    dividends: sum((s) => s.dividends),
    totalReturn: sum((s) => s.totalReturn),
    missingQuotes: [...new Set(list.flatMap((s) => s.missingQuotes))].sort(),
  }
}
