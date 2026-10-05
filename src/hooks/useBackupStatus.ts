import { useCallback, useEffect, useRef, useState } from 'react'
import { hasBackupData } from '../lib/backup'
import type { AppState, Profile } from '../types'

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

const dataFingerprint = (profiles: Profile[]) => JSON.stringify(profiles)

/**
 * Tracks when data last changed vs. when it was last backed up, and asks the browser to
 * keep this site's storage (so it isn't evicted automatically when space runs low).
 */
export function useBackupStatus(state: AppState) {
  const [status, setStatus] = useState<Status>(read)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const fingerprint = dataFingerprint(state.profiles)
  const first = useRef(fingerprint)
  /** Fingerprint of a backup that is about to be restored; that one change isn't an edit. */
  const restoredFingerprint = useRef<string | null>(null)
  const hasData = hasBackupData(state.profiles)

  useEffect(() => {
    if (fingerprint === first.current) return
    first.current = fingerprint
    // Data that was just restored from a backup is, by definition, backed up. The skip is
    // tied to the restored data and used up by the first change either way, so an identical
    // restore (no change at all) can't swallow a later real edit.
    const restored = restoredFingerprint.current === fingerprint
    restoredFingerprint.current = null
    if (restored) return
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
  const markRestored = useCallback(
    (restored: AppState) => {
      restoredFingerprint.current = dataFingerprint(restored.profiles)
      markBackedUp()
    },
    [markBackedUp],
  )

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
