/**
 * The Tarjeta's save is on the phone before anything waits (PERF-10, and the
 * hole it lost). The card moves on in the tap's frame, and the boards take the
 * save once that frame is on screen (`settle`), so their recompute never holds
 * it back. The write itself waited for the frame too: an app closed or put
 * away inside it kept nothing (the stack suite's lapsed-session test lost its
 * hole 2 on main, 2026-10-13). Now the hole, the contest winners and the snake
 * answer go into IndexedDB and this tab's queue at the call; the counts, the
 * other tabs, the boards' recompute and the push wait for `settle`.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ refreshes: 0 }))
vi.mock('./auth', () => ({ useAuth: { getState: () => ({ user: { id: 'uid-a' } }) } }))
vi.mock('../lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('./tournamentStore', () => ({
  serverReadSince: () => null,
  registerOverlay: () => undefined,
  liveSeq: () => 0,
  liveClock: () => Date.now(),
  useTournament: {
    getState: () => ({
      tournamentId: 't1',
      patch: () => undefined,
      refresh: () => void store.refreshes++,
      landChanges: () => undefined,
      pushesDone: () => undefined,
      reload: async () => undefined,
    }),
  },
}))

const { _outboxTest, enqueueAward, enqueueHole, enqueueTiebreak, useOutbox, OutboxStorageError } = await import('./outbox')

const hole = (n: number) => ({ round_id: 'r1', hole: n, entered_by: 'p1', entries: [{ player_id: 'p1', fields: { strokes: 5 }, base: {} }] })
let pushes = 0

beforeEach(async () => {
  _outboxTest.reset()
  _outboxTest.setLocks(null)
  await _outboxTest.clearStored()
  vi.restoreAllMocks()
  store.refreshes = 0
  pushes = 0
  // No signal: each push is counted, and the write stays queued.
  _outboxTest.setPush(async () => {
    pushes++
    throw new Error('TypeError: Failed to fetch')
  })
})

/** A frame that has not been drawn yet: the test draws it. */
function frame() {
  let draw!: () => void
  const drawn = new Promise<void>((resolve) => (draw = resolve))
  return { drawn, draw }
}
const storedKinds = async () => (await _outboxTest.stored()).map((x) => x.kind).sort()

describe('a save is on the phone before the frame it waits for', () => {
  it('the hole is in IndexedDB and the queue with the frame still to come; the counts, the boards and the push follow the frame', async () => {
    const f = frame()
    const saving = enqueueHole('t1', hole(4), f.drawn)
    await vi.waitFor(async () => expect(await storedKinds()).toEqual(['hole']))
    expect(_outboxTest.queue().map((x) => x.kind)).toEqual(['hole'])
    // Nothing else moved yet: no count on screen, no recompute, nothing sent.
    expect(useOutbox.getState().pendingHoles).toBe(0)
    expect(store.refreshes).toBe(0)
    expect(pushes).toBe(0)

    f.draw()
    await saving
    expect(useOutbox.getState().pendingHoles).toBe(1)
    expect(store.refreshes).toBe(1)
    await vi.waitFor(() => expect(pushes).toBeGreaterThan(0))
  })

  it('so are the contest winners and the snake answer saved with it', async () => {
    const f = frame()
    const saving = Promise.all([
      enqueueHole('t1', hole(7), f.drawn),
      enqueueAward('t1', { round_id: 'r1', group_id: 'g1', hole: 7, game_id: 'closest', player_ids: ['p1'], decided_by: 'p1' }, f.drawn),
      enqueueTiebreak('t1', { round_id: 'r1', group_id: 'g1', hole: 7, last_holed_player_id: 'p2', decided_by: 'p1' }, f.drawn),
    ])
    await vi.waitFor(async () => expect(await storedKinds()).toEqual(['award', 'hole', 'tiebreak']))
    expect(store.refreshes).toBe(0)
    f.draw()
    await saving
    expect(useOutbox.getState().pending).toBe(3)
  })

  it('an app closed before the frame keeps the hole: opened again, it is in the queue', async () => {
    const f = frame()
    void enqueueHole('t1', hole(2), f.drawn)
    await vi.waitFor(async () => expect(await storedKinds()).toEqual(['hole']))
    // The frame never comes: the app is gone. Opened again, the queue is read from IndexedDB.
    _outboxTest.reset()
    await _outboxTest.load()
    expect(_outboxTest.queue().map((x) => (x.payload as { hole: number }).hole)).toEqual([2])
  })

  it('a hole the phone refuses says so at once, without waiting for the frame', async () => {
    vi.spyOn(_outboxTest.db()!.items, 'put').mockRejectedValue(new DOMException('quota', 'QuotaExceededError'))
    const never = new Promise<void>(() => undefined)
    await expect(enqueueHole('t1', hole(5), never)).rejects.toBeInstanceOf(OutboxStorageError)
    expect(_outboxTest.queue()).toEqual([])
  })
})
