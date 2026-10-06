import { useState, type FormEvent } from 'react'
import {
  checkLogin,
  clearFailures,
  DEFAULT_USERNAME,
  lockoutRemaining,
  recordFailure,
  saveCredentials,
  validPin,
  validUsername,
  type Credentials,
} from '../../lib/auth'
import { Button, Field, inputClass } from '../ui'
import { HomeLayout } from './HomeLayout'

interface Props {
  /** null → first visit: create the login. */
  credentials: Credentials | null
  onSignedIn: (c: Credentials) => void
  onReset: () => void
}

export function HomePage({ credentials, onSignedIn, onReset }: Props) {
  return (
    <HomeLayout>
      {credentials ? (
        <LoginForm credentials={credentials} onSignedIn={onSignedIn} onReset={onReset} />
      ) : (
        <SetupForm onSignedIn={onSignedIn} />
      )}
    </HomeLayout>
  )
}

function SetupForm({ onSignedIn }: { onSignedIn: (c: Credentials) => void }) {
  const [username, setUsername] = useState(DEFAULT_USERNAME)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validUsername(username))
      return setError('Username must be 2–32 letters, numbers, dots, dashes or underscores.')
    if (!validPin(pin)) return setError('PIN must be 4–12 digits.')
    if (pin !== confirm) return setError('The two PINs don’t match.')
    setBusy(true)
    try {
      onSignedIn(await saveCredentials(username, pin))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the login.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Create login">
      <div>
        <h2 className="text-lg font-semibold">Create your login</h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose a username and PIN for this browser. You’ll need them every time you open the app.
        </p>
      </div>
      <Field label="Username">
        <input
          className={inputClass}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <Field label="PIN" hint="4–12 digits">
        <PinInput value={pin} onChange={setPin} autoComplete="new-password" />
      </Field>
      <Field label="Confirm PIN">
        <PinInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Saving…' : 'Create login'}
      </Button>
      <p className="text-xs text-slate-500">
        The PIN is stored only as a salted hash in this browser. It can’t be recovered, so keep it somewhere safe.
      </p>
    </form>
  )
}

function LoginForm({ credentials, onSignedIn, onReset }: Props & { credentials: Credentials }) {
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const wait = lockoutRemaining()
    if (wait > 0) return setError(`Too many attempts. Try again in ${Math.ceil(wait / 1000)} seconds.`)
    setBusy(true)
    const ok = await checkLogin(credentials, username, pin)
    setBusy(false)
    if (ok) {
      clearFailures()
      onSignedIn(credentials)
      return
    }
    const next = recordFailure()
    setPin('')
    setError(
      next > 0
        ? `Wrong username or PIN. Too many attempts — try again in ${Math.ceil(next / 1000)} seconds.`
        : 'Wrong username or PIN.',
    )
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4" aria-label="Log in">
        <h2 className="text-lg font-semibold">Log in</h2>
        <Field label="Username">
          <input
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
          />
        </Field>
        <Field label="PIN">
          <PinInput value={pin} onChange={setPin} autoComplete="current-password" />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !username || !pin}>
          {busy ? 'Checking…' : 'Log in'}
        </Button>
      </form>
      {forgot ? (
        <ResetPanel onReset={onReset} onCancel={() => setForgot(false)} />
      ) : (
        <button
          type="button"
          className="text-xs text-slate-500 underline-offset-2 hover:underline"
          onClick={() => setForgot(true)}
        >
          Forgot your PIN?
        </button>
      )}
    </div>
  )
}

/** The PIN can't be recovered: the only way back in is to erase this browser's data and restore a backup. */
function ResetPanel({ onReset, onCancel }: { onReset: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState('')
  const erase = () => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith('portfolio-tracker:') && k !== 'portfolio-tracker:theme') localStorage.removeItem(k)
    onReset()
  }
  return (
    <div className="space-y-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm dark:border-rose-800 dark:bg-rose-950/40">
      <p>
        The PIN can’t be recovered. You can erase <strong>all portfolio data in this browser</strong> and the login,
        then create a new login and restore your data from a backup file.
      </p>
      <Field label="Type ERASE to confirm">
        <input className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button variant="danger" disabled={typed !== 'ERASE'} onClick={erase}>
          Erase and start over
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function PinInput({
  value,
  onChange,
  autoComplete,
}: {
  value: string
  onChange: (v: string) => void
  autoComplete: string
}) {
  return (
    <input
      className={`${inputClass} tracking-widest`}
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={12}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      autoComplete={autoComplete}
    />
  )
}
