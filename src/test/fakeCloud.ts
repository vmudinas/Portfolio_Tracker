import type { AuthEvent, Cloud, CloudUser, SaveResult, StoredRow } from '../sync/types'

/** In-memory stand-in for Supabase auth + the portfolio_state table. */
export function fakeCloud(accounts: Record<string, string> = {}) {
  const rows = new Map<string, StoredRow>()
  const listeners = new Set<(e: AuthEvent, u: CloudUser | null) => void>()
  let current: CloudUser | null = null
  const users = new Map(Object.entries(accounts).map(([email, pw]) => [email, { pw, id: `id-${email}` }]))
  const calls = { save: 0, load: 0 }
  let failSaves = false

  const cloud: Cloud = {
    auth: {
      currentUser: async () => current,
      onChange(cb) {
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
      async signIn(email, password) {
        const u = users.get(email.trim())
        if (!u || u.pw !== password) throw new Error('Invalid login credentials')
        current = { id: u.id, email }
        listeners.forEach((l) => l('signed-in', current))
        return current
      },
      async signUp(email, password) {
        if (users.has(email)) throw new Error('User already registered')
        users.set(email, { pw: password, id: `id-${email}` })
        return { needsConfirmation: true }
      },
      async sendPasswordReset() {},
      async updatePassword(password) {
        const u = current && users.get(current.email)
        if (u) u.pw = password
      },
      async signOut() {
        current = null
        listeners.forEach((l) => l('signed-out', null))
      },
    },
    store: {
      async load(userId) {
        calls.load++
        const r = rows.get(userId)
        return r ? structuredClone(r) : null
      },
      async save(userId, data, expected): Promise<SaveResult> {
        calls.save++
        if (failSaves) throw new TypeError('Failed to fetch')
        const r = rows.get(userId)
        if (expected === null) {
          if (r) return { status: 'conflict' }
          rows.set(userId, { data: structuredClone(data), revision: 1 })
          return { status: 'ok', revision: 1 }
        }
        if (!r || r.revision !== expected) return { status: 'conflict' }
        rows.set(userId, { data: structuredClone(data), revision: expected + 1 })
        return { status: 'ok', revision: expected + 1 }
      },
    },
  }
  return {
    cloud,
    rows,
    calls,
    setFailSaves: (v: boolean) => (failSaves = v),
    /** Simulate another device saving. */
    remoteWrite(userId: string, data: unknown) {
      const r = rows.get(userId)
      rows.set(userId, { data, revision: (r?.revision ?? 0) + 1 })
    },
  }
}
