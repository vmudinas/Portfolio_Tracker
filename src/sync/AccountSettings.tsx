import { useState, type FormEvent } from 'react'
import { Button, Field, inputClass } from '../components/ui'
import { friendly } from './supabase'
import { useSync } from './SyncContext'

/** Settings section in cloud mode: who is signed in, change password, sign out. */
export function AccountSettings() {
  const sync = useSync()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (!sync) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (password.length < 8) return setMsg({ ok: false, text: 'Password must be at least 8 characters.' })
    if (password !== confirm) return setMsg({ ok: false, text: 'The two passwords don’t match.' })
    setBusy(true)
    try {
      await sync.auth.updatePassword(password)
      setOpen(false)
      setPassword('')
      setConfirm('')
      setMsg({ ok: true, text: 'Password changed.' })
    } catch (err) {
      setMsg({ ok: false, text: friendly(err instanceof Error ? err.message : String(err)) })
    }
    setBusy(false)
  }

  return (
    <section className="border-b border-slate-200 pb-5 dark:border-slate-800">
      <h3 className="text-sm font-medium">Account</h3>
      <p className="mt-1 text-xs text-slate-500">
        Signed in as <strong>{sync.user.email}</strong>. Your portfolios, settings and API keys are saved to your
        account and sync across devices. You’re signed out after 15 minutes without activity or when you close the tab.
      </p>
      {msg && (
        <p
          role="status"
          className={`mt-2 text-xs ${msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
        >
          {msg.text}
        </p>
      )}
      {open ? (
        <form onSubmit={submit} className="mt-3 space-y-3" aria-label="Change password">
          <Field label="New password" hint="At least 8 characters">
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              className={inputClass}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save password'}
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button
            onClick={() => {
              setMsg(null)
              setOpen(true)
            }}
          >
            Change password
          </Button>
          <Button onClick={() => void sync.signOut()}>Sign out</Button>
        </div>
      )}
    </section>
  )
}
