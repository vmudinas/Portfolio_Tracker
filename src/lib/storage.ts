import type { AppState, Lot, Profile, Settings } from '../types'
import { newId } from './id'

export const STORAGE_KEY = 'portfolio-tracker:v1'

export const DEFAULT_SETTINGS: Settings = { refreshSeconds: 60 }

export function createProfile(name: string, lots: Lot[] = []): Profile {
  return { id: newId(), name: name.trim() || 'My portfolio', createdAt: new Date().toISOString(), lots }
}

export function defaultState(): AppState {
  const profile = createProfile('My portfolio')
  return { version: 1, activeProfileId: profile.id, profiles: [profile], settings: { ...DEFAULT_SETTINGS } }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function parseLot(v: unknown): Lot | null {
  if (!isObj(v)) return null
  const symbol = typeof v.symbol === 'string' ? v.symbol.trim().toUpperCase() : ''
  const shares = Number(v.shares)
  const buyPrice = Number(v.buyPrice)
  if (!symbol || !(shares > 0) || !(buyPrice >= 0)) return null
  const fees = v.fees === undefined || v.fees === null || v.fees === '' ? undefined : Number(v.fees)
  return {
    id: typeof v.id === 'string' && v.id ? v.id : newId(),
    symbol,
    shares,
    buyPrice,
    buyDate: typeof v.buyDate === 'string' ? v.buyDate : '',
    ...(fees !== undefined && Number.isFinite(fees) && fees >= 0 ? { fees } : {}),
    ...(typeof v.notes === 'string' && v.notes ? { notes: v.notes } : {}),
  }
}

function parseProfile(v: unknown): Profile | null {
  if (!isObj(v) || typeof v.name !== 'string') return null
  const lots = Array.isArray(v.lots) ? v.lots.map(parseLot).filter((l): l is Lot => l !== null) : []
  return {
    id: typeof v.id === 'string' && v.id ? v.id : newId(),
    name: v.name,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : new Date().toISOString(),
    lots,
  }
}

/**
 * Validate untrusted JSON (localStorage or an imported file) into an AppState.
 * Returns null when it is not recognisable; drops individual bad lots.
 */
export function parseState(raw: unknown): AppState | null {
  if (!isObj(raw) || raw.version !== 1 || !Array.isArray(raw.profiles)) return null
  const profiles = raw.profiles.map(parseProfile).filter((p): p is Profile => p !== null)
  if (profiles.length === 0) return null
  const s = isObj(raw.settings) ? raw.settings : {}
  const refresh = Number(s.refreshSeconds)
  const settings: Settings = {
    refreshSeconds: Number.isFinite(refresh) && refresh >= 15 ? refresh : DEFAULT_SETTINGS.refreshSeconds,
    ...(typeof s.finnhubApiKey === 'string' && s.finnhubApiKey.trim() ? { finnhubApiKey: s.finnhubApiKey.trim() } : {}),
    ...(typeof s.twelveDataApiKey === 'string' && s.twelveDataApiKey.trim()
      ? { twelveDataApiKey: s.twelveDataApiKey.trim() }
      : {}),
    ...(typeof s.showTrends === 'boolean' ? { showTrends: s.showTrends } : {}),
  }
  const activeProfileId =
    typeof raw.activeProfileId === 'string' && profiles.some((p) => p.id === raw.activeProfileId)
      ? raw.activeProfileId
      : profiles[0].id
  return { version: 1, activeProfileId, profiles, settings }
}

export function loadState(): AppState {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (text) return parseState(JSON.parse(text)) ?? defaultState()
  } catch {
    // corrupted JSON or storage unavailable (private mode) — start fresh
  }
  return defaultState()
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage full or blocked — app keeps working in memory
  }
}

/** JSON for the "Export" button. API keys are left out so backups are safe to share. */
export function exportState(state: AppState): string {
  const settings: Settings = { refreshSeconds: state.settings.refreshSeconds, showTrends: state.settings.showTrends }
  return JSON.stringify({ ...state, settings }, null, 2)
}
