import { useCallback, useEffect, useState } from 'react'
import type { QuoteProvider } from '../providers/QuoteProvider'
import type { MarketStatus } from '../types'
import { useVisibleInterval } from './useVisibleInterval'

const CHECK_EVERY_MS = 5 * 60_000

/** US market session (pre / regular / post / closed), re-checked every 5 minutes. Null = unknown. */
export function useMarketStatus(provider: QuoteProvider | null): MarketStatus | null {
  const [status, setStatus] = useState<MarketStatus | null>(null)

  const check = useCallback(() => {
    if (!provider?.getMarketStatus) return
    provider
      .getMarketStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [provider])

  useEffect(() => {
    check()
  }, [check])
  useVisibleInterval(check, provider?.getMarketStatus ? CHECK_EVERY_MS : null)

  return provider ? status : null
}
