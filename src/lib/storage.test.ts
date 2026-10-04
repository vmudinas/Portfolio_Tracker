import { describe, expect, it } from 'vitest'
import { defaultState, exportState, loadState, parseState, saveState, STORAGE_KEY } from './storage'

describe('parseState', () => {
  it('rejects unrecognised data', () => {
    expect(parseState(null)).toBeNull()
    expect(parseState({ version: 2, profiles: [] })).toBeNull()
    expect(parseState({ version: 1, profiles: [] })).toBeNull()
  })

  it('keeps valid lots, drops invalid ones, and normalises symbols', () => {
    const s = parseState({
      version: 1,
      profiles: [
        {
          id: 'p1',
          name: 'Me',
          lots: [
            { id: 'a', symbol: ' aapl ', shares: 2, buyPrice: 100, buyDate: '2025-01-01' },
            { symbol: '', shares: 1, buyPrice: 1 },
            { symbol: 'MSFT', shares: 0, buyPrice: 1 },
          ],
        },
      ],
      settings: { refreshSeconds: 5, finnhubApiKey: ' key ' },
    })
    expect(s?.profiles[0].lots).toHaveLength(1)
    expect(s?.profiles[0].lots[0].symbol).toBe('AAPL')
    expect(s?.activeProfileId).toBe('p1')
    expect(s?.settings).toEqual({ refreshSeconds: 60, finnhubApiKey: 'key' })
  })
})

describe('load/save', () => {
  it('round-trips through localStorage', () => {
    const s = defaultState()
    s.profiles[0].lots.push({ id: 'x', symbol: 'KO', shares: 1, buyPrice: 60, buyDate: '2025-01-01' })
    saveState(s)
    expect(loadState()).toEqual(s)
  })

  it('falls back to a fresh state when storage is corrupted', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    const s = loadState()
    expect(s.profiles).toHaveLength(1)
    expect(s.profiles[0].lots).toEqual([])
  })
})

it('export never includes the API key', () => {
  const s = defaultState()
  s.settings.finnhubApiKey = 'secret'
  expect(exportState(s)).not.toContain('secret')
  expect(parseState(JSON.parse(exportState(s)))?.profiles).toHaveLength(1)
})
