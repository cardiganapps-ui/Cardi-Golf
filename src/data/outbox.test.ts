/**
 * Outbox retry policy (§2 "syncs later without losing anything"): a network
 * error keeps the item queued with backoff; a permanent rejection moves it to
 * the rejected list instead of dropping it; items queued during a flush are
 * pushed right after it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('./tournamentStore', () => ({
  registerOverlay: () => undefined,
  liveSeq: () => 0,
  liveChangesSince: () => [],
  useTournament: { getState: () => ({ tournamentId: 't1', patch: () => undefined, refresh: () => undefined, land: () => undefined, reload: async () => undefined }) },
}))

const { _outboxTest, flush, useOutbox, discardRejected, retryRejected } = await import('./outbox')
const { useAuth } = await import('./auth')
// A phone that entered with its PIN: its writes carry who wrote them (unconfirmed ones wait, see outbox.identity.test).
useAuth.setState({ user: { id: 'uid-phone' } as never })

const score = (hole: number, tournamentId = 't1') =>
  ({ key: `score:r1:p1:${hole}`, kind: 'score' as const, tournamentId, payload: { round_id: 'r1', player_id: 'p1', hole, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'now' }, attempts: 0, createdAt: hole })

describe('outbox', () => {
  beforeEach(() => {
    _outboxTest.reset()
    vi.useRealTimers()
  })

  it('keeps an item queued after a network error, never drops it', async () => {
    let calls = 0
    _outboxTest.setPush(async () => {
      calls++
      throw new Error('Failed to fetch')
    })
    await _outboxTest.enqueue(score(1))
    for (let i = 0; i < 30; i++) await flush()
    expect(_outboxTest.queue()).toHaveLength(1)
    expect(_outboxTest.queue()[0]!.attempts).toBeGreaterThan(0)
    expect(useOutbox.getState().pending).toBe(1)
    expect(useOutbox.getState().lastError).toBe('Sin conexión con el servidor. Se reintenta solo.')
    expect(calls).toBeGreaterThan(0)
  })

  it('moves a permanent rejection to the rejected list', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('new row violates row-level security policy for table "scores"')
    })
    await _outboxTest.enqueue(score(2))
    await flush()
    expect(_outboxTest.queue()).toHaveLength(0)
    expect(useOutbox.getState().rejected).toHaveLength(1)
    expect(useOutbox.getState().rejected[0]!.key).toBe('score:r1:p1:2')
    await discardRejected('score:r1:p1:2')
    expect(useOutbox.getState().rejected).toHaveLength(0)
  })

  it('re-enqueues a rejected item on retry', async () => {
    let ok = false
    _outboxTest.setPush(async () => {
      if (!ok) throw new Error('permission denied for table scores')
    })
    await _outboxTest.enqueue(score(3))
    await flush()
    expect(useOutbox.getState().rejected).toHaveLength(1)
    ok = true
    await retryRejected('score:r1:p1:3')
    await flush()
    expect(useOutbox.getState().rejected).toHaveLength(0)
    expect(_outboxTest.queue()).toHaveLength(0)
  })

  it('pushes items queued during a flush right after it', async () => {
    const pushed: number[] = []
    let first = true
    _outboxTest.setPush(async (item) => {
      if (first) {
        first = false
        await _outboxTest.enqueue(score(5))
      }
      pushed.push((item.payload as { hole: number }).hole)
    })
    await _outboxTest.enqueue(score(4))
    await flush()
    await new Promise((r) => setTimeout(r, 0))
    expect(pushed).toEqual([4, 5])
    expect(_outboxTest.queue()).toHaveLength(0)
  })

  it('counts only the open tournament', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('Failed to fetch')
    })
    await _outboxTest.enqueue(score(6, 'other'))
    await _outboxTest.enqueue(score(7))
    expect(useOutbox.getState().pending).toBe(1)
  })
})
