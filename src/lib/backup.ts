import type { Theme } from '../hooks/useTheme'
import type { AppState, Profile } from '../types'
import { parseState } from './storage'

export const BACKUP_APP = 'portfolio-tracker'

export interface BackupSummary {
  profiles: number
  transactions: number
  watchlist: number
  alerts: number
  exportedAt: string | null
  hasKeys: boolean
}

export interface ParsedBackup {
  state: AppState
  theme: Theme | null
  summary: BackupSummary
}

/** Full backup of every profile and setting. API keys only when asked for. */
export function createBackup(state: AppState, opts: { includeKeys?: boolean; theme?: Theme } = {}): string {
  const { finnhubApiKey, twelveDataApiKey, alphaVantageApiKey, ...rest } = state.settings
  const settings = opts.includeKeys ? { ...rest, finnhubApiKey, twelveDataApiKey, alphaVantageApiKey } : rest
  return JSON.stringify(
    {
      app: BACKUP_APP,
      exportedAt: new Date().toISOString(),
      ...(opts.theme ? { theme: opts.theme } : {}),
      ...state,
      settings,
    },
    null,
    2,
  )
}

export function summarize(state: AppState, exportedAt: string | null = null): BackupSummary {
  return {
    profiles: state.profiles.length,
    transactions: state.profiles.reduce((n, p) => n + p.lots.length + p.sales.length + p.dividends.length, 0),
    watchlist: state.profiles.reduce((n, p) => n + p.watchlist.length, 0),
    alerts: state.profiles.reduce((n, p) => n + p.alerts.length, 0),
    exportedAt,
    hasKeys: !!(state.settings.finnhubApiKey || state.settings.twelveDataApiKey || state.settings.alphaVantageApiKey),
  }
}

/** Validate a backup file's text. Returns null when it isn't a Portfolio Tracker backup. */
export function readBackup(text: string): ParsedBackup | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const state = parseState(raw)
  if (!state) return null
  const obj = raw as Record<string, unknown>
  const theme = ['light', 'dark', 'black', 'system'].includes(obj.theme as string) ? (obj.theme as Theme) : null
  const exportedAt = typeof obj.exportedAt === 'string' ? obj.exportedAt : null
  return { state, theme, summary: summarize(state, exportedAt) }
}

/** Restored state; keeps this browser's API keys when the backup has none. */
export function mergeKeys(restored: AppState, current: AppState): AppState {
  return {
    ...restored,
    settings: {
      ...restored.settings,
      finnhubApiKey: restored.settings.finnhubApiKey ?? current.settings.finnhubApiKey,
      twelveDataApiKey: restored.settings.twelveDataApiKey ?? current.settings.twelveDataApiKey,
      alphaVantageApiKey: restored.settings.alphaVantageApiKey ?? current.settings.alphaVantageApiKey,
    },
  }
}

export function backupFileName(date = new Date()) {
  return `portfolio-tracker-backup-${date.toISOString().slice(0, 10)}.json`
}

export function downloadText(text: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const DEFAULT_NAME = 'My portfolio'

/**
 * True when the profiles hold anything a backup would preserve: transactions, cash, watchlist,
 * alerts, extra profiles or a renamed profile. A single untouched default profile is not data.
 */
export function hasBackupData(profiles: Profile[]): boolean {
  if (profiles.length > 1) return true
  return profiles.some(
    (p) =>
      p.lots.length + p.sales.length + p.dividends.length + p.watchlist.length + p.alerts.length > 0 ||
      p.cash !== 0 ||
      p.name !== DEFAULT_NAME,
  )
}
