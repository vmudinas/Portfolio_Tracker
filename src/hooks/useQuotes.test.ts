import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuoteProvider } from '../providers/QuoteProvider'
import type { MarketSession } from '../types'
import { useQuotes } from './useQuotes'

const provider = (): QuoteProvider & { getQuote: ReturnType<typeof vi.fn> } => ({
  name: 'fake',
  getQuote: vi.fn(async (s: string) => ({
    symbol: s,
    price: 100,
    change: 1,
    changePct: 1,
    prevClose: 99,
    updatedAt: '2026-10-02T20:00:00Z',
  })),
  search: async () => [],
})

const flush = () => act(() => vi.advanceTimersByTimeAsync(0))

describe('useQuotes polling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const run = (session: MarketSession) => {
    const p = provider()
    const hook = renderHook(({ s }) => useQuotes(['AAPL', 'MSFT'], p, 60, s), { initialProps: { s: session } })
    return { p, hook }
  }

  it('fetches once and stops while the market is closed', async () => {
    const { p } = run('closed')
    await flush()
    expect(p.getQuote).toHaveBeenCalledTimes(2)
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000))
    expect(p.getQuote).toHaveBeenCalledTimes(2)
  })

  it('keeps refreshing during the regular session', async () => {
    const { p } = run('regular')
    await flush()
    expect(p.getQuote).toHaveBeenCalledTimes(2)
    await act(() => vi.advanceTimersByTimeAsync(61_000))
    await flush()
    expect(p.getQuote).toHaveBeenCalledTimes(4)
  })

  it('fetches the closing price once when the session ends', async () => {
    const { p, hook } = run('regular')
    await flush()
    expect(p.getQuote).toHaveBeenCalledTimes(2)
    act(() => hook.rerender({ s: 'post' }))
    await flush()
    expect(p.getQuote).toHaveBeenCalledTimes(4)
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000))
    expect(p.getQuote).toHaveBeenCalledTimes(4)
  })
})
