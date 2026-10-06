import { hasBackupData } from '../lib/backup'
import { defaultState, parseState } from '../lib/storage'
import type { AppState } from '../types'
import type { SyncMeta } from './engine'
import type { StoredRow } from './types'

const hasData = (s: AppState) =>
  hasBackupData(s.profiles) ||
  !!(s.settings.finnhubApiKey || s.settings.twelveDataApiKey || s.settings.alphaVantageApiKey)

export type Plan =
  /** Use this state; upload it first when `upload` is set (expectedRevision null = create the row). */
  | { kind: 'use'; state: AppState; upload: boolean; revision: number | null }
  /** This browser and the cloud both have different data — the user chooses. */
  | { kind: 'ask'; local: AppState; remote: AppState; revision: number }

/**
 * Decide what to show right after sign-in, given the cloud row and whatever this browser has.
 * `meta` says what this tab last synced (a reload in the same tab), so unsaved edits from before a
 * reload are uploaded instead of being treated as a conflict.
 */
export function reconcile(remote: StoredRow | null, local: AppState | null, meta: SyncMeta | null): Plan {
  const localState = local && hasData(local) ? local : null
  if (!remote) {
    return { kind: 'use', state: localState ?? defaultState(), upload: true, revision: null }
  }
  const remoteState = parseState(remote.data) ?? defaultState()
  if (!localState || JSON.stringify(localState) === JSON.stringify(remoteState)) {
    return { kind: 'use', state: remoteState, upload: false, revision: remote.revision }
  }
  if (meta) {
    const localJson = JSON.stringify(localState)
    // Nothing changed here since the last sync → the cloud copy is the newest.
    if (localJson === meta.synced) return { kind: 'use', state: remoteState, upload: false, revision: remote.revision }
    // Edited here and the cloud hasn't moved since → keep (and upload) this tab's edits.
    if (meta.revision === remote.revision)
      return { kind: 'use', state: localState, upload: true, revision: remote.revision }
  }
  return { kind: 'ask', local: localState, remote: remoteState, revision: remote.revision }
}
