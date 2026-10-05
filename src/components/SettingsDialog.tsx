import { useRef, useState } from 'react'
import { exportCsv, importTransactions, type ImportResult } from '../lib/csv'
import type { Theme } from '../hooks/useTheme'
import { activeProfile } from '../state/reducer'
import { DEFAULT_RISK_FREE } from '../lib/storage'
import type { AppState, Book, Settings } from '../types'
import { Button, Field, inputClass, Modal } from './ui'

interface Props {
  state: AppState
  onSave: (settings: Partial<Settings>) => void
  onOpenBackup: () => void
  onImportBook: (book: Book) => void
  theme: Theme
  onTheme: (t: Theme) => void
  onClearAll: () => void
  onClose: () => void
}

export function SettingsDialog({
  state,
  onSave,
  onOpenBackup,
  onImportBook,
  theme,
  onTheme,
  onClearAll,
  onClose,
}: Props) {
  const [apiKey, setApiKey] = useState(state.settings.finnhubApiKey ?? '')
  const [tdKey, setTdKey] = useState(state.settings.twelveDataApiKey ?? '')
  const [showKey, setShowKey] = useState(false)
  const [refresh, setRefresh] = useState(String(state.settings.refreshSeconds))
  const [riskFree, setRiskFree] = useState(String(state.settings.riskFreeRate ?? DEFAULT_RISK_FREE))
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const csvRef = useRef<HTMLInputElement>(null)
  const [csv, setCsv] = useState<ImportResult | null>(null)
  const profile = activeProfile(state)

  const save = () => {
    onSave({
      finnhubApiKey: apiKey.trim() || undefined,
      twelveDataApiKey: tdKey.trim() || undefined,
      refreshSeconds: Number(refresh),
      riskFreeRate:
        Number.isFinite(Number(riskFree)) && riskFree.trim() !== ''
          ? Math.min(25, Math.max(0, Number(riskFree)))
          : DEFAULT_RISK_FREE,
    })
    onClose()
  }

  const saveFile = (text: string, type: string, name: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }
  const stamp = () => new Date().toISOString().slice(0, 10)
  const downloadCsv = () =>
    saveFile(
      exportCsv(profile),
      'text/csv',
      `portfolio-${profile.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${stamp()}.csv`,
    )
  const readCsv = async (file: File) => {
    setMessage(null)
    setCsv(importTransactions(await file.text()))
  }
  const csvCount = csv ? csv.book.lots.length + csv.book.sales.length + csv.book.dividends.length : 0

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-5">
        <Field
          label="Finnhub API key"
          hint={
            <>
              Free at{' '}
              <a
                className="text-teal-700 underline dark:text-teal-400"
                href="https://finnhub.io/register"
                target="_blank"
                rel="noreferrer"
              >
                finnhub.io/register
              </a>
              . Stored only in this browser.
            </>
          }
        >
          <div className="flex gap-2">
            <input
              className={inputClass}
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your key"
              autoComplete="off"
              spellCheck={false}
            />
            <Button onClick={() => setShowKey((s) => !s)}>{showKey ? 'Hide' : 'Show'}</Button>
          </div>
        </Field>

        <Field
          label="Twelve Data API key (optional, for charts)"
          hint={
            <>
              Free at{' '}
              <a
                className="text-teal-700 underline dark:text-teal-400"
                href="https://twelvedata.com/register"
                target="_blank"
                rel="noreferrer"
              >
                twelvedata.com
              </a>
              . Used only for price history in the Trends chart.
            </>
          }
        >
          <input
            className={inputClass}
            type={showKey ? 'text' : 'password'}
            value={tdKey}
            onChange={(e) => setTdKey(e.target.value)}
            placeholder="Paste your Twelve Data key"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field
          label="Risk-free rate for Sharpe ratio (%)"
          hint="Usually the 3-month Treasury bill yield (about 4.0% in Oct 2026)."
        >
          <input
            className={inputClass}
            type="number"
            inputMode="decimal"
            min="0"
            max="25"
            step="0.05"
            value={riskFree}
            onChange={(e) => setRiskFree(e.target.value)}
          />
        </Field>

        <Field label="Refresh prices every">
          <select className={inputClass} value={refresh} onChange={(e) => setRefresh(e.target.value)}>
            <option value="30">30 seconds</option>
            <option value="60">1 minute</option>
            <option value="300">5 minutes</option>
            <option value="900">15 minutes</option>
          </select>
        </Field>

        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </div>

        <hr className="border-slate-200 dark:border-slate-800" />

        <div>
          <h3 className="text-sm font-medium">Appearance</h3>
          <div
            role="radiogroup"
            aria-label="Appearance"
            className="mt-2 grid grid-cols-4 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700"
          >
            {(
              [
                ['light', 'Light'],
                ['dark', 'Dark'],
                ['black', 'Black'],
                ['system', 'Auto'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={theme === id}
                onClick={() => onTheme(id)}
                className={`rounded-md py-1.5 text-sm font-medium ${theme === id ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Black uses true black backgrounds — easiest on OLED phone screens at night.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-medium">Install as an app</h3>
          <p className="mt-1 text-xs text-slate-500">
            iPhone/iPad: Safari → Share → <strong>Add to Home Screen</strong>. Android/Chrome/Edge: menu →{' '}
            <strong>Install app</strong>. Opens full-screen and shows your last prices even offline.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-medium">Transactions (CSV)</h3>
          <p className="mt-1 text-xs text-slate-500">
            Export <strong>{profile.name}</strong> as a spreadsheet, or import a CSV from your broker (Fidelity, Schwab,
            Robinhood and similar “activity/history” exports) or one exported here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={downloadCsv}>Export CSV</Button>
            <Button onClick={() => csvRef.current?.click()}>Import CSV…</Button>
            <input
              ref={csvRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="Import CSV file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void readCsv(f)
                e.target.value = ''
              }}
            />
          </div>
          {csv && (
            <div
              className="mt-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"
              aria-label="CSV import preview"
            >
              <p className="font-medium">
                Found {csv.book.lots.length} buys, {csv.book.sales.length} sales, {csv.book.dividends.length} dividends
                <span className="font-normal text-slate-500"> · {csv.format}</span>
              </p>
              {csv.skipped.length > 0 && (
                <details className="mt-1 text-xs text-slate-500">
                  <summary className="cursor-pointer">{csv.skipped.length} rows skipped</summary>
                  <ul className="mt-1 max-h-32 overflow-auto">
                    {csv.skipped.slice(0, 50).map((x) => (
                      <li key={x.line}>
                        Line {x.line}: {x.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-2 flex gap-2">
                <Button
                  variant="primary"
                  disabled={csvCount === 0}
                  onClick={() => {
                    onImportBook(csv.book)
                    setMessage({ kind: 'ok', text: `Added ${csvCount} transactions to ${profile.name}.` })
                    setCsv(null)
                  }}
                >
                  Add to {profile.name}
                </Button>
                <Button onClick={() => setCsv(null)}>Cancel</Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Transactions are added to what’s already there — import into an empty profile to avoid duplicates.
              </p>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium">Backup &amp; restore</h3>
          <p className="mt-1 text-xs text-slate-500">
            Save everything to a file so you can restore it if this browser’s data is cleared, or move to another
            device.
          </p>
          <Button className="mt-2" onClick={onOpenBackup}>
            Open backup &amp; restore
          </Button>
          {message && (
            <p role="status" className={`mt-2 text-sm ${message.kind === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {message.text}
            </p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium text-rose-600">Danger zone</h3>
          <div className="mt-2">
            {confirmClear ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">Delete all profiles and purchases?</span>
                <Button
                  variant="danger"
                  onClick={() => {
                    onClearAll()
                    onClose()
                  }}
                >
                  Yes, delete everything
                </Button>
                <Button onClick={() => setConfirmClear(false)}>Cancel</Button>
              </div>
            ) : (
              <Button className="text-rose-600" onClick={() => setConfirmClear(true)}>
                Clear all data
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
