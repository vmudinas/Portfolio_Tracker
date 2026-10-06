import { createContext, useContext, useSyncExternalStore } from 'react'
import type { SyncEngine } from './engine'
import type { CloudAuth, CloudUser, SyncStatus } from './types'

export interface SyncSession {
  engine: SyncEngine
  user: CloudUser
  auth: CloudAuth
  signOut: () => Promise<void>
}

export const SyncContext = createContext<SyncSession | null>(null)

/** The signed-in cloud session, or null when the app runs without Supabase (local-only). */
export const useSync = () => useContext(SyncContext)

const noop = () => () => {}

export function useSyncStatus(): { status: SyncStatus; notice: string | null } | null {
  const sync = useSync()
  const key = useSyncExternalStore(sync ? (cb) => sync.engine.subscribe(cb) : noop, () =>
    sync ? `${sync.engine.status}\u0000${sync.engine.notice ?? ''}` : '',
  )
  if (!sync) return null
  const [status, notice] = key.split('\u0000')
  return { status: status as SyncStatus, notice: notice || null }
}
