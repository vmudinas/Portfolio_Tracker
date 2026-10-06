import type { AppState, Dividend, Lot, PriceAlert, Profile, Sale, Settings } from '../types'
import { newId } from './id'

export const STORAGE_KEY = 'portfolio-tracker:v1'

export const DEFAULT_SETTINGS: Settings = { refreshSeconds: 60 }

/** 3-month T-bill was ~4.0% on 2026-10-01 (Fed H.15); users can change it in Settings. */
export const DEFAULT_RISK_FREE = 4

export function createProfile(name: string, lots: Lot[] = []): Profile {
  return {
    id: newId(),
    name: name.trim() || 'My portfolio',
    createdAt: new Date().toISOString(),
    lots,
    sales: [],
    dividends: [],
    cash: 0,
    watchlist: [],
    alerts: [],
  }
}

export function defaultState(): AppState {
  const profile = createProfile('My portfolio')
  return { version: 1, activeProfileId: profile.id, profiles: [profile], settings: { ...DEFAULT_SETTINGS } }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function parseLot(v: unknown): Lot | null {
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

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const sym = (v: unknown) => str(v).trim().toUpperCase()
const id = (v: unknown) => str(v) || newId()
const optFees = (v: unknown) => {
  if (v === undefined || v === null || v === '') return {}
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? { fees: n } : {}
}
const optNotes = (v: unknown) => (typeof v === 'string' && v ? { notes: v } : {})

export function parseSale(v: unknown): Sale | null {
  if (!isObj(v)) return null
  const symbol = sym(v.symbol)
  const shares = Number(v.shares)
  const price = Number(v.price)
  if (!symbol || !(shares > 0) || !(price >= 0)) return null
  return { id: id(v.id), symbol, shares, price, date: str(v.date), ...optFees(v.fees), ...optNotes(v.notes) }
}

export function parseDividend(v: unknown): Dividend | null {
  if (!isObj(v)) return null
  const symbol = sym(v.symbol)
  const amount = Number(v.amount)
  if (!symbol || !(amount > 0)) return null
  return { id: id(v.id), symbol, amount, date: str(v.date), ...optNotes(v.notes) }
}

function parseAlert(v: unknown): PriceAlert | null {
  if (!isObj(v)) return null
  const symbol = sym(v.symbol)
  const price = Number(v.price)
  if (!symbol || !(price > 0) || (v.direction !== 'above' && v.direction !== 'below')) return null
  return {
    id: id(v.id),
    symbol,
    direction: v.direction,
    price,
    createdAt: str(v.createdAt) || new Date().toISOString(),
    ...(typeof v.triggeredAt === 'string' && v.triggeredAt ? { triggeredAt: v.triggeredAt } : {}),
  }
}

const list = <T>(v: unknown, parse: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.map(parse).filter((x): x is T => x !== null) : []

function parseProfile(v: unknown): Profile | null {
  if (!isObj(v) || typeof v.name !== 'string') return null
  const cash = Number(v.cash)
  return {
    id: id(v.id),
    name: v.name,
    createdAt: str(v.createdAt) || new Date().toISOString(),
    lots: list(v.lots, parseLot),
    sales: list(v.sales, parseSale),
    dividends: list(v.dividends, parseDividend),
    cash: Number.isFinite(cash) && cash >= 0 ? cash : 0,
    watchlist: [...new Set(list(v.watchlist, (x) => sym(x) || null))],
    alerts: list(v.alerts, parseAlert),
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
    ...(typeof s.alphaVantageApiKey === 'string' && s.alphaVantageApiKey.trim()
      ? { alphaVantageApiKey: s.alphaVantageApiKey.trim() }
      : {}),
    ...(typeof s.showTrends === 'boolean' ? { showTrends: s.showTrends } : {}),
    ...(Number.isFinite(Number(s.riskFreeRate)) && s.riskFreeRate !== null && s.riskFreeRate !== ''
      ? { riskFreeRate: Math.min(25, Math.max(0, Number(s.riskFreeRate))) }
      : {}),
  }
  const activeProfileId =
    typeof raw.activeProfileId === 'string' && profiles.some((p) => p.id === raw.activeProfileId)
      ? raw.activeProfileId
      : profiles[0].id
  return { version: 1, activeProfileId, profiles, settings }
}

type Backing = 'local' | 'session'
let backing: Backing = 'local'
const store = (b: Backing): Storage => (b === 'session' ? sessionStorage : localStorage)

/**
 * Where the app keeps its working copy. With a cloud account it's sessionStorage, so the data on
 * this device disappears when the tab closes (the account holds the real copy).
 */
export function setStateStorage(b: Backing) {
  backing = b
}

/** The state saved in local or session storage, or null if there is none / it's unreadable. */
export function readStoredState(b: Backing = backing): AppState | null {
  try {
    const text = store(b).getItem(STORAGE_KEY)
    return text ? parseState(JSON.parse(text)) : null
  } catch {
    return null
  }
}

export function loadState(): AppState {
  // corrupted JSON or storage unavailable (private mode) — start fresh
  return readStoredState() ?? defaultState()
}

export function saveState(state: AppState): void {
  try {
    store(backing).setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage full or blocked — app keeps working in memory
  }
}

/** After moving to a cloud account: drop the old copy kept in localStorage. */
export function removeLegacyLocalState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function clearSessionState() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
