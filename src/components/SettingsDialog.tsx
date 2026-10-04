import { useRef, useState } from 'react'
import { exportState, parseState } from '../lib/storage'
import type { AppState, Settings } from '../types'
import { Button, Field, inputClass, Modal } from './ui'

interface Props {
  state: AppState
  onSave: (settings: Partial<Settings>) => void
  onImport: (state: AppState) => void
  onClearAll: () => void
  onClose: () => void
}

export function SettingsDialog({ state, onSave, onImport, onClearAll, onClose }: Props) {
  const [apiKey, setApiKey] = useState(state.settings.finnhubApiKey ?? '')
  const [tdKey, setTdKey] = useState(state.settings.twelveDataApiKey ?? '')
  const [showKey, setShowKey] = useState(false)
  const [refresh, setRefresh] = useState(String(state.settings.refreshSeconds))
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = () => {
    onSave({
      finnhubApiKey: apiKey.trim() || undefined,
      twelveDataApiKey: tdKey.trim() || undefined,
      refreshSeconds: Number(refresh),
    })
    onClose()
  }

  const download = () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `portfolio-tracker-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importFile = async (file: File) => {
    try {
      const parsed = parseState(JSON.parse(await file.text()))
      if (!parsed) throw new Error('bad file')
      // Keep this browser's API keys; backups never contain them.
      onImport({
        ...parsed,
        settings: {
          ...parsed.settings,
          finnhubApiKey: state.settings.finnhubApiKey,
          twelveDataApiKey: state.settings.twelveDataApiKey,
        },
      })
      setMessage({ kind: 'ok', text: `Imported ${parsed.profiles.length} profile(s).` })
    } catch {
      setMessage({ kind: 'error', text: 'That file is not a Portfolio Tracker backup.' })
    }
  }

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
          <h3 className="text-sm font-medium">Backup</h3>
          <p className="mt-1 text-xs text-slate-500">
            Your data lives only in this browser. Export a file to back it up or move it to another device.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={download}>Export JSON</Button>
            <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Import backup file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importFile(f)
                e.target.value = ''
              }}
            />
          </div>
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
