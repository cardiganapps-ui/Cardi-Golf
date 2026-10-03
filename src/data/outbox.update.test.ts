/**
 * PWA-03 part 1: the outbox across builds.
 * - Below `app_flags.minBuild` nothing is pushed; writes stay on the phone and
 *   go out once the block lifts (the updated app).
 * - After a rollback the phone may hold a database written by a newer build:
 *   it must still open, send what this build understands, and leave the rest
 *   untouched (not pushed somewhere wrong, not rejected) for the newer build.
 */
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth', () => ({ useAuth: { getState: () => ({ user: { id: 'uid-a' } }) } }))
vi.mock('../lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('./tournamentStore', () => ({
  registerOverlay: () => undefined,
  liveSeq: () => 0,
  liveChangesSince: () => [],
  useTournament: { getState: () => ({ tournamentId: 't1', patch: () => undefined, refresh: () => undefined, land: () => undefined, reload: async () => undefined }) },
}))

const { _outboxTest, flush, setOutboxBlocked, useOutbox } = await import('./outbox')

const score = (hole: number) => ({
  key: `score:r1:p1:${hole}`,
  kind: 'score' as const,
  tournamentId: 't1',
  payload: { round_id: 'r1', player_id: 'p1', hole, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' },
  attempts: 0,
  createdAt: Date.now(),
})

describe('outbox and the minimum build', () => {
  beforeEach(async () => {
    _outboxTest.reset()
    await _outboxTest.clearStored()
  })

  it('holds every write while the build is too old, then sends them all', async () => {
    const pushed: string[] = []
    _outboxTest.setPush(async (item) => void pushed.push(item.key))
    setOutboxBlocked(true)
    expect(useOutbox.getState().blocked).toBe(true)
    await _outboxTest.enqueue(score(1))
    await _outboxTest.enqueue(score(2))
    await flush()
    expect(pushed).toEqual([])
    expect((await _outboxTest.stored()).map((x) => x.key).sort()).toEqual(['score:r1:p1:1', 'score:r1:p1:2'])
    expect(useOutbox.getState().rejected).toEqual([])

    setOutboxBlocked(false)
    await flush()
    expect(pushed).toEqual(['score:r1:p1:1', 'score:r1:p1:2'])
    expect(await _outboxTest.stored()).toEqual([])
  })
})

describe('outbox opened by an older build', () => {
  it('opens a newer database, sends what it knows, and leaves the rest for the newer build', async () => {
    _outboxTest.reset()
    await _outboxTest.clearStored()
    // What a future build might leave behind: one more version and table, and a kind this build does not know.
    const newer = new Dexie('cardi-golf-outbox')
    newer.version(1).stores({ items: 'key, tournamentId, createdAt' })
    newer.version(2).stores({ items: 'key, tournamentId, createdAt', rejected: 'key, tournamentId, at' })
    newer.version(3).stores({ items: 'key, tournamentId, createdAt', rejected: 'key, tournamentId, at' })
    newer.version(4).stores({ items: 'key, tournamentId, createdAt, mutationId', rejected: 'key, tournamentId, at', mutations: 'id' })
    await newer.open()
    await newer.table('items').bulkPut([
      { ...score(7), seq: 1, actingUid: 'uid-a' },
      { key: 'hole:r1:g1:8', kind: 'hole', tournamentId: 't1', payload: { round_id: 'r1', hole: 8, entries: [] }, attempts: 0, createdAt: 2, seq: 2, actingUid: 'uid-a', mutationId: 'm1' },
    ])
    newer.close()

    const pushed: string[] = []
    _outboxTest.setPush(async (item) => void pushed.push(item.key))
    await _outboxTest.load()
    expect(useOutbox.getState().foreign).toBe(1)
    await flush()
    expect(pushed).toEqual(['score:r1:p1:7'])
    expect(useOutbox.getState().rejected).toEqual([])
    expect((await _outboxTest.stored()).map((x) => x.key)).toEqual(['hole:r1:g1:8'])
  })
})
