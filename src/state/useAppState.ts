import { useEffect, useReducer } from 'react'
import { loadState, saveState } from '../lib/storage'
import { useSync } from '../sync/SyncContext'
import { reducer } from './reducer'

/** App state persisted on every change — and, when signed in to a cloud account, synced to it. */
export function useAppState() {
  const sync = useSync()
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  useEffect(() => saveState(state), [state])
  useEffect(() => sync?.engine.save(state), [state, sync])
  useEffect(() => sync?.engine.onRemote((s) => dispatch({ type: 'state/replace', state: s })), [sync])
  return [state, dispatch] as const
}
