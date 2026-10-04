import { describe, expect, it } from 'vitest'
import type { AppState } from '../types'
import { createBackup, mergeKeys, readBackup } from './backup'
import { defaultState } from './storage'

function sampleState(): AppState {
  const s = defaultState()
  const p = s.profiles[0]
  p.name = 'Me'
  p.lots.push({ id: 'l1', symbol: 'AAPL', shares: 10, buyPrice: 150, buyDate: '2025-01-02' })
  p.sales.push({ id: 's1', symbol: 'AAPL', shares: 2, price: 200, date: '2025-06-01' })
  p.dividends.push({ id: 'd1', symbol: 'AAPL', amount: 3, date: '2025-05-15' })
  p.cash = 500
  p.watchlist.push('TSLA')
  p.alerts.push({ id: 'a1', symbol: 'TSLA', direction: 'below', price: 200, createdAt: '2025-01-01T00:00:00Z' })
  s.settings = { refreshSeconds: 300, showTrends: true, finnhubApiKey: 'fh-secret', twelveDataApiKey: 'td-secret' }
  return s
}

describe('backup', () => {
  it('round-trips every profile, transaction, cash, watchlist, alert and setting', () => {
    const state = sampleState()
    const parsed = readBackup(createBackup(state, { theme: 'black' }))!
    expect(parsed).not.toBeNull()
    const { finnhubApiKey: _a, twelveDataApiKey: _b, ...settings } = state.settings
    void _a
    void _b
    expect(parsed.state).toEqual({ ...state, settings })
    expect(parsed.theme).toBe('black')
    expect(parsed.summary).toMatchObject({ profiles: 1, transactions: 3, watchlist: 1, alerts: 1, hasKeys: false })
    expect(parsed.summary.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('leaves API keys out unless asked', () => {
    const state = sampleState()
    expect(createBackup(state)).not.toContain('secret')
    const withKeys = readBackup(createBackup(state, { includeKeys: true }))!
    expect(withKeys.state.settings.finnhubApiKey).toBe('fh-secret')
    expect(withKeys.summary.hasKeys).toBe(true)
  })

  it('keeps this browser’s keys when restoring a backup without keys', () => {
    const current = sampleState()
    const restored = readBackup(createBackup(current))!.state
    expect(mergeKeys(restored, current).settings).toMatchObject({
      finnhubApiKey: 'fh-secret',
      twelveDataApiKey: 'td-secret',
    })
  })

  it('rejects files that are not backups', () => {
    expect(readBackup('not json')).toBeNull()
    expect(readBackup('{"hello":1}')).toBeNull()
  })
})
