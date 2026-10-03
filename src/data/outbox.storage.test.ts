/**
 * REL-18: the outbox's copy on the phone is the one that counts.
 * - A write IndexedDB refuses is reported, not shown as saved in memory.
 * - The browser is asked once to keep the storage under pressure.
 * - A stale write never replaces a newer stored version (another tab's).
 * - One tab pushes at a time (Web Locks); the others reload the shared queue
 *   when told it changed (BroadcastChannel).
 * REL-17: pending writes are also counted in holes.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth', () => ({ useAuth: { getState: () => ({ user: { id: 'uid-a' } }) } }))
vi.mock('../lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('./tournamentStore', () => ({
  registerOverlay: () => undefined,
  useTournament: { getState: () => ({ tournamentId: 't1', patch: () => undefined, reload: async () => undefined }) },
}))

const { _outboxTest, flush, startOutbox, useOutbox, OutboxStorageError } = await import('./outbox')
const { t } = await import('../i18n/es-MX')

const score = (hole: number, player = 'p1') => ({
  key: `score:r1:${player}:${hole}`,
  kind: 'score' as const,
  tournamentId: 't1',
  payload: { round_id: 'r1', player_id: player, hole, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' },
  attempts: 0,
  createdAt: Date.now(),
})

beforeEach(async () => {
  _outboxTest.reset()
  _outboxTest.setLocks(null)
  await _outboxTest.clearStored()
  vi.restoreAllMocks()
})

describe('the phone keeps the write first (REL-18)', () => {
  it('a write IndexedDB refuses is reported and not shown as saved', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('TypeError: Failed to fetch')
    })
    vi.spyOn(_outboxTest.db()!.items, 'put').mockRejectedValue(new DOMException('quota', 'QuotaExceededError'))
    await expect(_outboxTest.enqueue(score(1))).rejects.toBeInstanceOf(OutboxStorageError)
    await expect(_outboxTest.enqueue(score(2))).rejects.toThrow(t.sync.storeFailed)
    expect(_outboxTest.queue()).toEqual([])
    expect(useOutbox.getState().pending).toBe(0)
  })

  it('never replaces a newer version another tab stored', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('TypeError: Failed to fetch')
    })
    const newer = { ...score(3), payload: { ...score(3).payload, strokes: 7 }, seq: Date.now() * 1000 + 1e12, actingUid: 'uid-a' }
    await _outboxTest.db()!.items.put(newer)
    await _outboxTest.enqueue(score(3))
    const stored = await _outboxTest.stored()
    expect(stored.map((x) => [x.key, (x.payload as { strokes: number }).strokes])).toEqual([['score:r1:p1:3', 7]])
  })

  it('asks the browser to keep the storage once, on the first save', async () => {
    _outboxTest.setPush(async () => undefined)
    const persist = vi.fn(async () => true)
    const persisted = vi.fn(async () => false)
    Object.defineProperty(globalThis.navigator, 'storage', { value: { persist, persisted }, configurable: true })
    await _outboxTest.enqueue(score(4))
    await _outboxTest.enqueue(score(5))
    await vi.waitFor(() => expect(useOutbox.getState().persistent).toBe(true))
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('a browser that refuses to answer is not counted as keeping the storage, and the hole is kept all the same', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('TypeError: Failed to fetch')
    })
    const persist = vi.fn(async () => {
      throw new DOMException('The request is not allowed', 'NotAllowedError')
    })
    Object.defineProperty(globalThis.navigator, 'storage', { value: { persist }, configurable: true })
    useOutbox.setState({ persistent: true })
    await _outboxTest.enqueue(score(7))
    await vi.waitFor(() => expect(useOutbox.getState().persistent).toBe(false))
    expect(persist).toHaveBeenCalledTimes(1)
    expect((await _outboxTest.stored()).map((x) => x.key)).toEqual(['score:r1:p1:7'])
  })
})

describe('one tab pushes at a time (REL-18)', () => {
  it('a tab without the lock pushes nothing; with it, everything goes', async () => {
    const pushed: string[] = []
    _outboxTest.setPush(async (item) => void pushed.push(item.key))
    let held = true
    _outboxTest.setLocks({ request: async (_name, _opts, cb) => cb(held ? null : { name: 'cardi-golf-outbox' }) })
    await _outboxTest.enqueue(score(6))
    await flush()
    expect(pushed).toEqual([])
    expect(await _outboxTest.stored()).toHaveLength(1)
    held = false
    await flush()
    expect(pushed).toEqual(['score:r1:p1:6'])
  })

  it('another tab saying the queue changed makes this one reload it', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('TypeError: Failed to fetch')
    })
    await startOutbox()
    // The other tab wrote a hole and told everyone.
    await _outboxTest.db()!.items.put({ ...score(7), seq: Date.now() * 1000, actingUid: 'uid-a' })
    const other = new BroadcastChannel('cardi-golf-outbox')
    other.postMessage('changed')
    await vi.waitFor(() => expect(_outboxTest.queue().map((x) => x.key)).toContain('score:r1:p1:7'))
    other.close()
  })
})

describe('pending, in holes (REL-17)', () => {
  it('a foursome hole is four rows and one hole', async () => {
    _outboxTest.setPush(async () => {
      throw new Error('TypeError: Failed to fetch')
    })
    for (const p of ['p1', 'p2', 'p3', 'p4']) await _outboxTest.enqueue(score(8, p))
    expect(useOutbox.getState()).toMatchObject({ pending: 4, pendingHoles: 1 })
  })
})
