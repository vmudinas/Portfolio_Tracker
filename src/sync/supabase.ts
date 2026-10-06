import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Cloud, CloudUser } from './types'

const TABLE = 'portfolio_state'

const toUser = (u: User | null | undefined): CloudUser | null => (u ? { id: u.id, email: u.email ?? '' } : null)

/** Plain-English versions of the Supabase auth errors people actually hit. */
export function friendly(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Wrong email or password.'
  if (m.includes('email not confirmed')) return 'Please confirm your email first — check your inbox for the link.'
  if (m.includes('already registered')) return 'That email already has an account. Log in instead.'
  if (m.includes('signups not allowed') || m.includes('signup is disabled'))
    return 'New sign-ups are turned off for this site.'
  if (m.includes('rate limit')) return 'Too many attempts. Please wait a few minutes and try again.'
  if (m.includes('password should be')) return 'Password must be at least 8 characters.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Can’t reach the server. Check your connection.'
  return message
}

/**
 * Supabase-backed auth + storage. The session lives in sessionStorage, so closing the tab signs out.
 * supabase-js is loaded only when this is called (after the login page is shown).
 */
export async function createSupabaseCloud(url: string, key: string): Promise<Cloud> {
  const { createClient } = await import('@supabase/supabase-js')
  const client: SupabaseClient = createClient(url, key, {
    auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(friendly(e.message))
  }

  return {
    auth: {
      async currentUser() {
        const { data } = await client.auth.getSession()
        return toUser(data.session?.user)
      },
      onChange(cb) {
        const { data } = client.auth.onAuthStateChange((event, session) => {
          const user = toUser(session?.user)
          if (event === 'PASSWORD_RECOVERY') cb('password-recovery', user)
          else if (event === 'SIGNED_OUT') cb('signed-out', null)
          else if (event === 'SIGNED_IN' && user) cb('signed-in', user)
        })
        return () => data.subscription.unsubscribe()
      },
      async signIn(email, password) {
        const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password })
        fail(error)
        return toUser(data.user)!
      },
      async signUp(email, password) {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectTo },
        })
        fail(error)
        return { needsConfirmation: !data.session }
      },
      async sendPasswordReset(email) {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo })
        fail(error)
      },
      async updatePassword(password) {
        const { error } = await client.auth.updateUser({ password })
        fail(error)
      },
      async signOut() {
        await client.auth.signOut()
      },
    },
    store: {
      async load(userId) {
        const { data, error } = await client.from(TABLE).select('data, revision').eq('user_id', userId).maybeSingle()
        fail(error)
        return data ? { data: data.data, revision: Number(data.revision) } : null
      },
      async save(userId, data, expectedRevision) {
        if (expectedRevision === null) {
          const { data: row, error } = await client
            .from(TABLE)
            .insert({ user_id: userId, data, revision: 1 })
            .select('revision')
            .single()
          if (error?.code === '23505') return { status: 'conflict' }
          fail(error)
          return { status: 'ok', revision: Number(row!.revision) }
        }
        const { data: rows, error } = await client
          .from(TABLE)
          .update({ data, revision: expectedRevision + 1, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('revision', expectedRevision)
          .select('revision')
        fail(error)
        return rows && rows.length ? { status: 'ok', revision: Number(rows[0].revision) } : { status: 'conflict' }
      },
    },
  }
}
