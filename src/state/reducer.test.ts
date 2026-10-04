import { describe, expect, it } from 'vitest'
import { defaultState } from '../lib/storage'
import { activeProfile, reducer } from './reducer'

const lot = { symbol: 'aapl', shares: 1, buyPrice: 100, buyDate: '2025-01-01' }

describe('reducer', () => {
  it('adds lots to the active profile only', () => {
    let s = defaultState()
    const first = s.activeProfileId
    s = reducer(s, { type: 'lot/add', lot })
    s = reducer(s, { type: 'profile/add', name: 'Retirement' })
    expect(activeProfile(s).name).toBe('Retirement')
    expect(activeProfile(s).lots).toHaveLength(0)
    s = reducer(s, { type: 'profile/switch', id: first })
    expect(activeProfile(s).lots).toHaveLength(1)
    expect(activeProfile(s).lots[0].symbol).toBe('AAPL')
  })

  it('updates and deletes lots', () => {
    let s = reducer(defaultState(), { type: 'lot/add', lot })
    const id = activeProfile(s).lots[0].id
    s = reducer(s, { type: 'lot/update', id, lot: { ...lot, shares: 5 } })
    expect(activeProfile(s).lots[0]).toMatchObject({ id, shares: 5 })
    s = reducer(s, { type: 'lot/delete', id })
    expect(activeProfile(s).lots).toHaveLength(0)
  })

  it('renames, ignores blank names, and never deletes the last profile', () => {
    let s = defaultState()
    const id = s.activeProfileId
    s = reducer(s, { type: 'profile/rename', id, name: '  Joint  ' })
    expect(activeProfile(s).name).toBe('Joint')
    expect(reducer(s, { type: 'profile/rename', id, name: ' ' })).toBe(s)
    expect(reducer(s, { type: 'profile/delete', id })).toBe(s)
  })

  it('switches to another profile when the active one is deleted', () => {
    let s = reducer(defaultState(), { type: 'profile/add', name: 'B' })
    const b = s.activeProfileId
    s = reducer(s, { type: 'profile/delete', id: b })
    expect(s.profiles).toHaveLength(1)
    expect(s.activeProfileId).not.toBe(b)
  })
})
