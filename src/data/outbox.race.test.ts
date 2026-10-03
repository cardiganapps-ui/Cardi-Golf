/**
 * ARCH-01: a correction to the same hole made while its first save is still
 * in flight (a quick fix, or «Deshacer») was dropped when that first push
 * landed, failed or was refused, while the chip said «Sincronizado». These
 * run the real outbox on IndexedDB (fake-indexeddb) with a controllable push.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('./tournamentStore', () => ({
  registerOverlay: () => undefined,
  liveSeq: () => 0,
  useTournament: { getState: () => ({ tournamentId: 't1', patch: () => undefined, refresh: () => undefined, landChanges: () => undefined, reload: async () => undefined }) },
}))

const { _outboxTest, flush, useOutbox } = await import('./outbox')
const { useAuth } = await import('./auth')
// A phone that entered with its PIN: its writes carry who wrote them (unconfirmed ones wait, see outbox.identity.test).
useAuth.setState({ user: { id: 'uid-phone' } as never })

const hole5 = (strokes: number) => ({
  key: 'score:r1:p1:5',
  kind: 'score' as const,
  tournamentId: 't1',
  payload: { round_id: 'r1', player_id: 'p1', hole: 5, strokes, putts: 2, picked_up: false, entered_by: 'p1', client_ts: String(strokes) },
  attempts: 0,
  createdAt: Date.now(),
})
const strokesOf = (item: { payload: unknown }) => (item.payload as { strokes: number }).strokes
const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * A push whose first call waits for `release`, then succeeds or throws
 * `firstError`. `inFlight` resolves once that first push has started.
 */
function gatedPush(server: number[], firstError?: Error) {
  let release!: () => void
  let started!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const inFlight = new Promise<void>((r) => (started = r))
  let first = true
  _outboxTest.setPush(async (item) => {
    if (first) {
      first = false
      started()
      await gate
      if (firstError) throw firstError
    }
    server.push(strokesOf(item))
  })
  return { release: () => release(), inFlight }
}

describe('outbox: a newer write to the same hole is never lost', () => {
  beforeEach(async () => {
    _outboxTest.reset()
    await _outboxTest.clearStored()
  })

  it('pushes the correction after the first save lands', async () => {
    const server: number[] = []
    const { release, inFlight } = gatedPush(server)
    const saving = _outboxTest.enqueue(hole5(5))
    await inFlight
    await _outboxTest.enqueue(hole5(6))
    release()
    await saving
    await flush()
    await tick()
    expect(server).toEqual([5, 6])
    expect(_outboxTest.queue()).toEqual([])
    expect(await _outboxTest.stored()).toEqual([])
  })

  it('keeps the correction when the first save fails on the network', async () => {
    const server: number[] = []
    const { release, inFlight } = gatedPush(server, new Error('TypeError: Failed to fetch'))
    const saving = _outboxTest.enqueue(hole5(5))
    await inFlight
    await _outboxTest.enqueue(hole5(6))
    release()
    await saving
    await tick()
    // The failed old version must not overwrite the queued correction.
    expect(_outboxTest.queue().map(strokesOf)).toEqual([6])
    expect((await _outboxTest.stored()).map(strokesOf)).toEqual([6])
    _outboxTest.reset()
    await _outboxTest.load()
    await flush()
    expect(server).toEqual([6])
  })

  it('does not record a refusal of a version the player already replaced', async () => {
    const server: number[] = []
    const { release, inFlight } = gatedPush(server, new Error('new row violates row-level security policy for table "scores"'))
    const saving = _outboxTest.enqueue(hole5(5))
    await inFlight
    await _outboxTest.enqueue(hole5(6))
    release()
    await saving
    await flush()
    await tick()
    expect(useOutbox.getState().rejected).toEqual([])
    expect(server).toEqual([6])
    expect(_outboxTest.queue()).toEqual([])
  })

  it('restarts from IndexedDB with only the newest version of each hole', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('TypeError: Failed to fetch')
    })
    await _outboxTest.enqueue(hole5(5))
    await _outboxTest.enqueue(hole5(6))
    await _outboxTest.enqueue({ ...hole5(4), key: 'score:r1:p1:6', payload: { ...hole5(4).payload, hole: 6 } })
    _outboxTest.reset()
    await _outboxTest.load()
    const q = _outboxTest.queue()
    expect(q.map((x) => [x.key, strokesOf(x)])).toEqual([
      ['score:r1:p1:5', 6],
      ['score:r1:p1:6', 4],
    ])
    expect(q[0]!.seq).toBeLessThan(q[1]!.seq)
  })

  it('treats a request timeout as a network error and retries', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('RequestTimeout: Sin respuesta del servidor en 12 s')
    })
    await _outboxTest.enqueue(hole5(5))
    await flush()
    expect(_outboxTest.queue()).toHaveLength(1)
    expect(_outboxTest.queue()[0]!.attempts).toBeGreaterThan(0)
    expect(useOutbox.getState().rejected).toEqual([])
  })
})
