import { useEffect, useRef } from 'react'

/** Calls `fn` every `ms` while the tab is visible, and right away when the tab becomes visible again. */
export function useVisibleInterval(fn: () => void, ms: number | null) {
  const saved = useRef(fn)
  useEffect(() => {
    saved.current = fn
  }, [fn])

  useEffect(() => {
    if (ms === null) return
    const run = () => document.visibilityState === 'visible' && saved.current()
    const id = setInterval(run, ms)
    document.addEventListener('visibilitychange', run)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', run)
    }
  }, [ms])
}
