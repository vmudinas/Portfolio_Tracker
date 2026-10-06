/** The signed-in Supabase user. */
export interface CloudUser {
  id: string
  email: string
}

export type AuthEvent = 'signed-in' | 'signed-out' | 'password-recovery'

/** Email + password auth (Supabase Auth in production, a fake in tests). */
export interface CloudAuth {
  currentUser(): Promise<CloudUser | null>
  /** Called on sign-in/out and when the user arrives from a password-reset email. */
  onChange(cb: (event: AuthEvent, user: CloudUser | null) => void): () => void
  signIn(email: string, password: string): Promise<CloudUser>
  /** Returns needsConfirmation = true when the project requires email confirmation first. */
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>
  sendPasswordReset(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  signOut(): Promise<void>
}

export interface StoredRow {
  data: unknown
  revision: number
}

export type SaveResult = { status: 'ok'; revision: number } | { status: 'conflict' }

/** One row per user holding the whole app state (Supabase table `portfolio_state`). */
export interface CloudStore {
  load(userId: string): Promise<StoredRow | null>
  /** expectedRevision null = create the row. Fails with 'conflict' if someone else saved first. */
  save(userId: string, data: unknown, expectedRevision: number | null): Promise<SaveResult>
}

export interface Cloud {
  auth: CloudAuth
  store: CloudStore
}

export type SyncStatus = 'saved' | 'saving' | 'offline' | 'error'
