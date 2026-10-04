import { todayIso } from './format'

export type LotErrors = Partial<Record<'symbol' | 'shares' | 'buyPrice' | 'buyDate' | 'fees', string>>

export function validateLot(v: {
  symbol: string
  shares: string
  buyPrice: string
  buyDate: string
  fees: string
}): LotErrors {
  const e: LotErrors = {}
  if (!/^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(v.symbol.trim())) e.symbol = 'Enter a ticker like AAPL'
  if (!(Number(v.shares) > 0)) e.shares = 'Shares must be more than 0'
  if (v.buyPrice.trim() === '' || !(Number(v.buyPrice) >= 0)) e.buyPrice = 'Enter the price per share you paid'
  if (v.buyDate && v.buyDate > todayIso()) e.buyDate = 'Date cannot be in the future'
  if (v.fees.trim() !== '' && !(Number(v.fees) >= 0)) e.fees = 'Fees cannot be negative'
  return e
}
