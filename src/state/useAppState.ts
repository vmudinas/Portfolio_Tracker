import { useEffect, useReducer } from 'react'
import { loadState, saveState } from '../lib/storage'
import { reducer } from './reducer'

/** App state persisted to localStorage on every change. */
export function useAppState() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  useEffect(() => saveState(state), [state])
  return [state, dispatch] as const
}
