import { ProviderError } from './QuoteProvider'

export interface Mover {
  symbol: string
  price: number
  change: number
  changePct: number
  volume: number
}

export interface TopMovers {
  updated: string
  gainers: Mover[]
  losers: Mover[]
  active: Mover[]
}

interface AvRow {
  ticker: string
  price: string
  change_amount: string
  change_percentage: string
  volume: string
}

const parse = (rows: AvRow[] | undefined): Mover[] =>
  (rows ?? []).map((r) => ({
    symbol: r.ticker,
    price: Number(r.price),
    change: Number(r.change_amount),
    changePct: Number(String(r.change_percentage).replace('%', '')),
    volume: Number(r.volume),
  }))

/** Alpha Vantage free "top gainers / losers / most active" for the whole US market (25 calls/day). */
export async function fetchTopMovers(
  apiKey: string,
  fetchFn: typeof fetch = (...a) => fetch(...a),
): Promise<TopMovers> {
  let data: Record<string, unknown>
  try {
    const res = await fetchFn(
      `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${encodeURIComponent(apiKey)}`,
    )
    data = (await res.json()) as Record<string, unknown>
  } catch {
    throw new ProviderError('network', 'Could not reach Alpha Vantage.')
  }
  // Alpha Vantage reports problems with HTTP 200 and a message field.
  const note = (data.Information ?? data.Note ?? data['Error Message']) as string | undefined
  if (!data.top_gainers) {
    if (note && /api key|apikey/i.test(note) && !/rate|limit|per day/i.test(note))
      throw new ProviderError('auth', 'Alpha Vantage rejected the API key.')
    throw new ProviderError('rate', note ? `Alpha Vantage: ${note.slice(0, 160)}` : 'Alpha Vantage returned no data.')
  }
  return {
    updated: String(data.last_updated ?? ''),
    gainers: parse(data.top_gainers as AvRow[]),
    losers: parse(data.top_losers as AvRow[]),
    active: parse(data.most_actively_traded as AvRow[]),
  }
}
