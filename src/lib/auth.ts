/**
 * Local login (username + PIN) that gates the app in this browser.
 *
 * Only a salted PBKDF2 hash of the PIN is stored — never the PIN itself, and nothing is in the
 * source code. This is a lock screen for a client-only app: it keeps the app closed to anyone who
 * doesn't know the login, but the portfolio data itself stays unencrypted in this browser's storage.
 */

export const AUTH_KEY = 'portfolio-tracker:auth'
export const SESSION_KEY = 'portfolio-tracker:session'
const ATTEMPTS_KEY = 'portfolio-tracker:login-attempts'

export const DEFAULT_USERNAME = 'admin'
export const IDLE_LOCK_MS = 15 * 60_000
const ITERATIONS = 210_000
const FREE_ATTEMPTS = 5
const BASE_DELAY_MS = 30_000

export interface Credentials {
  username: string
  salt: string
  hash: string
  iterations: number
}

const enc = new TextEncoder()
const toB64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const normalizeUser = (u: string) => u.trim().toLowerCase()

export const validUsername = (u: string) => /^[\p{L}\p{N}._-]{2,32}$/u.test(u.trim())
export const validPin = (p: string) => /^\d{4,12}$/.test(p)

async function derive(username: string, pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(`${normalizeUser(username)}\n${pin}`), 'PBKDF2', false, [
    'deriveBits',
  ])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
}

export function readCredentials(): Credentials | null {
  try {
    const c = JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null') as Partial<Credentials> | null
    if (!c || typeof c.username !== 'string' || typeof c.salt !== 'string' || typeof c.hash !== 'string') return null
    return { username: c.username, salt: c.salt, hash: c.hash, iterations: Number(c.iterations) || ITERATIONS }
  } catch {
    return null
  }
}

export async function saveCredentials(username: string, pin: string): Promise<Credentials> {
  if (!validUsername(username)) throw new Error('Username must be 2–32 letters, numbers, dots, dashes or underscores.')
  if (!validPin(pin)) throw new Error('PIN must be 4–12 digits.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const creds: Credentials = {
    username: username.trim(),
    salt: toB64(salt),
    hash: toB64(await derive(username, pin, salt, ITERATIONS)),
    iterations: ITERATIONS,
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(creds))
  return creds
}

/** Constant-time comparison of the derived hash. */
export async function checkLogin(creds: Credentials, username: string, pin: string): Promise<boolean> {
  const got = new Uint8Array(await derive(username, pin, fromB64(creds.salt), creds.iterations))
  const want = fromB64(creds.hash)
  let diff = got.length ^ want.length
  for (let i = 0; i < want.length; i++) diff |= got[i] ^ want[i]
  return diff === 0 && normalizeUser(username) === normalizeUser(creds.username)
}

// ---- Failed-attempt throttling (5 free tries, then 30 s, 60 s, 120 s… between tries)

interface Attempts {
  count: number
  until: number
}

function readAttempts(): Attempts {
  try {
    const a = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? '{}') as Partial<Attempts>
    return { count: Number(a.count) || 0, until: Number(a.until) || 0 }
  } catch {
    return { count: 0, until: 0 }
  }
}

/** Milliseconds until another attempt is allowed (0 = now). */
export function lockoutRemaining(now = Date.now()): number {
  return Math.max(0, readAttempts().until - now)
}

export function recordFailure(now = Date.now()): number {
  const a = readAttempts()
  const count = a.count + 1
  const over = count - FREE_ATTEMPTS
  const until = over > 0 ? now + BASE_DELAY_MS * 2 ** Math.min(over - 1, 6) : 0
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify({ count, until }))
  return Math.max(0, until - now)
}

export function clearFailures() {
  localStorage.removeItem(ATTEMPTS_KEY)
}

// ---- Session: lives in sessionStorage, so closing the tab logs out; also expires after idle time.

export function sessionActive(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(SESSION_KEY))
    return last > 0 && now - last < IDLE_LOCK_MS
  } catch {
    return false
  }
}

export function touchSession(now = Date.now()) {
  try {
    sessionStorage.setItem(SESSION_KEY, String(now))
  } catch {
    /* ignore */
  }
}

export function endSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}
