import { useEffect, useRef, useState } from 'react'
import { money } from '../lib/format'
import type { PriceAlert } from '../types'

export const alertCrossed = (a: PriceAlert, price: number) =>
  a.direction === 'above' ? price >= a.price : price <= a.price

export const describeAlert = (a: Pick<PriceAlert, 'symbol' | 'direction' | 'price'>) =>
  `${a.symbol} ${a.direction === 'above' ? 'rises above' : 'falls below'} ${money(a.price)}`

/**
 * Fire armed alerts when the latest price crosses the target: record it in the store and show a
 * browser notification (when permitted). Returns the alerts fired during this visit for an in-page banner.
 */
export function useAlerts(
  alerts: PriceAlert[],
  prices: Record<string, number | undefined>,
  onTrigger: (id: string, at: string) => void,
) {
  const [visitStart] = useState(() => new Date().toISOString())
  const [dismissed, setDismissed] = useState<string[]>([])
  // Bridges the gap until the store records triggeredAt, so one crossing fires once.
  const pending = useRef(new Set<string>())

  useEffect(() => {
    for (const a of alerts) if (a.triggeredAt) pending.current.delete(a.id)
    for (const a of alerts) {
      if (a.triggeredAt || pending.current.has(a.id)) continue
      const price = prices[a.symbol]
      if (price === undefined || !alertCrossed(a, price)) continue
      pending.current.add(a.id)
      onTrigger(a.id, new Date().toISOString())
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`Price alert: ${a.symbol}`, {
            body: `${describeAlert(a)} — now ${money(price)}`,
            icon: `${import.meta.env.BASE_URL}icon-192.png`,
            tag: a.id,
          })
        }
      } catch {
        /* notifications unsupported here (e.g. iOS outside the installed app) */
      }
    }
  }, [alerts, prices, onTrigger])

  const fired = alerts.filter((a) => a.triggeredAt && a.triggeredAt >= visitStart && !dismissed.includes(a.id))
  return { fired, dismiss: (id: string) => setDismissed((d) => [...d, id]) }
}
