import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultState, setStateStorage, STORAGE_KEY } from '../lib/storage'
import { useAppState } from '../state/useAppState'
import { fakeCloud } from '../test/fakeCloud'
import type { AppState } from '../types'
import { CloudGate } from './CloudGate'
import { SyncBadge } from './SyncBadge'

const EMAIL = 'me@example.com'
const PW = 'correct-horse'
const UID = `id-${EMAIL}`

const withCash = (cash: number): AppState => {
  const s = defaultState()
  return { ...s, profiles: [{ ...s.profiles[0], cash }] }
}

function TestApp({ signOut }: { signOut: () => void }) {
  const [state, dispatch] = useAppState()
  const cash = state.profiles[0].cash
  return (
    <div>
      <p>Cash: {cash}</p>
      <SyncBadge />
      <button onClick={() => dispatch({ type: 'cash/set', cash: cash + 100 })}>Add cash</button>
      <button onClick={signOut}>Sign out</button>
    </div>
  )
}

const renderGate = (f: ReturnType<typeof fakeCloud>) =>
  render(<CloudGate loadCloud={async () => f.cloud}>{(signOut) => <TestApp signOut={signOut} />}</CloudGate>)

async function logIn(user: ReturnType<typeof userEvent.setup>, pw = PW) {
  await user.type(await screen.findByLabelText('Email'), EMAIL)
  await user.type(screen.getByLabelText('Password'), pw)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
}

afterEach(() => {
  setStateStorage('local')
})

describe('CloudGate', () => {
  it('shows only the login page until signed in, and rejects a wrong password', async () => {
    const f = fakeCloud({ [EMAIL]: PW })
    const user = userEvent.setup()
    renderGate(f)
    await logIn(user, 'wrong-password')
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
    expect(screen.queryByText(/Cash:/)).not.toBeInTheDocument()
  })

  it('moves this browser’s existing data into the account on first sign-in, then syncs edits', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withCash(250)))
    const f = fakeCloud({ [EMAIL]: PW })
    const user = userEvent.setup()
    renderGate(f)
    await logIn(user)
    expect(await screen.findByText('Cash: 250')).toBeInTheDocument()
    expect(f.rows.get(UID)).toMatchObject({ revision: 1 })
    // The old copy in localStorage is gone; the working copy is per tab now.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Add cash' }))
    await waitFor(() => expect(f.rows.get(UID)?.revision).toBe(2), { timeout: 3000 })
    expect((f.rows.get(UID)!.data as AppState).profiles[0].cash).toBe(350)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('form', { name: 'Log in' })).toBeInTheDocument()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('never shows or uploads one account’s unsaved edits under another account', async () => {
    const OTHER = 'other@example.com'
    const f = fakeCloud({ [EMAIL]: PW, [OTHER]: PW })
    const user = userEvent.setup()
    renderGate(f)
    await logIn(user)
    expect(await screen.findByText('Cash: 0')).toBeInTheDocument()
    // Edit while saving fails (offline), then sign out: the edit is kept for this account only.
    f.setFailSaves(true)
    await user.click(screen.getByRole('button', { name: 'Add cash' }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('form', { name: 'Log in' })).toBeInTheDocument()
    f.setFailSaves(false)

    // A different account signs in on the same tab: starts clean, the first account's data isn't used.
    await user.type(screen.getByLabelText('Email'), OTHER)
    await user.type(screen.getByLabelText('Password'), PW)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Cash: 0')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Choose data' })).not.toBeInTheDocument()
    expect((f.rows.get(`id-${OTHER}`)!.data as AppState).profiles[0].cash).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    // The first account gets its unsaved edit back and uploaded.
    await logIn(user)
    expect(await screen.findByText('Cash: 100')).toBeInTheDocument()
    expect((f.rows.get(UID)!.data as AppState).profiles[0].cash).toBe(100)
  })

  it('loads the account’s data on a new device', async () => {
    const f = fakeCloud({ [EMAIL]: PW })
    f.rows.set(UID, { data: withCash(1234), revision: 7 })
    const user = userEvent.setup()
    renderGate(f)
    await logIn(user)
    expect(await screen.findByText('Cash: 1234')).toBeInTheDocument()
    expect(f.calls.save).toBe(0)
  })

  it('asks which data to keep when this browser and the account differ', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withCash(5)))
    const f = fakeCloud({ [EMAIL]: PW })
    f.rows.set(UID, { data: withCash(900), revision: 3 })
    const user = userEvent.setup()
    renderGate(f)
    await logIn(user)
    await user.click(await screen.findByRole('button', { name: /Use this browser’s data/ }))
    expect(await screen.findByText('Cash: 5')).toBeInTheDocument()
    expect(f.rows.get(UID)).toMatchObject({ revision: 4 })
  })

  it('creates an account (with email confirmation) and resets a forgotten password', async () => {
    const f = fakeCloud()
    const user = userEvent.setup()
    renderGate(f)
    await user.click(await screen.findByRole('button', { name: 'Create an account' }))
    await user.type(screen.getByLabelText('Email'), EMAIL)
    await user.type(screen.getByLabelText(/^Password/), 'short')
    await user.type(screen.getByLabelText('Confirm password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters')
    await user.clear(screen.getByLabelText(/^Password/))
    await user.clear(screen.getByLabelText('Confirm password'))
    await user.type(screen.getByLabelText(/^Password/), PW)
    await user.type(screen.getByLabelText('Confirm password'), PW)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Check your email')

    await user.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    expect(screen.getByLabelText('Email')).toHaveValue(EMAIL) // carried over from the previous form
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('reset link')
  })
})
