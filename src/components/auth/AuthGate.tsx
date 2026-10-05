import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { endSession, readCredentials, sessionActive, touchSession, type Credentials } from '../../lib/auth'
import { HomePage } from './HomePage'

const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/**
 * Shows the home / login page until the user signs in, and only then mounts the app.
 * Locks again after 15 minutes without activity, when the tab is closed, or on "Lock".
 */
export function AuthGate({ children }: { children: (lock: () => void) => ReactNode }) {
  const [creds, setCreds] = useState<Credentials | null>(readCredentials)
  const [unlocked, setUnlocked] = useState(() => !!creds && sessionActive())

  const lock = useCallback(() => {
    endSession()
    setUnlocked(false)
  }, [])

  useEffect(() => {
    if (!unlocked) return
    let last = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - last < 5000) return
      last = now
      touchSession(now)
    }
    const check = () => {
      if (!sessionActive()) lock()
    }
    onActivity()
    ACTIVITY.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', check)
    const id = window.setInterval(check, 15_000)
    return () => {
      ACTIVITY.forEach((e) => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', check)
      window.clearInterval(id)
    }
  }, [unlocked, lock])

  if (unlocked && creds) return <>{children(lock)}</>
  return (
    <HomePage
      credentials={creds}
      onSignedIn={(c) => {
        touchSession()
        setCreds(c)
        setUnlocked(true)
      }}
      onReset={() => setCreds(null)}
    />
  )
}
