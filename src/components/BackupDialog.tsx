import { useRef, useState } from 'react'
import {
  backupFileName,
  createBackup,
  downloadText,
  hasBackupData,
  mergeKeys,
  readBackup,
  type ParsedBackup,
} from '../lib/backup'
import type { Theme } from '../hooks/useTheme'
import type { AppState } from '../types'
import { Button, Modal } from './ui'

interface Props {
  state: AppState
  theme: Theme
  lastBackupAt: string | null
  changedSinceBackup: boolean
  persisted: boolean | null
  onBackedUp: () => void
  onRestore: (state: AppState, theme: Theme | null) => void
  onClose: () => void
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never')

/** Download a full backup file, or restore everything from one. */
export function BackupDialog(props: Props) {
  const { state } = props
  const [includeKeys, setIncludeKeys] = useState(false)
  const [preview, setPreview] = useState<ParsedBackup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const download = () => {
    downloadText(createBackup(state, { includeKeys, theme: props.theme }), 'application/json', backupFileName())
    props.onBackedUp()
    setDone('Backup downloaded. Keep the file somewhere safe — e.g. iCloud Drive, Google Drive or Dropbox.')
  }

  const pick = async (file: File) => {
    setError(null)
    setDone(null)
    const parsed = readBackup(await file.text())
    if (!parsed) {
      setPreview(null)
      setError('That file isn’t a Portfolio Tracker backup (expected the .json file from “Download backup”).')
      return
    }
    setPreview(parsed)
  }

  const restore = () => {
    if (!preview) return
    props.onRestore(mergeKeys(preview.state, state), preview.theme)
    setDone(`Restored ${preview.summary.profiles} profile(s) and ${preview.summary.transactions} transactions.`)
    setPreview(null)
  }

  const s = preview?.summary
  const current = state.profiles.reduce((n, p) => n + p.lots.length + p.sales.length + p.dividends.length, 0)

  return (
    <Modal title="Backup & restore" onClose={props.onClose}>
      <div className="space-y-5 text-sm">
        <p className="text-slate-600 dark:text-slate-400">
          Your portfolio is stored only in this browser. Clearing browsing data, using a different browser or a new
          device starts empty — keep a backup file so you can restore everything in one step.
        </p>

        <section className="space-y-2" aria-label="Download backup">
          <h3 className="font-medium">Back up</h3>
          <p className="text-xs text-slate-500">
            Last backup: <strong>{when(props.lastBackupAt)}</strong>
            {props.changedSinceBackup && props.lastBackupAt && ' · changes since then'}
          </p>
          <p className="text-xs text-slate-500">
            Includes all profiles, purchases, sales, dividends, cash, watchlists, alerts and settings.
          </p>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={includeKeys}
              onChange={(e) => setIncludeKeys(e.target.checked)}
            />
            <span>
              Include my API keys{' '}
              <span className="text-slate-500">(handy for a full restore — but anyone with the file can use them)</span>
            </span>
          </label>
          <Button variant="primary" onClick={download}>
            ⤓ Download backup
          </Button>
        </section>

        <hr className="border-slate-200 dark:border-slate-800" />

        <section className="space-y-2" aria-label="Restore from backup">
          <h3 className="font-medium">Restore</h3>
          <p className="text-xs text-slate-500">
            Choose a backup file. You’ll see what’s in it before anything changes.
          </p>
          <Button onClick={() => fileRef.current?.click()}>Choose backup file…</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Backup file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void pick(f)
              e.target.value = ''
            }}
          />
          {error && (
            <p role="alert" className="text-rose-600">
              {error}
            </p>
          )}
          {s && (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700" aria-label="Backup contents">
              <p className="font-medium">
                Backup from {s.exportedAt ? new Date(s.exportedAt).toLocaleString() : 'an unknown date'}
              </p>
              <ul className="mt-1 list-inside list-disc text-xs text-slate-600 dark:text-slate-400">
                <li>
                  {s.profiles} profile(s): {preview!.state.profiles.map((p) => p.name).join(', ')}
                </li>
                <li>{s.transactions} transactions</li>
                <li>
                  {s.watchlist} watchlist symbols · {s.alerts} alerts
                </li>
                <li>{s.hasKeys ? 'Includes API keys' : 'No API keys (this browser’s keys are kept)'}</li>
              </ul>
              {hasBackupData(state.profiles) && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  This replaces everything currently in this browser ({current} transactions, plus cash, watchlists and
                  alerts).
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button variant="primary" onClick={restore}>
                  Restore this backup
                </Button>
                <Button onClick={() => setPreview(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </section>

        {done && (
          <p role="status" className="text-emerald-600">
            {done}
          </p>
        )}

        {props.persisted !== null && (
          <p className="text-xs text-slate-500">
            {props.persisted
              ? '✓ This browser has agreed to keep the site’s data (it won’t be cleared automatically to free space). Clearing browsing data yourself still removes it.'
              : 'This browser may clear the site’s data when space runs low — keep a recent backup.'}
          </p>
        )}
      </div>
    </Modal>
  )
}
