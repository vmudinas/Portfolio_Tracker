import { createProfile } from '../lib/storage'
import { newId } from '../lib/id'
import type { AppState, Lot, Profile, Settings } from '../types'

export type LotInput = Omit<Lot, 'id'>

export type Action =
  | { type: 'profile/add'; name: string }
  | { type: 'profile/rename'; id: string; name: string }
  | { type: 'profile/delete'; id: string }
  | { type: 'profile/switch'; id: string }
  | { type: 'lot/add'; lot: LotInput }
  | { type: 'lot/update'; id: string; lot: LotInput }
  | { type: 'lot/delete'; id: string }
  | { type: 'lots/replace'; lots: Lot[] }
  | { type: 'settings/update'; settings: Partial<Settings> }
  | { type: 'state/replace'; state: AppState }

const normalize = (lot: LotInput): LotInput => ({ ...lot, symbol: lot.symbol.trim().toUpperCase() })

function updateActive(state: AppState, fn: (p: Profile) => Profile): AppState {
  return { ...state, profiles: state.profiles.map((p) => (p.id === state.activeProfileId ? fn(p) : p)) }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'profile/add': {
      const profile = createProfile(action.name)
      return { ...state, profiles: [...state.profiles, profile], activeProfileId: profile.id }
    }
    case 'profile/rename': {
      const name = action.name.trim()
      if (!name) return state
      return { ...state, profiles: state.profiles.map((p) => (p.id === action.id ? { ...p, name } : p)) }
    }
    case 'profile/delete': {
      if (state.profiles.length <= 1) return state
      const profiles = state.profiles.filter((p) => p.id !== action.id)
      const activeProfileId = state.activeProfileId === action.id ? profiles[0].id : state.activeProfileId
      return { ...state, profiles, activeProfileId }
    }
    case 'profile/switch':
      return state.profiles.some((p) => p.id === action.id) ? { ...state, activeProfileId: action.id } : state
    case 'lot/add':
      return updateActive(state, (p) => ({ ...p, lots: [...p.lots, { id: newId(), ...normalize(action.lot) }] }))
    case 'lot/update':
      return updateActive(state, (p) => ({
        ...p,
        lots: p.lots.map((l) => (l.id === action.id ? { id: l.id, ...normalize(action.lot) } : l)),
      }))
    case 'lot/delete':
      return updateActive(state, (p) => ({ ...p, lots: p.lots.filter((l) => l.id !== action.id) }))
    case 'lots/replace':
      return updateActive(state, (p) => ({ ...p, lots: action.lots }))
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.settings } }
    case 'state/replace':
      return action.state
  }
}

export function activeProfile(state: AppState): Profile {
  return state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0]
}
