/**
 * V9: the outbox's handling, in isolation, of the exact errors the server returns
 * (messages taken from the harness: 42501 on a finished round, and as anon when the session is gone).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('/home/user/Cardi-Golf/src/lib/supabase.ts', () => ({ supabase: () => ({}), supabaseConfigured: false }))
const reloads: number[] = []
vi.mock('/home/user/Cardi-Golf/src/data/tournamentStore.ts', () => ({
  registerOverlay: () => undefined,
  useTournament: { getState: () => ({ tournamentId: 't1', patch: () => undefined, reload: async () => void reloads.push(Date.now()) }) },
}))

const { _outboxTest, flush, useOutbox, describeSyncError } = await import('/home/user/Cardi-Golf/src/data/outbox.ts')
const { t } = await import('/home/user/Cardi-Golf/src/i18n/es-MX.ts')

const score = (hole: number) =>
  ({ key: `score:r2:p1:${hole}`, kind: 'score' as const, tournamentId: 't1', payload: { round_id: 'r2', player_id: 'p1', hole, strokes: 5, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'now' }, attempts: 0, createdAt: hole })

// Postgres/PostgREST text for 42501 under RLS (harness v9-scores.log, both the insert and the on-conflict-update path).
const RLS = 'new row violates row-level security policy for table "scores"'

describe('V9 outbox classification', () => {
  beforeEach(() => {
    _outboxTest.reset()
    reloads.length = 0
  })

  it('REL-08: a queued hole refused because the round was finished goes to `rejected` with the generic copy, never «not live»', async () => {
    _outboxTest.setPush(async () => {
      throw new Error(RLS)
    })
    for (const h of [16, 17, 18]) await _outboxTest.enqueue(score(h))
    for (let i = 0; i < 5; i++) {
      await flush()
      await new Promise((r) => setTimeout(r, 5))
    }
    const s = useOutbox.getState()
    console.log('REL-08 queue', _outboxTest.queue().length, 'rejected', s.rejected.length, 'messages', JSON.stringify([...new Set(s.rejected.map((r) => r.message))]), 'lastError', JSON.stringify(s.lastError), 'reloads', reloads.length)
    expect(_outboxTest.queue()).toHaveLength(0)
    expect(s.rejected.map((r) => r.key)).toEqual(['score:r2:p1:16', 'score:r2:p1:17', 'score:r2:p1:18'])
    expect(s.rejected[0]!.message).toBe(t.sync.errDenied)
    expect(describeSyncError(RLS)).not.toBe(t.sync.errNotLive)
    expect(describeSyncError(RLS)).not.toBe(t.sync.errSigned)
  })

  it('REL-16: with no session the same upsert is refused the same way, so it is classed permanent (no retry)', async () => {
    let calls = 0
    _outboxTest.setPush(async () => {
      calls++
      throw new Error(RLS) // what PostgREST answers the anon key (harness: anon and an unclaimed session both get 42501)
    })
    await _outboxTest.enqueue(score(16))
    for (let i = 0; i < 5; i++) await flush()
    console.log('REL-16 pushes', calls, 'queue', _outboxTest.queue().length, 'rejected', useOutbox.getState().rejected.length)
    expect(calls).toBe(1)
    expect(useOutbox.getState().rejected).toHaveLength(1)
  })

  it('control: an expired JWT (PostgREST 401 PGRST301) is NOT permanent and stays queued', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('JWT expired')
    })
    await _outboxTest.enqueue(score(17))
    await flush()
    console.log('control queue', _outboxTest.queue().length, 'rejected', useOutbox.getState().rejected.length)
    expect(_outboxTest.queue()).toHaveLength(1)
    expect(useOutbox.getState().rejected).toHaveLength(0)
  })
})
