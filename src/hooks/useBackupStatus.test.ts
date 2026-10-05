import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProfile, defaultState } from '../lib/storage'
import type { AppState, Profile } from '../types'
import { hasBackupData } from '../lib/backup'
import { useBackupStatus } from './useBackupStatus'

const lot = { id: 'l1', symbol: 'AAPL', shares: 1, buyPrice: 100, buyDate: '2026-01-02' }

const withProfile = (state: AppState, fn: (p: Profile) => Profile): AppState => ({
  ...state,
  profiles: state.profiles.map((p, i) => (i === 0 ? fn(p) : p)),
})

describe('hasBackupData', () => {
  const blank = () => createProfile('My portfolio')

  it('is false only for a single untouched default profile', () => {
    expect(hasBackupData([blank()])).toBe(false)
    expect(hasBackupData([{ ...blank(), lots: [lot] }])).toBe(true)
  })

  it('counts cash, watchlist, alerts, extra and renamed profiles', () => {
    expect(hasBackupData([{ ...blank(), cash: 500 }])).toBe(true)
    expect(hasBackupData([{ ...blank(), watchlist: ['MSFT'] }])).toBe(true)
    expect(
      hasBackupData([
        { ...blank(), alerts: [{ id: 'a', symbol: 'MSFT', direction: 'above', price: 1, createdAt: '2026-10-01' }] },
      ]),
    ).toBe(true)
    expect(hasBackupData([blank(), blank()])).toBe(true)
    expect(hasBackupData([createProfile('Retirement')])).toBe(true)
  })
})

describe('useBackupStatus', () => {
  let t = Date.parse('2026-10-05T12:00:00Z')
  const tick = () => vi.setSystemTime((t += 1000))

  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(t)
  })
  afterEach(() => vi.useRealTimers())

  const setup = (initial: AppState) =>
    renderHook(({ state }) => useBackupStatus(state), { initialProps: { state: initial } })

  it('still flags the next edit after restoring a backup identical to the current data', () => {
    const state = withProfile(defaultState(), (p) => ({ ...p, lots: [lot] }))
    const { result, rerender } = setup(state)

    tick()
    act(() => result.current.markRestored(structuredClone(state)))
    rerender({ state: structuredClone(state) })
    expect(result.current.changedSinceBackup).toBe(false)

    tick()
    rerender({ state: withProfile(state, (p) => ({ ...p, cash: 100 })) })
    expect(result.current.changedSinceBackup).toBe(true)
  })

  it('does not count the restore itself as an unbacked change', () => {
    const state = withProfile(defaultState(), (p) => ({ ...p, lots: [lot] }))
    const restored = withProfile(state, (p) => ({ ...p, cash: 250 }))
    const { result, rerender } = setup(state)

    tick()
    act(() => result.current.markRestored(restored))
    tick()
    rerender({ state: restored })
    expect(result.current.changedSinceBackup).toBe(false)

    tick()
    rerender({ state: withProfile(restored, (p) => ({ ...p, cash: 300 })) })
    expect(result.current.changedSinceBackup).toBe(true)
  })

  it('keeps reminding when only non-transaction data is left', () => {
    const state = withProfile(defaultState(), (p) => ({ ...p, lots: [lot], watchlist: ['MSFT'] }))
    const { result, rerender } = setup(state)

    tick()
    act(() => result.current.markBackedUp())
    tick()
    rerender({ state: withProfile(state, (p) => ({ ...p, lots: [] })) })
    expect(result.current.changedSinceBackup).toBe(true)
  })
})
