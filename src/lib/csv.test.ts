import { describe, expect, it } from 'vitest'
import { classify, exportCsv, importTransactions, parseCsv, parseDate } from './csv'

describe('parseCsv', () => {
  it('handles quotes, commas and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ])
  })
})

describe('import', () => {
  it('round-trips our own export', () => {
    const book = {
      lots: [
        {
          id: '1',
          symbol: 'AAPL',
          shares: 10,
          buyPrice: 150.5,
          buyDate: '2025-01-02',
          fees: 1,
          notes: 'IRA, rollover',
        },
      ],
      sales: [{ id: '2', symbol: 'AAPL', shares: 4, price: 190, date: '2025-06-01' }],
      dividends: [{ id: '3', symbol: 'AAPL', amount: 2.5, date: '2025-05-15' }],
    }
    const res = importTransactions(exportCsv(book))
    expect(res.format).toBe('Portfolio Tracker')
    expect(res.skipped).toEqual([])
    expect(res.book.lots[0]).toMatchObject({
      symbol: 'AAPL',
      shares: 10,
      buyPrice: 150.5,
      buyDate: '2025-01-02',
      fees: 1,
      notes: 'IRA, rollover',
    })
    expect(res.book.sales[0]).toMatchObject({ shares: 4, price: 190, date: '2025-06-01' })
    expect(res.book.dividends[0]).toMatchObject({ amount: 2.5, date: '2025-05-15' })
  })

  it('reads a Fidelity-style export with preamble lines and skips non-trades', () => {
    const csv = [
      'Brokerage',
      '',
      'Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Amount ($),Settlement Date',
      '03/14/2025,YOU BOUGHT APPLE INC (AAPL) (Cash),AAPL,APPLE INC,Cash,10,172.40,,,-1724.00,03/17/2025',
      '05/15/2025,DIVIDEND RECEIVED APPLE INC (AAPL) (Cash),AAPL,APPLE INC,Cash,,,,,2.50,',
      '06/02/2025,YOU SOLD APPLE INC (AAPL) (Cash),AAPL,APPLE INC,Cash,-4,215.10,,0.03,860.37,06/03/2025',
      '06/30/2025,ELECTRONIC FUNDS TRANSFER RECEIVED (Cash),,No Description,Cash,,,,,500.00,',
    ].join('\n')
    const res = importTransactions(csv)
    expect(res.book.lots).toEqual([
      expect.objectContaining({ symbol: 'AAPL', shares: 10, buyPrice: 172.4, buyDate: '2025-03-14' }),
    ])
    expect(res.book.sales).toEqual([
      expect.objectContaining({ shares: 4, price: 215.1, fees: 0.03, date: '2025-06-02' }),
    ])
    expect(res.book.dividends).toEqual([expect.objectContaining({ amount: 2.5 })])
    expect(res.skipped).toHaveLength(1)
  })

  it('reads a Robinhood-style export (Trans Code, $ amounts)', () => {
    const csv = [
      'Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount',
      '1/27/2025,1/27/2025,1/28/2025,NVDA,NVIDIA,Buy,30,$118.60,($3558.00)',
      '3/31/2025,3/31/2025,3/31/2025,KO,Cash Div: R/D 2025-03-14,CDIV,,,$12.75',
    ].join('\n')
    const res = importTransactions(csv)
    expect(res.book.lots[0]).toMatchObject({ symbol: 'NVDA', shares: 30, buyPrice: 118.6, buyDate: '2025-01-27' })
    expect(res.book.dividends[0]).toMatchObject({ symbol: 'KO', amount: 12.75, date: '2025-03-31' })
  })

  it('explains files it cannot read', () => {
    expect(importTransactions('hello,world\n1,2').skipped[0].reason).toMatch(/No header/)
  })
})

it('classifies broker actions', () => {
  expect(classify('Reinvest Shares')).toBe('buy')
  expect(classify('Qualified Dividend')).toBe('dividend')
  expect(classify('Reinvest Dividend')).toBe('dividend')
  expect(classify('Sell')).toBe('sell')
  expect(classify('Journal')).toBeNull()
  expect(parseDate('03/14/2025 as of 03/13/2025')).toBe('2025-03-14')
})
