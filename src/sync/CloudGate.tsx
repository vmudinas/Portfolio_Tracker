import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { HomeLayout } from '../components/auth/HomeLayout'
import { Button } from '../components/ui'
import { endSession, sessionActive, touchSession } from '../lib/auth'
import { clearSessionState, readStoredState, removeLegacyLocalState, saveState, setStateStorage } from '../lib/storage'
import type { AppState } from '../types'
import { ChoiceCard, NewPasswordCard, SignInCard } from './CloudForms'
import { clearMeta, clearStash, readAnyMeta, readMeta, readStash, stashUnsaved, SyncEngine } from './engine'
import { reconcile } from './reconcile'
import { SyncContext, type SyncSession } from './SyncContext'
import type { Cloud, CloudUser } from './types'

const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

type Phase =
  | { kind: 'loading' }
  | { kind: 'signed-out'; notice?: string }
  | { kind: 'recovery' }
  | { kind: 'syncing'; user: CloudUser }
  | { kind: 'ask'; user: CloudUser; local: AppState; remote: AppState; revision: number }
  | { kind: 'error'; user: CloudUser; message: string }
  | { kind: 'ready'; session: SyncSession }

/**
 * Supabase mode: email + password login in front of the whole app, then loads the user's data from
 * the cloud and keeps it in sync. The local copy lives in sessionStorage only (gone when the tab
 * closes); signing out — or 15 minutes without activity — clears it.
 */
export function CloudGate({
  loadCloud,
  children,
}: {
  loadCloud: () => Promise<Cloud>
  children: (signOut: () => void) => ReactNode
}) {
  const [cloud, setCloud] = useState<Cloud | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [phase, setPhaseState] = useState<Phase>({ kind: 'loading' })
  const phaseRef = useRef<Phase>(phase)
  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhaseState(p)
  }, [])
  const engineRef = useRef<SyncEngine | null>(null)
  /** User whose data is being loaded / shown — stops a double start (form + auth event). */
  const startedFor = useRef<string | null>(null)
  // Arriving from an email link (confirm sign-up / reset password): Supabase signs in from the URL.
  const [fromEmail] = useState(() => {
    const h = typeof window === 'undefined' ? '' : window.location.hash
    return { link: /access_token=/.test(h), recovery: /type=recovery/.test(h) }
  })

  const finishSignOut = useCallback(
    (notice?: string) => {
      engineRef.current?.dispose()
      engineRef.current = null
      startedFor.current = null
      endSession()
      setPhase({ kind: 'signed-out', notice })
    },
    [setPhase],
  )

  const signOut = useCallback(
    async (c: Cloud, notice?: string) => {
      const engine = engineRef.current
      if (engine) await engine.flush()
      // Edits that couldn't be saved (e.g. offline) are kept for this user only, so they upload on
      // their next login in this tab. The shared working copy is always wiped.
      const meta = engine ? readMeta(engine.userId) : readAnyMeta()
      const tab = readStoredState('session')
      const unsaved = engine ? engine.hasUnsaved : !!(tab && meta && JSON.stringify(tab) !== meta.synced)
      if (unsaved && tab && meta) stashUnsaved(meta.userId, { state: tab, meta })
      clearSessionState()
      clearMeta()
      finishSignOut(notice)
      await c.auth.signOut().catch(() => {})
    },
    [finishSignOut],
  )

  const open = useCallback(
    (c: Cloud, user: CloudUser, state: AppState, revision: number) => {
      saveState(state)
      removeLegacyLocalState()
      clearStash(user.id)
      engineRef.current?.dispose()
      const engine = new SyncEngine(c.store, user.id, { revision, state })
      engineRef.current = engine
      touchSession()
      setPhase({ kind: 'ready', session: { engine, user, auth: c.auth, signOut: () => signOut(c) } })
    },
    [signOut, setPhase],
  )

  const upload = useCallback(
    async (c: Cloud, user: CloudUser, state: AppState, expected: number | null): Promise<number | null> => {
      const res = await c.store.save(user.id, state, expected)
      return res.status === 'ok' ? res.revision : null
    },
    [],
  )

  const start = useCallback(
    async (c: Cloud, user: CloudUser, again = false) => {
      if (startedFor.current === user.id && !again) return
      startedFor.current = user.id
      setPhase({ kind: 'syncing', user })
      setStateStorage('session')
      try {
        // Retry a couple of times if another device saves between our load and upload.
        for (let attempt = 0; attempt < 3; attempt++) {
          const remote = await c.store.load(user.id)
          // Only this user's own edits from this tab count — never another account's leftovers.
          const stash = readStash(user.id)
          const meta = readMeta(user.id)
          const tab = readStoredState('session')
          const mine = stash ?? (tab && meta ? { state: tab, meta } : null)
          if (tab && !meta) {
            clearSessionState()
            clearMeta()
          }
          const local = mine?.state ?? readStoredState('local')
          const plan = reconcile(remote, local, mine?.meta ?? null)
          if (plan.kind === 'ask') {
            setPhase({ kind: 'ask', user, local: plan.local, remote: plan.remote, revision: plan.revision })
            return
          }
          let revision = plan.revision ?? 0
          if (plan.upload) {
            const saved = await upload(c, user, plan.state, plan.revision)
            if (saved === null) continue
            revision = saved
          }
          open(c, user, plan.state, revision)
          return
        }
        throw new Error('Your data keeps changing on another device. Please try again.')
      } catch (e) {
        setPhase({ kind: 'error', user, message: e instanceof Error ? e.message : String(e) })
      }
    },
    [open, upload, setPhase],
  )

  // Connect to Supabase and pick up an existing session (e.g. after a reload).
  useEffect(() => {
    let unsub = () => {}
    let cancelled = false
    loadCloud()
      .then(async (c) => {
        if (cancelled) return
        setCloud(c)
        unsub = c.auth.onChange((event, user) => {
          const kind = phaseRef.current.kind
          if (event === 'password-recovery') setPhase({ kind: 'recovery' })
          else if (event === 'signed-out' && kind !== 'signed-out') finishSignOut()
          else if (
            event === 'signed-in' &&
            user &&
            !fromEmail.recovery &&
            (kind === 'loading' || kind === 'signed-out')
          )
            void start(c, user)
        })
        const user = await c.auth.currentUser()
        if (cancelled || phaseRef.current.kind !== 'loading') return
        if (user && fromEmail.recovery) setPhase({ kind: 'recovery' })
        else if (user && (sessionActive() || fromEmail.link)) void start(c, user)
        else {
          if (user) await signOut(c) // idle too long while the tab was closed/asleep
          setPhase({ kind: 'signed-out' })
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
      unsub()
    }
  }, [loadCloud, start, signOut, finishSignOut, setPhase, fromEmail])

  // While signed in: idle lock, retry when back online, pick up changes from other devices.
  const ready = phase.kind === 'ready' ? phase.session : null
  useEffect(() => {
    if (!ready || !cloud) return
    let last = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - last < 5000) return
      last = now
      touchSession(now)
    }
    const check = () => {
      if (!sessionActive()) void signOut(cloud, 'You were signed out after 15 minutes without activity.')
    }
    const onVisible = () => {
      check()
      if (document.visibilityState === 'visible') void ready.engine.pull()
    }
    const onOnline = () => ready.engine.retryNow()
    const onUnload = (e: BeforeUnloadEvent) => {
      if (ready.engine.hasUnsaved) {
        void ready.engine.flush()
        e.preventDefault()
      }
    }
    ACTIVITY.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('beforeunload', onUnload)
    const id = window.setInterval(check, 15_000)
    return () => {
      ACTIVITY.forEach((e) => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('beforeunload', onUnload)
      window.clearInterval(id)
    }
  }, [ready, cloud, signOut])

  const notice = phase.kind === 'signed-out' ? phase.notice : undefined
  if (ready) return <SyncContext.Provider value={ready}>{children(() => void ready.signOut())}</SyncContext.Provider>

  const footnote = 'Saved to your account and synced across your devices'
  if (loadError)
    return (
      <HomeLayout footnote={footnote}>
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          Couldn’t load the sign-in service: {loadError}
        </p>
      </HomeLayout>
    )
  if (!cloud || phase.kind === 'loading' || phase.kind === 'syncing')
    return (
      <HomeLayout footnote={footnote}>
        <p className="py-8 text-center text-sm text-slate-500" role="status">
          {phase.kind === 'syncing' ? 'Loading your portfolios…' : 'Loading…'}
        </p>
      </HomeLayout>
    )
  return (
    <HomeLayout footnote={footnote}>
      {phase.kind === 'recovery' ? (
        <NewPasswordCard
          auth={cloud.auth}
          onDone={async () => {
            const u = await cloud.auth.currentUser()
            if (u) void start(cloud, u, true)
            else setPhase({ kind: 'signed-out', notice: 'Password updated. Log in with your new password.' })
          }}
        />
      ) : phase.kind === 'ask' ? (
        <ChoiceCard
          local={phase.local}
          remote={phase.remote}
          onChoose={async (which) => {
            const { user, local, remote, revision } = phase
            if (which === 'remote') return open(cloud, user, remote, revision)
            setPhase({ kind: 'syncing', user })
            try {
              const saved = await upload(cloud, user, local, revision)
              if (saved === null) return start(cloud, user, true)
              open(cloud, user, local, saved)
            } catch (e) {
              setPhase({ kind: 'error', user, message: e instanceof Error ? e.message : String(e) })
            }
          }}
        />
      ) : phase.kind === 'error' ? (
        <div className="space-y-4">
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            Couldn’t load your data: {phase.message}
          </p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void start(cloud, phase.user, true)}>
              Try again
            </Button>
            <Button onClick={() => void signOut(cloud)}>Sign out</Button>
          </div>
        </div>
      ) : (
        <SignInCard key={notice ?? ''} auth={cloud.auth} notice={notice} onSignedIn={(u) => void start(cloud, u)} />
      )}
    </HomeLayout>
  )
}
