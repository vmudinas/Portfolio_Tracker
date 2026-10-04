import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState } from '../types'

const KEY = 'portfolio-tracker:backup-status'
const REMIND_AFTER_MS = 7 * 86_400_000

interface Status {
  lastBackupAt: string | null
  /** Last time portfolio data changed (not settings like theme or chart toggle). */
  changedAt: string | null
  snoozeUntil: string | null
}

function read(): Status {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Status>
    return { lastBackupAt: s.lastBackupAt ?? null, changedAt: s.changedAt ?? null, snoozeUntil: s.snoozeUntil ?? null }
  } catch {
    return { lastBackupAt: null, changedAt: null, snoozeUntil: null }
  }
}

function write(s: Status) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

const dataFingerprint = (state: AppState) => JSON.stringify(state.profiles)

/**
 * Tracks when data last changed vs. when it was last backed up, and asks the browser to
 * keep this site's storage (so it isn't evicted automatically when space runs low).
 */
export function useBackupStatus(state: AppState) {
  const [status, setStatus] = useState<Status>(read)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const fingerprint = dataFingerprint(state)
  const first = useRef(fingerprint)
  const skipNext = useRef(false)
  const hasData = state.profiles.some((p) => p.lots.length + p.sales.length + p.dividends.length > 0)

  useEffect(() => {
    if (fingerprint === first.current) return
    first.current = fingerprint
    // Data that was just restored from a backup is, by definition, backed up.
    if (skipNext.current) {
      skipNext.current = false
      return
    }
    const next = { ...read(), changedAt: new Date().toISOString() }
    write(next)
    setStatus(next)
  }, [fingerprint])

  useEffect(() => {
    if (!hasData || typeof navigator === 'undefined' || !navigator.storage?.persisted) return
    let cancelled = false
    void navigator.storage
      .persisted()
      .then((p) => (p || !navigator.storage.persist ? p : navigator.storage.persist()))
      .then((p) => !cancelled && setPersisted(p))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [hasData])

  const markBackedUp = useCallback(() => {
    const next = { ...read(), lastBackupAt: new Date().toISOString(), snoozeUntil: null }
    write(next)
    setStatus(next)
  }, [])

  /** Call right before replacing the state with a restored backup. */
  const markRestored = useCallback(() => {
    skipNext.current = true
    markBackedUp()
  }, [markBackedUp])

  const snooze = useCallback(() => {
    const next = { ...read(), snoozeUntil: new Date(Date.now() + REMIND_AFTER_MS).toISOString() }
    write(next)
    setStatus(next)
  }, [])

  const [now] = useState(() => Date.now())
  const changedSinceBackup =
    hasData && (!status.lastBackupAt || (!!status.changedAt && status.changedAt > status.lastBackupAt))
  const stale = !status.lastBackupAt || now - Date.parse(status.lastBackupAt) > REMIND_AFTER_MS
  const snoozed = !!status.snoozeUntil && Date.parse(status.snoozeUntil) > now
  const needsBackup = changedSinceBackup && stale && !snoozed

  return {
    lastBackupAt: status.lastBackupAt,
    changedSinceBackup,
    needsBackup,
    persisted,
    markBackedUp,
    markRestored,
    snooze,
  }
}
