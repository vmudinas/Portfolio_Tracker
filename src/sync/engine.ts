import { parseState } from '../lib/storage'
import type { AppState } from '../types'
import type { CloudStore, SyncStatus } from './types'

export const META_KEY = 'portfolio-tracker:sync-meta'
const DEBOUNCE_MS = 1200
const RETRY_MS = [5_000, 15_000, 30_000, 60_000]

/** What this tab last agreed with the cloud on (kept in sessionStorage, so it survives a reload). */
export interface SyncMeta {
  userId: string
  revision: number
  /** JSON of the state as last saved to / loaded from the cloud. */
  synced: string
}

/** The sync record of whoever last used this tab (any user). */
export function readAnyMeta(): SyncMeta | null {
  try {
    const m = JSON.parse(sessionStorage.getItem(META_KEY) ?? 'null') as SyncMeta | null
    return m && typeof m.userId === 'string' && typeof m.synced === 'string' ? m : null
  } catch {
    return null
  }
}

export function readMeta(userId: string): SyncMeta | null {
  const m = readAnyMeta()
  return m && m.userId === userId ? m : null
}

// ---- Unsaved edits kept per user after signing out (e.g. offline), so they upload on that user's next
// login in this tab — and are never shown to, or uploaded by, a different account.

const STASH_PREFIX = 'portfolio-tracker:unsaved:'

export interface Stash {
  state: unknown
  meta: SyncMeta
}

export function stashUnsaved(userId: string, s: Stash) {
  try {
    sessionStorage.setItem(STASH_PREFIX + userId, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export function readStash(userId: string): { state: AppState; meta: SyncMeta } | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(STASH_PREFIX + userId) ?? 'null') as Stash | null
    const state = s && parseState(s.state)
    return state && s.meta?.userId === userId ? { state, meta: s.meta } : null
  } catch {
    return null
  }
}

export function clearStash(userId: string) {
  try {
    sessionStorage.removeItem(STASH_PREFIX + userId)
  } catch {
    /* ignore */
  }
}

function writeMeta(m: SyncMeta) {
  try {
    sessionStorage.setItem(META_KEY, JSON.stringify(m))
  } catch {
    /* ignore */
  }
}

export function clearMeta() {
  try {
    sessionStorage.removeItem(META_KEY)
  } catch {
    /* ignore */
  }
}

type Listener = () => void

/**
 * Keeps the cloud copy in step with the app state:
 * - changes are saved ~1 s after the last edit (one row per user, optimistic `revision` check);
 * - if another device saved first, the newer cloud data wins and the app is told to load it;
 * - offline / server errors are retried with backoff and when the browser comes back online.
 */
export class SyncEngine {
  status: SyncStatus = 'saved'
  /** Shown to the user when something needs their attention (e.g. a change was overwritten). */
  notice: string | null = null
  private revision: number
  private synced: string
  private pending: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private retry = 0
  private inFlight: Promise<void> | null = null
  private listeners = new Set<Listener>()
  private remoteListeners = new Set<(s: AppState) => void>()

  private store: CloudStore
  readonly userId: string

  constructor(store: CloudStore, userId: string, initial: { revision: number; state: AppState }) {
    this.store = store
    this.userId = userId
    this.revision = initial.revision
    this.synced = JSON.stringify(initial.state)
    writeMeta({ userId, revision: this.revision, synced: this.synced })
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }

  /** The app should replace its state with this (newer data from another device). */
  onRemote(fn: (s: AppState) => void) {
    this.remoteListeners.add(fn)
    return () => void this.remoteListeners.delete(fn)
  }

  private set(status: SyncStatus, notice: string | null = this.notice) {
    this.status = status
    this.notice = notice
    this.listeners.forEach((l) => l())
  }

  dismissNotice() {
    this.set(this.status, null)
  }

  get hasUnsaved() {
    return this.pending !== null
  }

  /** Call on every state change; no-op when nothing differs from the cloud copy. */
  save(state: AppState) {
    const json = JSON.stringify(state)
    if (json === this.synced && this.pending === null) return
    this.pending = json === this.synced ? null : json
    if (this.pending === null) return this.set('saved')
    this.set(this.status === 'offline' || this.status === 'error' ? this.status : 'saving')
    this.schedule(DEBOUNCE_MS)
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), ms)
  }

  /** Save now (e.g. before signing out). Resolves when nothing is left to save or the save failed. */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.inFlight) return this.inFlight.then(() => (this.pending ? this.flush() : undefined))
    if (this.pending === null) return Promise.resolve()
    this.inFlight = this.doSave(this.pending).finally(() => (this.inFlight = null))
    return this.inFlight
  }

  private async doSave(json: string) {
    try {
      const res = await this.store.save(this.userId, JSON.parse(json), this.revision > 0 ? this.revision : null)
      if (res.status === 'ok') {
        this.revision = res.revision
        this.synced = json
        if (this.pending === json) this.pending = null
        this.retry = 0
        writeMeta({ userId: this.userId, revision: this.revision, synced: this.synced })
        this.set(this.pending ? 'saving' : 'saved')
        if (this.pending) this.schedule(DEBOUNCE_MS)
        return
      }
      // Someone (another device or tab) saved first: take the newer cloud data — but keep our edit
      // pending until that data has actually been loaded, so a failed load doesn't lose it.
      const pulled = await this.pull(true)
      if (pulled === 'failed') return this.failed()
      if (pulled === 'missing') return this.schedule(0) // row was deleted: save again to recreate it
      this.pending = null
      this.retry = 0
      this.set(
        'saved',
        'Your data was changed on another device, so the latest version was loaded. Your last change here was not saved — please redo it.',
      )
    } catch {
      this.failed()
    }
  }

  private failed() {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    this.set(offline ? 'offline' : 'error')
    this.schedule(RETRY_MS[Math.min(this.retry++, RETRY_MS.length - 1)])
  }

  /**
   * Load the cloud copy and apply it if it is newer than ours (and we have no unsaved edits, unless
   * `force`). Returns what happened so a conflicting save knows whether it's safe to drop its edit.
   */
  async pull(force = false): Promise<'applied' | 'unchanged' | 'missing' | 'failed'> {
    if (this.pending && !force) return 'unchanged'
    let row
    try {
      row = await this.store.load(this.userId)
    } catch {
      return 'failed'
    }
    if (!row) {
      if (force) this.revision = 0
      return force ? 'missing' : 'unchanged'
    }
    if (!force && row.revision <= this.revision) return 'unchanged'
    const state = parseState(row.data)
    if (!state) return 'failed'
    this.revision = row.revision
    this.synced = JSON.stringify(state)
    writeMeta({ userId: this.userId, revision: this.revision, synced: this.synced })
    this.remoteListeners.forEach((l) => l(state))
    return 'applied'
  }

  /** Retry right away (used when the browser comes back online). */
  retryNow() {
    if (this.pending) void this.flush()
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer)
    this.listeners.clear()
    this.remoteListeners.clear()
  }
}
