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

type OutboxItem = import('./outbox').OutboxItem
const hole = (n: number, strokes = 5) => ({ round_id: 'r1', hole: n, entered_by: 'p1', entries: [{ player_id: 'p1', fields: { strokes }, base: {} }] })
/** The row another phone saved for p1 on hole `n`: a real value, so meeting it is a question for this phone. */
const theirs = (n: number) => ({ id: `s${n}`, round_id: 'r1', player_id: 'p1', hole: n, strokes: 7, putts: 2, picked_up: false, entered_by: 'p3', updated_at: new Date().toISOString(), version: 1 })
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

describe('a hole’s first save is one write, committed before the page takes its reply (PR 155’s verifier)', () => {
  /** Per kind stored: when its transaction was told to commit, and when the page took the put's reply. */
  function watchCommits() {
    const events = new Map<IDBTransaction, { kind: string; seen: string[] }>()
    const of = (tx: IDBTransaction) => events.get(tx) ?? events.set(tx, { kind: '', seen: [] }).get(tx)!
    const put = IDBObjectStore.prototype.put
    const commit = IDBTransaction.prototype.commit
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      const req = put.apply(this, args)
      if (this.name === 'items') {
        of(req.transaction!).kind = (args[0] as { kind: string }).kind
        req.addEventListener('success', () => of(req.transaction!).seen.push('reply'))
      }
      return req
    })
    vi.spyOn(IDBTransaction.prototype, 'commit').mockImplementation(function (this: IDBTransaction) {
      if (this.objectStoreNames.contains('items') && !of(this).seen.includes('commit')) of(this).seen.push('commit')
      commit.call(this);
    })
    return () => Object.fromEntries([...events.values()].filter((e) => e.kind).map((e) => [e.kind, e.seen]))
  }

  it('the hole reads nothing first and is committed before its reply; its snake answer and winners read first', async () => {
    const d = _outboxTest.db()!
    const where = vi.spyOn(d.items, 'where')
    const writes = watchCommits()
    const f = frame()
    const saving = Promise.all([
      enqueueHole('t1', hole(6), f.drawn),
      enqueueAward('t1', { round_id: 'r1', group_id: 'g1', hole: 6, game_id: 'closest', player_ids: ['p1'], decided_by: 'p1' }, f.drawn),
      enqueueTiebreak('t1', { round_id: 'r1', group_id: 'g1', hole: 6, last_holed_player_id: 'p2', decided_by: 'p1' }, f.drawn),
    ])
    await vi.waitFor(async () => expect(await storedKinds()).toEqual(['award', 'hole', 'tiebreak']))
    // The hole goes under its own key, so there is nothing to merge or keep: no read of the queue.
    expect(where).not.toHaveBeenCalled()
    // Under a shared key, the read keeps another tab's newer version (outbox.storage.test.ts): those commit by themselves, after the reply.
    expect(writes()).toEqual({ hole: ['commit', 'reply'], award: ['reply'], tiebreak: ['reply'] })
    f.draw()
    await saving
  })

  it('a transaction that cannot commit early still stores the hole, and the save is never refused for it', async () => {
    vi.spyOn(IDBTransaction.prototype, 'commit').mockImplementation(() => {
      throw new DOMException('The transaction has finished.', 'InvalidStateError')
    })
    await enqueueHole('t1', hole(8))
    expect(await storedKinds()).toEqual(['hole'])
    expect(_outboxTest.queue().map((x) => x.kind)).toEqual(['hole'])
  })
})

describe('what waits for the frame never undoes what happened meanwhile (PR 155’s verifier)', () => {
  it('a question this save met while its frame was still to come stays: the flush under way sent it, the server asked', async () => {
    let answerFirst!: () => void
    const first = new Promise<void>((resolve) => (answerFirst = resolve))
    const pushed: number[] = []
    _outboxTest.setPush(async (item: OutboxItem) => {
      if (item.kind !== 'hole') return []
      pushed.push(item.payload.hole)
      if (item.payload.hole === 3) {
        await first
        return { status: 'ok', rows: [] }
      }
      return { status: 'conflict', rows: [], conflicts: [{ player_id: 'p1', fields: ['strokes'], server: theirs(4) }] }
    })
    // Hole 3 is on its way out, its answer slow: the flush is mid-pass when hole 4 is saved.
    await enqueueHole('t1', hole(3))
    await vi.waitFor(() => expect(pushed).toEqual([3]))
    const f = frame()
    const saving = enqueueHole('t1', hole(4), f.drawn)
    await vi.waitFor(async () => expect((await _outboxTest.stored()).some((x) => x.kind === 'hole' && x.payload.hole === 4)).toBe(true))
    // Hole 3's answer comes: the same pass takes hole 4 from the queue, and the server asks about it.
    answerFirst()
    await vi.waitFor(() => expect(pushed).toEqual([3, 4]))
    await vi.waitFor(async () => expect(await _outboxTest.db()!.conflicts.count()).toBe(1))
    // Only now is the frame on screen: the question is still there, on the phone and on the card.
    f.draw()
    await saving
    expect(await _outboxTest.db()!.conflicts.count()).toBe(1)
    expect(useOutbox.getState().conflicts).toHaveLength(1)
  })

  it('a second save of a hole still on its way into storage merges into the first: one call, the newer fields', async () => {
    const f1 = frame()
    const f2 = frame()
    const a = enqueueHole('t1', hole(9, 5), f1.drawn)
    const b = enqueueHole('t1', hole(9, 6), f2.drawn)
    await vi.waitFor(async () => expect((await _outboxTest.stored()).length).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const stored = await _outboxTest.stored()
    expect(stored).toHaveLength(1)
    expect((stored[0]!.payload as { entries: Array<{ fields: { strokes: number } }> }).entries[0]!.fields.strokes).toBe(6)
    // This tab's queue holds the merged one, whichever save finished storing first.
    expect(_outboxTest.queue().map((x) => (x.payload as { entries: Array<{ fields: { strokes: number } }> }).entries[0]!.fields.strokes)).toEqual([6])
    f2.draw()
    f1.draw()
    await Promise.all([a, b])
    expect(useOutbox.getState().pendingHoles).toBe(1)
  })

  /** The queue's next read takes what storage holds at once, and its answer comes back only on `release()`. */
  function holdNextRead() {
    const d = _outboxTest.db()!
    const toArray = d.items.toArray.bind(d.items)
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const late = async () => {
      const rows = await toArray()
      await held
      return rows
    }
    vi.spyOn(d.items, 'toArray').mockImplementationOnce(late as unknown as typeof d.items.toArray)
    return release
  }

  it('a save made while the queue is read again (another tab’s notice) stays in this tab’s queue and its count', async () => {
    const release = holdNextRead()
    const reading = _outboxTest.load()
    await enqueueHole('t1', hole(11))
    release()
    await reading
    expect(_outboxTest.queue().map((x) => (x.payload as { hole: number }).hole)).toEqual([11])
    expect(useOutbox.getState().pendingHoles).toBe(1)
  })

  it('…unless what was read holds a newer version of its key: another tab’s newer answer stays', async () => {
    _outboxTest.setPush(() => new Promise<never>(() => undefined))
    const answer = (last: string) => ({ round_id: 'r1', group_id: 'g1', hole: 12, last_holed_player_id: last, decided_by: 'p1' })
    // Another tab's answer for the hole, newer than any this tab will make.
    await _outboxTest.db()!.items.put({ key: 'tiebreak:r1:g1:12', kind: 'tiebreak', tournamentId: 't1', payload: answer('p4'), attempts: 0, createdAt: Date.now(), seq: Date.now() * 1000 + 1e12, actingUid: 'uid-a' })
    const release = holdNextRead()
    const reading = _outboxTest.load()
    await enqueueTiebreak('t1', answer('p3'))
    release()
    await reading
    expect(_outboxTest.queue().map((x) => (x.payload as { last_holed_player_id: string }).last_holed_player_id)).toEqual(['p4'])
  })
})
