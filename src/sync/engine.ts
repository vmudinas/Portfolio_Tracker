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

export function readMeta(userId: string): SyncMeta | null {
  try {
    const m = JSON.parse(sessionStorage.getItem(META_KEY) ?? 'null') as SyncMeta | null
    return m && m.userId === userId && typeof m.synced === 'string' ? m : null
  } catch {
    return null
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
  private userId: string

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
      const res = await this.store.save(this.userId, JSON.parse(json), this.revision)
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
      // Someone (another device or tab) saved first: take the newer cloud data.
      this.pending = null
      await this.pull(true)
      this.set(
        'saved',
        'Your data was changed on another device, so the latest version was loaded. Your last change here was not saved — please redo it.',
      )
    } catch {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      this.set(offline ? 'offline' : 'error')
      this.schedule(RETRY_MS[Math.min(this.retry++, RETRY_MS.length - 1)])
    }
  }

  /** Load the cloud copy and apply it if it is newer than ours (and we have no unsaved edits). */
  async pull(force = false) {
    if (this.pending && !force) return
    let row
    try {
      row = await this.store.load(this.userId)
    } catch {
      return
    }
    if (!row || (!force && row.revision <= this.revision)) return
    const state = parseState(row.data)
    if (!state) return
    this.revision = row.revision
    this.synced = JSON.stringify(state)
    writeMeta({ userId: this.userId, revision: this.revision, synced: this.synced })
    this.remoteListeners.forEach((l) => l(state))
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
