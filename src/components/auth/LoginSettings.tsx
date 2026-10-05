import { useState, type FormEvent } from 'react'
import { checkLogin, readCredentials, saveCredentials, validPin, validUsername } from '../../lib/auth'
import { Button, Field, inputClass } from '../ui'

/** Settings section: change the username and/or PIN (needs the current PIN). */
export function LoginSettings() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [username, setUsername] = useState(() => readCredentials()?.username ?? '')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    const creds = readCredentials()
    if (!creds) return
    if (!validUsername(username)) return setMsg({ ok: false, text: 'Username must be 2–32 letters or numbers.' })
    if (pin && !validPin(pin)) return setMsg({ ok: false, text: 'New PIN must be 4–12 digits.' })
    if (pin !== confirm) return setMsg({ ok: false, text: 'The new PINs don’t match.' })
    setBusy(true)
    const ok = await checkLogin(creds, creds.username, current)
    if (!ok) {
      setBusy(false)
      return setMsg({ ok: false, text: 'Current PIN is wrong.' })
    }
    await saveCredentials(username, pin || current)
    setBusy(false)
    setCurrent('')
    setPin('')
    setConfirm('')
    setOpen(false)
    setMsg({ ok: true, text: 'Login updated.' })
  }

  if (!readCredentials()) return null

  const pinInput = (value: string, set: (v: string) => void, ac: string) => (
    <input
      className={inputClass}
      type="password"
      inputMode="numeric"
      maxLength={12}
      value={value}
      onChange={(e) => set(e.target.value.replace(/\D/g, ''))}
      autoComplete={ac}
    />
  )

  return (
    <section className="border-b border-slate-200 pb-5 dark:border-slate-800">
      <h3 className="text-sm font-medium">Login</h3>
      <p className="mt-1 text-xs text-slate-500">
        Signed in as <strong>{readCredentials()?.username}</strong>. The app locks after 15 minutes without activity or
        when you close the tab.
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
        <form onSubmit={submit} className="mt-3 space-y-3" aria-label="Change login">
          <Field label="Current PIN">{pinInput(current, setCurrent, 'current-password')}</Field>
          <Field label="Username">
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
            />
          </Field>
          <Field label="New PIN" hint="Leave empty to keep the current PIN">
            {pinInput(pin, setPin, 'new-password')}
          </Field>
          <Field label="Confirm new PIN">{pinInput(confirm, setConfirm, 'new-password')}</Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy || !current}>
              {busy ? 'Saving…' : 'Save login'}
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button
          className="mt-2"
          onClick={() => {
            setMsg(null)
            setOpen(true)
          }}
        >
          Change username or PIN
        </Button>
      )}
    </section>
  )
}
