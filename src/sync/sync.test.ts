import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProfile, defaultState } from '../lib/storage'
import { fakeCloud } from '../test/fakeCloud'
import type { AppState } from '../types'
import { readMeta, SyncEngine } from './engine'
import { reconcile } from './reconcile'

const UID = 'id-me@example.com'
const BASE = defaultState()
const withCash = (cash: number, base: AppState = BASE): AppState => ({
  ...base,
  profiles: base.profiles.map((p, i) => (i === 0 ? { ...p, cash } : p)),
})

describe('reconcile', () => {
  const empty = defaultState()
  const mine = withCash(500)

  it('creates the cloud row from this browser’s data on first sign-in', () => {
    expect(reconcile(null, mine, null)).toEqual({ kind: 'use', state: mine, upload: true, revision: null })
    const p = reconcile(null, null, null)
    expect(p).toMatchObject({ kind: 'use', upload: true, revision: null })
  })

  it('uses the cloud data when this browser has nothing (or the same)', () => {
    const remote = { data: mine, revision: 4 }
    expect(reconcile(remote, empty, null)).toEqual({ kind: 'use', state: mine, upload: false, revision: 4 })
    expect(reconcile(remote, structuredClone(mine), null)).toMatchObject({ kind: 'use', upload: false })
  })

  it('asks when this browser and the cloud have different data', () => {
    const remote = { data: withCash(900), revision: 2 }
    expect(reconcile(remote, mine, null)).toMatchObject({ kind: 'ask', revision: 2 })
  })

  it('after a reload, keeps unsaved edits from this tab or takes newer cloud data', () => {
    const synced = withCash(100)
    const meta = { userId: UID, revision: 3, synced: JSON.stringify(synced) }
    // edited here, cloud unchanged → upload the edits
    expect(reconcile({ data: synced, revision: 3 }, mine, meta)).toEqual({
      kind: 'use',
      state: mine,
      upload: true,
      revision: 3,
    })
    // not edited here, cloud moved on → take the cloud
    expect(reconcile({ data: mine, revision: 5 }, synced, meta)).toMatchObject({ kind: 'use', upload: false })
    // edited here AND cloud moved on → ask
    expect(reconcile({ data: withCash(7), revision: 5 }, mine, meta)).toMatchObject({ kind: 'ask' })
  })
})

describe('SyncEngine', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    sessionStorage.clear()
  })

  const setup = async () => {
    const f = fakeCloud()
    const start = BASE
    await f.cloud.store.save(UID, start, null)
    const engine = new SyncEngine(f.cloud.store, UID, { revision: 1, state: start })
    return { f, engine, start }
  }

  it('saves a second after the last change and skips unchanged state', async () => {
    const { f, engine, start } = await setup()
    engine.save(start)
    expect(engine.status).toBe('saved')
    engine.save(withCash(1))
    engine.save(withCash(2))
    expect(engine.status).toBe('saving')
    await vi.advanceTimersByTimeAsync(1300)
    expect(f.calls.save).toBe(2) // initial row + one debounced save
    expect(f.rows.get(UID)).toMatchObject({ revision: 2, data: withCash(2) })
    expect(engine.status).toBe('saved')
    expect(readMeta(UID)?.revision).toBe(2)
  })

  it('takes the newer cloud data when another device saved first', async () => {
    const { f, engine } = await setup()
    const remote = withCash(777)
    f.remoteWrite(UID, remote)
    const seen: AppState[] = []
    engine.onRemote((s) => seen.push(s))
    engine.save(withCash(5))
    await vi.advanceTimersByTimeAsync(1300)
    expect(seen).toEqual([remote])
    expect(engine.notice).toMatch(/changed on another device/)
    expect(f.rows.get(UID)?.data).toEqual(remote)
    // The app replaces its state with the remote one → no echo save.
    engine.save(remote)
    expect(engine.status).toBe('saved')
  })

  it('pulls newer data (e.g. when the tab becomes visible) only when there are no unsaved edits', async () => {
    const { f, engine } = await setup()
    const seen: AppState[] = []
    engine.onRemote((s) => seen.push(s))
    f.remoteWrite(UID, withCash(42))
    await engine.pull()
    expect(seen).toHaveLength(1)
    await engine.pull()
    expect(seen).toHaveLength(1) // not newer any more
  })

  it('keeps edits and retries when offline', async () => {
    const { f, engine } = await setup()
    f.setFailSaves(true)
    engine.save(withCash(9))
    await vi.advanceTimersByTimeAsync(1300)
    expect(engine.status).toBe('error')
    expect(engine.hasUnsaved).toBe(true)
    f.setFailSaves(false)
    await vi.advanceTimersByTimeAsync(5100)
    expect(engine.status).toBe('saved')
    expect(engine.hasUnsaved).toBe(false)
    expect(f.rows.get(UID)?.data).toEqual(withCash(9))
  })

  it('flush saves immediately (used before signing out)', async () => {
    const { f, engine } = await setup()
    engine.save({ ...BASE, profiles: [...BASE.profiles, createProfile('Roth I')] })
    await engine.flush()
    expect(f.rows.get(UID)?.revision).toBe(2)
    expect(engine.hasUnsaved).toBe(false)
  })
})
