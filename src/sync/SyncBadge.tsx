import { useSync, useSyncStatus } from './SyncContext'

const LABEL = {
  saved: { text: 'Saved', title: 'All changes are saved to your account', dot: 'bg-emerald-500' },
  saving: { text: 'Saving…', title: 'Saving your changes to your account', dot: 'bg-amber-400' },
  offline: { text: 'Offline', title: 'No connection — changes will sync when you’re back online', dot: 'bg-slate-400' },
  error: { text: 'Not saved', title: 'Couldn’t reach your account — retrying automatically', dot: 'bg-rose-500' },
} as const

/** Small "Saved / Saving… / Offline" pill for the header (nothing when not signed in to the cloud). */
export function SyncBadge() {
  const s = useSyncStatus()
  const sync = useSync()
  if (!s || !sync) return null
  const l = LABEL[s.status]
  return (
    <span
      role="status"
      title={`${l.title} (${sync.user.email})`}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${l.dot}`} />
      {l.text}
    </span>
  )
}

/** Banner for sync messages that need the user's attention. */
export function SyncNotice() {
  const s = useSyncStatus()
  const sync = useSync()
  if (!s?.notice || !sync) return null
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <span>{s.notice}</span>
      <button
        type="button"
        className="text-xs font-medium underline"
        onClick={() => sync.engine.dismissNotice()}
        aria-label="Dismiss"
      >
        Dismiss
      </button>
    </div>
  )
}
