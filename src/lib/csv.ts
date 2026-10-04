import type { Book, Dividend, Lot, Sale } from '../types'
import { newId } from './id'

/** RFC 4180-ish CSV parser: quoted fields, escaped quotes, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

const esc = (v: string | number | undefined) => {
  const s = v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const CSV_HEADER = ['date', 'type', 'symbol', 'shares', 'price', 'amount', 'fees', 'notes']

/** One row per transaction, oldest first — re-importable by importTransactions. */
export function exportCsv(book: Book): string {
  type Row = [string, string, string, number | '', number | '', number, number | '', string]
  const rows: Row[] = [
    ...book.lots.map<Row>((l) => [
      l.buyDate,
      'buy',
      l.symbol,
      l.shares,
      l.buyPrice,
      +(l.shares * l.buyPrice + (l.fees ?? 0)).toFixed(2),
      l.fees ?? '',
      l.notes ?? '',
    ]),
    ...book.sales.map<Row>((s) => [
      s.date,
      'sell',
      s.symbol,
      s.shares,
      s.price,
      +(s.shares * s.price - (s.fees ?? 0)).toFixed(2),
      s.fees ?? '',
      s.notes ?? '',
    ]),
    ...book.dividends.map<Row>((d) => [d.date, 'dividend', d.symbol, '', '', d.amount, '', d.notes ?? '']),
  ].sort((a, b) => a[0].localeCompare(b[0]))
  return [CSV_HEADER, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Import: our own export plus common broker formats (Fidelity, Schwab, Robinhood, …)
// ---------------------------------------------------------------------------

const COLS = {
  date: ['date', 'trade date', 'run date', 'activity date', 'transaction date', 'process date', 'settlement date'],
  type: ['type', 'action', 'transaction type', 'trans code', 'activity', 'transaction'],
  symbol: ['symbol', 'ticker', 'instrument', 'security symbol'],
  shares: ['shares', 'quantity', 'qty', 'units'],
  price: ['price', 'price ($)', 'share price', 'execution price', 'trade price', 'price per share'],
  amount: ['amount', 'amount ($)', 'net amount', 'total', 'value', 'net cash amount'],
  fees: ['fees', 'fee', 'commission', 'commission ($)', 'fees ($)', 'fees & comm', 'fees & commissions'],
  notes: ['notes', 'note', 'memo'],
  description: ['description', 'security description'],
} as const

type Col = keyof typeof COLS

export type ImportKind = 'buy' | 'sell' | 'dividend'

export function classify(text: string): ImportKind | null {
  const t = text.toLowerCase()
  if (/reinvest/.test(t) && /div/.test(t) && !/share/.test(t)) return 'dividend'
  if (/\bbuy\b|bought|purchase|reinvest/.test(t)) return 'buy'
  if (/\bsell\b|\bsold\b|sale/.test(t)) return 'sell'
  if (/dividend|\bdiv\b|\bcdiv\b|qual div|cash div/.test(t)) return 'dividend'
  return null
}

const num = (s: string | undefined): number => {
  if (s === undefined) return NaN
  const t = s.trim()
  if (!t) return NaN
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-')
  const n = Number(t.replace(/[$,()\s+-]/g, ''))
  return neg ? -n : n
}

export function parseDate(s: string | undefined): string | null {
  if (!s) return null
  const t = s.trim().replace(/\s+as of.*$/i, '')
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export interface ImportResult {
  book: Book
  skipped: { line: number; reason: string }[]
  format: string
}

function findHeader(rows: string[][]): { index: number; map: Partial<Record<Col, number>>; feeCols: number[] } | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i].map((c) => c.trim().toLowerCase())
    const map: Partial<Record<Col, number>> = {}
    for (const col of Object.keys(COLS) as Col[]) {
      const idx = cells.findIndex((c) => (COLS[col] as readonly string[]).includes(c))
      if (idx >= 0) map[col] = idx
    }
    // Brokers often split costs into separate commission and fee columns — add them all up.
    const feeCols = cells.flatMap((c, k) => ((COLS.fees as readonly string[]).includes(c) ? [k] : []))
    if (map.date !== undefined && map.symbol !== undefined && (map.type !== undefined || map.description !== undefined))
      return { index: i, map, feeCols }
  }
  return null
}

/** Turn CSV text into purchases, sales and dividends. Rows that aren't trades or dividends are skipped. */
export function importTransactions(text: string): ImportResult {
  const rows = parseCsv(text)
  const header = findHeader(rows)
  if (!header)
    return {
      book: { lots: [], sales: [], dividends: [] },
      skipped: [{ line: 1, reason: 'No header with date, symbol and type/action columns found' }],
      format: 'unknown',
    }
  const { index, map, feeCols } = header
  const get = (r: string[], c: Col) => (map[c] === undefined ? undefined : r[map[c]!]?.trim())
  const lots: Lot[] = []
  const sales: Sale[] = []
  const dividends: Dividend[] = []
  const skipped: ImportResult['skipped'] = []
  const isOwn = rows[index].map((c) => c.trim().toLowerCase()).join(',') === CSV_HEADER.join(',')

  rows.slice(index + 1).forEach((r, j) => {
    const line = index + j + 2
    const typeText = `${get(r, 'type') ?? ''} ${get(r, 'description') ?? ''}`
    const kind = classify(typeText)
    const symbol = (get(r, 'symbol') ?? '').replace(/^\*+/, '').toUpperCase()
    const date = parseDate(get(r, 'date'))
    if (!kind) return skipped.push({ line, reason: `Not a buy, sell or dividend (“${typeText.trim().slice(0, 40)}”)` })
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return skipped.push({ line, reason: 'Missing or unusual symbol' })
    if (!date) return skipped.push({ line, reason: 'Missing or unreadable date' })
    const notes = get(r, 'notes')
    const extra = notes ? { notes } : {}
    const amount = Math.abs(num(get(r, 'amount')))
    if (kind === 'dividend') {
      if (!(amount > 0)) return skipped.push({ line, reason: 'Dividend without an amount' })
      dividends.push({ id: newId(), symbol, amount, date, ...extra })
      return
    }
    const shares = Math.abs(num(get(r, 'shares')))
    let price = Math.abs(num(get(r, 'price')))
    if (!(price >= 0) && shares > 0 && amount > 0) price = amount / shares
    const feesN = feeCols.reduce((t, k) => t + (Math.abs(num(r[k])) || 0), 0)
    const fees = feesN > 0 ? { fees: feesN } : {}
    if (!(shares > 0) || !(price >= 0)) return skipped.push({ line, reason: 'Missing shares or price' })
    if (kind === 'buy') lots.push({ id: newId(), symbol, shares, buyPrice: price, buyDate: date, ...fees, ...extra })
    else sales.push({ id: newId(), symbol, shares, price, date, ...fees, ...extra })
  })

  return { book: { lots, sales, dividends }, skipped, format: isOwn ? 'Portfolio Tracker' : 'Broker / generic CSV' }
}
