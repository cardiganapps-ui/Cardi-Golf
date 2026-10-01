// @vitest-environment happy-dom
/**
 * Signing out on a shared phone (the verifier of #87, P3): the boards saved
 * on the phone and «Tu último torneo» stayed, so the next person on it saw
 * the previous one's boards and role until the server answered, and for good
 * with no signal. They go with the session now; and never while a write is
 * still on the phone, for any tournament (the check counted only the
 * tournament open on screen).
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ signOuts: 0 }))
vi.mock('../lib/supabase', () => ({
  supabaseConfigured: true,
  authSettings: async () => null,
  supabase: () => ({
    auth: {
      signOut: async () => {
        auth.signOuts++
        return { error: null }
      },
    },
  }),
}))
vi.mock('./tournamentStore', () => ({
  registerOverlay: () => undefined,
  useTournament: { getState: () => ({ tournamentId: 't-open', patch: () => undefined, reload: async () => undefined }) },
}))

const { signOutSafely } = await import('./account')
const { _outboxTest } = await import('./outbox')
const { getLastTournament, setLastTournament } = await import('./session')
const { readCached, saveEntry, saveSnapshot } = await import('./snapshotCache')
const { getFixture } = await import('../dev/fixtures')

const fx = getFixture('minimal4-live')!
const { slug, id, name } = fx.snapshot.tournament

beforeEach(async () => {
  auth.signOuts = 0
  _outboxTest.reset()
  await _outboxTest.clearStored()
  _outboxTest.setPush(async () => {
    throw new Error('TypeError: Failed to fetch')
  })
  await saveEntry({ slug, tournamentId: id, lookup: fx.lookup, me: fx.me })
  await saveSnapshot(id, fx.snapshot)
  setLastTournament({ slug, name })
})

describe('signing out of a shared phone', () => {
  it('takes the boards saved on the phone and «Tu último torneo» with the session', async () => {
    expect(await signOutSafely()).toBe(true)
    expect(auth.signOuts).toBe(1)
    expect(await readCached(slug)).toBeNull()
    expect(getLastTournament()).toBeNull()
  })

  it('never while a write is still on the phone, for any tournament, and then nothing goes', async () => {
    // A hole of another tournament than the one open on screen, still waiting for signal.
    await _outboxTest.enqueue({
      key: 'score:r9:p1:4',
      kind: 'score',
      tournamentId: 't-otro',
      payload: { round_id: 'r9', player_id: 'p1', hole: 4, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' },
      attempts: 0,
      createdAt: 1,
    })
    expect(await signOutSafely()).toBe(false)
    expect(auth.signOuts).toBe(0)
    expect(await readCached(slug)).not.toBeNull()
    expect(getLastTournament()).toEqual({ slug, name })
  })
})
