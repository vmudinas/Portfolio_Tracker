import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_KEY,
  checkLogin,
  IDLE_LOCK_MS,
  lockoutRemaining,
  readCredentials,
  recordFailure,
  saveCredentials,
  SESSION_KEY,
} from '../../lib/auth'
import { AuthGate } from './AuthGate'

const PIN = '482913'

const Secret = ({ lock }: { lock: () => void }) => (
  <div>
    <p>Secret portfolio</p>
    <button onClick={lock}>Lock</button>
  </div>
)
const renderGate = () => render(<AuthGate>{(lock) => <Secret lock={lock} />}</AuthGate>)

afterEach(() => {
  sessionStorage.clear()
  vi.useRealTimers()
})

describe('auth storage', () => {
  it('stores only a salted hash and checks username + PIN', async () => {
    const c = await saveCredentials('admin', PIN)
    const raw = localStorage.getItem(AUTH_KEY)!
    expect(raw).not.toContain(PIN)
    expect(readCredentials()).toEqual(c)
    expect(await checkLogin(c, 'admin', PIN)).toBe(true)
    expect(await checkLogin(c, ' Admin ', PIN)).toBe(true)
    expect(await checkLogin(c, 'admin', '000000')).toBe(false)
    expect(await checkLogin(c, 'root', PIN)).toBe(false)
    // Same PIN, different salt → different hash.
    const again = await saveCredentials('admin', PIN)
    expect(again.hash).not.toBe(c.hash)
  })

  it('rejects bad usernames and PINs', async () => {
    await expect(saveCredentials('a', PIN)).rejects.toThrow()
    await expect(saveCredentials('admin', '12a4')).rejects.toThrow()
    await expect(saveCredentials('admin', '123')).rejects.toThrow()
  })

  it('throttles after 5 wrong attempts', () => {
    for (let i = 0; i < 5; i++) expect(recordFailure(0)).toBe(0)
    expect(recordFailure(0)).toBe(30_000)
    expect(lockoutRemaining(10_000)).toBe(20_000)
    expect(recordFailure(40_000)).toBe(60_000)
  })
})

describe('AuthGate', () => {
  it('asks to create a login first (username defaults to admin), then opens the app', async () => {
    const user = userEvent.setup()
    renderGate()
    expect(screen.queryByText('Secret portfolio')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveValue('admin')
    await user.type(screen.getByLabelText(/^PIN/), PIN)
    await user.type(screen.getByLabelText('Confirm PIN'), '111111')
    await user.click(screen.getByRole('button', { name: 'Create login' }))
    expect(screen.getByRole('alert')).toHaveTextContent('don’t match')
    await user.clear(screen.getByLabelText('Confirm PIN'))
    await user.type(screen.getByLabelText('Confirm PIN'), PIN)
    await user.click(screen.getByRole('button', { name: 'Create login' }))
    expect(await screen.findByText('Secret portfolio')).toBeInTheDocument()
    expect(readCredentials()?.username).toBe('admin')
  })

  it('keeps the app hidden until the right username and PIN are entered', async () => {
    await saveCredentials('admin', PIN)
    const user = userEvent.setup()
    renderGate()
    expect(screen.getByRole('form', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveValue('')

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('PIN'), '000000')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or PIN')
    expect(screen.queryByText('Secret portfolio')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('PIN'), PIN)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Secret portfolio')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lock' }))
    expect(screen.getByRole('form', { name: 'Log in' })).toBeInTheDocument()
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('stays unlocked on reload within the idle window, and locks after 15 idle minutes', async () => {
    await saveCredentials('admin', PIN)
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(1_000_000)
    sessionStorage.setItem(SESSION_KEY, String(Date.now() - 60_000))
    renderGate()
    expect(screen.getByText('Secret portfolio')).toBeInTheDocument()
    act(() => {
      vi.setSystemTime(Date.now() + IDLE_LOCK_MS + 1000)
      vi.advanceTimersByTime(15_000)
    })
    await waitFor(() => expect(screen.queryByText('Secret portfolio')).not.toBeInTheDocument())
    expect(screen.getByRole('form', { name: 'Log in' })).toBeInTheDocument()
  })

  it('can erase everything and start over when the PIN is forgotten', async () => {
    await saveCredentials('admin', PIN)
    localStorage.setItem('portfolio-tracker:v1', '{"profiles":[]}')
    localStorage.setItem('portfolio-tracker:theme', 'dark')
    const user = userEvent.setup()
    renderGate()
    await user.click(screen.getByRole('button', { name: 'Forgot your PIN?' }))
    const erase = screen.getByRole('button', { name: 'Erase and start over' })
    expect(erase).toBeDisabled()
    await user.type(screen.getByLabelText('Type ERASE to confirm'), 'ERASE')
    await user.click(erase)
    expect(screen.getByRole('form', { name: 'Create login' })).toBeInTheDocument()
    expect(localStorage.getItem('portfolio-tracker:v1')).toBeNull()
    expect(localStorage.getItem(AUTH_KEY)).toBeNull()
    expect(localStorage.getItem('portfolio-tracker:theme')).toBe('dark')
  })
})
