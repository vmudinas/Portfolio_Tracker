import { useState, type FormEvent } from 'react'
import { Button, Field, inputClass } from '../components/ui'
import { createBackup, backupFileName, downloadText } from '../lib/backup'
import type { AppState } from '../types'
import { friendly } from './supabase'
import type { CloudAuth, CloudUser } from './types'

const MIN_PASSWORD = 8
const message = (e: unknown) => friendly(e instanceof Error ? e.message : String(e))

function Alert({ children, ok = false }: { children: string; ok?: boolean }) {
  return (
    <p
      role={ok ? 'status' : 'alert'}
      className={`text-sm ${ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
    >
      {children}
    </p>
  )
}

const LinkButton = ({ onClick, children }: { onClick: () => void; children: string }) => (
  <button
    type="button"
    className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline dark:hover:text-slate-300"
    onClick={onClick}
  >
    {children}
  </button>
)

type Mode = 'login' | 'signup' | 'forgot'

/** Log in / create account / forgot password, all on the home page card. */
export function SignInCard({
  auth,
  onSignedIn,
  notice,
}: {
  auth: CloudAuth
  onSignedIn: (u: CloudUser) => void
  notice?: string | null
}) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(notice ?? null)
  const [busy, setBusy] = useState(false)

  const go = (m: Mode) => {
    setMode(m)
    setError(null)
    setInfo(null)
    setPassword('')
    setConfirm('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.')
    if (mode !== 'forgot' && password.length < MIN_PASSWORD)
      return setError(`Password must be at least ${MIN_PASSWORD} characters.`)
    if (mode === 'signup' && password !== confirm) return setError('The two passwords don’t match.')
    setBusy(true)
    try {
      if (mode === 'login') {
        onSignedIn(await auth.signIn(email, password))
        return
      }
      if (mode === 'signup') {
        const { needsConfirmation } = await auth.signUp(email, password)
        if (needsConfirmation) {
          go('login')
          setInfo('Account created. Check your email and click the confirmation link, then log in here.')
        } else {
          const u = await auth.currentUser()
          if (u) onSignedIn(u)
        }
      } else {
        await auth.sendPasswordReset(email)
        setInfo('If that email has an account, a reset link is on its way. Open it on this device.')
      }
    } catch (err) {
      setError(message(err))
    }
    setBusy(false)
  }

  const title = mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create your account' : 'Reset your password'
  return (
    <form onSubmit={submit} className="space-y-4" aria-label={title}>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {mode === 'signup' && (
          <p className="mt-1 text-sm text-slate-500">
            Your portfolios are saved to your account and sync across devices.
          </p>
        )}
        {mode === 'forgot' && (
          <p className="mt-1 text-sm text-slate-500">We’ll email you a link to choose a new password.</p>
        )}
      </div>
      <Field label="Email">
        <input
          className={inputClass}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
        />
      </Field>
      {mode !== 'forgot' && (
        <Field label="Password" hint={mode === 'signup' ? `At least ${MIN_PASSWORD} characters` : undefined}>
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        </Field>
      )}
      {mode === 'signup' && (
        <Field label="Confirm password">
          <input
            className={inputClass}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
      )}
      {error && <Alert>{error}</Alert>}
      {info && <Alert ok>{info}</Alert>}
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
      </Button>
      <div className="flex flex-wrap justify-between gap-2">
        {mode === 'login' ? (
          <>
            <LinkButton onClick={() => go('signup')}>Create an account</LinkButton>
            <LinkButton onClick={() => go('forgot')}>Forgot your password?</LinkButton>
          </>
        ) : (
          <LinkButton onClick={() => go('login')}>Back to log in</LinkButton>
        )}
      </div>
    </form>
  )
}

/** Shown after opening the password-reset email link. */
export function NewPasswordCard({ auth, onDone }: { auth: CloudAuth; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`)
    if (password !== confirm) return setError('The two passwords don’t match.')
    setBusy(true)
    try {
      await auth.updatePassword(password)
      onDone()
    } catch (err) {
      setError(message(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Choose a new password">
      <h2 className="text-lg font-semibold">Choose a new password</h2>
      <Field label="New password" hint={`At least ${MIN_PASSWORD} characters`}>
        <input
          className={inputClass}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          autoFocus
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
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Saving…' : 'Save password'}
      </Button>
    </form>
  )
}

const summary = (s: AppState) => {
  const tx = s.profiles.reduce((n, p) => n + p.lots.length + p.sales.length + p.dividends.length, 0)
  return `${s.profiles.length} fund${s.profiles.length === 1 ? '' : 's'}, ${tx} transaction${tx === 1 ? '' : 's'}`
}

/** This browser and the cloud both have (different) data: let the user pick which to keep. */
export function ChoiceCard({
  local,
  remote,
  onChoose,
}: {
  local: AppState
  remote: AppState
  onChoose: (which: 'local' | 'remote') => void
}) {
  return (
    <div className="space-y-4" role="group" aria-label="Choose data">
      <h2 className="text-lg font-semibold">Which data should we keep?</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        This browser has portfolio data that’s different from what’s saved in your account.
      </p>
      <div className="space-y-2">
        <Button variant="primary" className="w-full justify-between" onClick={() => onChoose('remote')}>
          <span>Use my account’s data</span>
          <span className="text-xs opacity-80">{summary(remote)}</span>
        </Button>
        <Button className="w-full justify-between" onClick={() => onChoose('local')}>
          <span>Use this browser’s data (replaces the account’s)</span>
          <span className="text-xs opacity-80">{summary(local)}</span>
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Not sure?{' '}
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => downloadText(createBackup(local), 'application/json', backupFileName())}
        >
          Download this browser’s data as a backup
        </button>{' '}
        first — you can restore it later from Backup.
      </p>
    </div>
  )
}
