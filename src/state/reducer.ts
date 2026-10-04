import { createProfile } from '../lib/storage'
import { newId } from '../lib/id'
import type { AppState, Book, Dividend, Lot, PriceAlert, Profile, Sale, Settings } from '../types'

export type LotInput = Omit<Lot, 'id'>
export type SaleInput = Omit<Sale, 'id'>
export type DividendInput = Omit<Dividend, 'id'>
export type AlertInput = Pick<PriceAlert, 'symbol' | 'direction' | 'price'>

export type Action =
  | { type: 'profile/add'; name: string }
  | { type: 'profile/rename'; id: string; name: string }
  | { type: 'profile/delete'; id: string }
  | { type: 'profile/switch'; id: string }
  | { type: 'lot/add'; lot: LotInput }
  | { type: 'lot/update'; id: string; lot: LotInput }
  | { type: 'lot/delete'; id: string }
  | { type: 'lots/replace'; lots: Lot[] }
  | { type: 'sale/add'; sale: SaleInput }
  | { type: 'sale/update'; id: string; sale: SaleInput }
  | { type: 'sale/delete'; id: string }
  | { type: 'dividend/add'; dividend: DividendInput }
  | { type: 'dividend/update'; id: string; dividend: DividendInput }
  | { type: 'dividend/delete'; id: string }
  | { type: 'book/import'; book: Book }
  | { type: 'cash/set'; cash: number }
  | { type: 'watchlist/add'; symbol: string }
  | { type: 'watchlist/remove'; symbol: string }
  | { type: 'alert/add'; alert: AlertInput }
  | { type: 'alert/delete'; id: string }
  | { type: 'alert/trigger'; id: string; at: string }
  | { type: 'alert/rearm'; id: string }
  | { type: 'settings/update'; settings: Partial<Settings> }
  | { type: 'state/replace'; state: AppState }

const normalize = <T extends { symbol: string }>(x: T): T => ({ ...x, symbol: x.symbol.trim().toUpperCase() })

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
    case 'sale/add':
      return updateActive(state, (p) => ({ ...p, sales: [...p.sales, { id: newId(), ...normalize(action.sale) }] }))
    case 'sale/update':
      return updateActive(state, (p) => ({
        ...p,
        sales: p.sales.map((x) => (x.id === action.id ? { id: x.id, ...normalize(action.sale) } : x)),
      }))
    case 'sale/delete':
      return updateActive(state, (p) => ({ ...p, sales: p.sales.filter((x) => x.id !== action.id) }))
    case 'dividend/add':
      return updateActive(state, (p) => ({
        ...p,
        dividends: [...p.dividends, { id: newId(), ...normalize(action.dividend) }],
      }))
    case 'dividend/update':
      return updateActive(state, (p) => ({
        ...p,
        dividends: p.dividends.map((x) => (x.id === action.id ? { id: x.id, ...normalize(action.dividend) } : x)),
      }))
    case 'dividend/delete':
      return updateActive(state, (p) => ({ ...p, dividends: p.dividends.filter((x) => x.id !== action.id) }))
    case 'book/import':
      return updateActive(state, (p) => ({
        ...p,
        lots: [...p.lots, ...action.book.lots],
        sales: [...p.sales, ...action.book.sales],
        dividends: [...p.dividends, ...action.book.dividends],
      }))
    case 'cash/set':
      return updateActive(state, (p) => ({ ...p, cash: Math.max(0, action.cash) }))
    case 'watchlist/add': {
      const symbol = action.symbol.trim().toUpperCase()
      if (!symbol) return state
      return updateActive(state, (p) =>
        p.watchlist.includes(symbol) ? p : { ...p, watchlist: [...p.watchlist, symbol] },
      )
    }
    case 'watchlist/remove':
      return updateActive(state, (p) => ({ ...p, watchlist: p.watchlist.filter((s) => s !== action.symbol) }))
    case 'alert/add':
      return updateActive(state, (p) => ({
        ...p,
        alerts: [...p.alerts, { id: newId(), ...normalize(action.alert), createdAt: new Date().toISOString() }],
      }))
    case 'alert/delete':
      return updateActive(state, (p) => ({ ...p, alerts: p.alerts.filter((a) => a.id !== action.id) }))
    case 'alert/trigger':
      // Alerts can fire for any profile's watch, so search all profiles.
      return {
        ...state,
        profiles: state.profiles.map((p) => ({
          ...p,
          alerts: p.alerts.map((a) => (a.id === action.id ? { ...a, triggeredAt: action.at } : a)),
        })),
      }
    case 'alert/rearm':
      return updateActive(state, (p) => ({
        ...p,
        alerts: p.alerts.map((a) => {
          if (a.id !== action.id) return a
          const { triggeredAt: _t, ...rest } = a
          void _t
          return rest
        }),
      }))
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.settings } }
    case 'state/replace':
      return action.state
  }
}

export function activeProfile(state: AppState): Profile {
  return state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0]
}
