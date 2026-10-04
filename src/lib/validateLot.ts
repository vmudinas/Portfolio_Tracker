import { todayIso } from './format'

export type TxErrors = Partial<Record<'symbol' | 'shares' | 'price' | 'date' | 'fees' | 'amount', string>>
/** @deprecated kept for older imports */
export type LotErrors = TxErrors

export const isTicker = (s: string) => /^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(s.trim())

interface Values {
  symbol: string
  shares: string
  price: string
  date: string
  fees: string
  amount: string
}

export function validateTransaction(kind: 'buy' | 'sell' | 'dividend', v: Values, maxShares?: number): TxErrors {
  const e: TxErrors = {}
  if (!isTicker(v.symbol)) e.symbol = 'Enter a ticker like AAPL'
  if (v.date && v.date > todayIso()) e.date = 'Date cannot be in the future'
  if (kind === 'dividend') {
    if (!(Number(v.amount) > 0)) e.amount = 'Enter the dividend amount you received'
    return e
  }
  if (!(Number(v.shares) > 0)) e.shares = 'Shares must be more than 0'
  else if (kind === 'sell' && maxShares !== undefined && Number(v.shares) > maxShares + 1e-9)
    e.shares = maxShares > 0 ? `You held ${+maxShares.toFixed(6)} shares on that date` : 'No shares held on that date'
  if (v.price.trim() === '' || !(Number(v.price) >= 0))
    e.price = kind === 'buy' ? 'Enter the price per share you paid' : 'Enter the price per share you sold at'
  if (v.fees.trim() !== '' && !(Number(v.fees) >= 0)) e.fees = 'Fees cannot be negative'
  return e
}
