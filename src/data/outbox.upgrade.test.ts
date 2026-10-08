/**
 * Phones in the field hold queues saved by the previous build (outbox v2,
 * items without a `seq`). Opening them with this build must keep every item,
 * in the order it was saved, and never lose one to the new versioning.
 */
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('./tournamentStore', () => ({
  registerOverlay: () => undefined,
  liveSeq: () => 0,
  liveClock: () => Date.now(),
  useTournament: { getState: () => ({ tournamentId: 't1', patch: () => undefined, refresh: () => undefined, landChanges: () => undefined, pushesDone: () => undefined, reload: async () => undefined }) },
}))

const legacy = (hole: number, createdAt: number) => ({
  key: `score:r1:p1:${hole}`,
  kind: 'score',
  tournamentId: 't1',
  payload: { round_id: 'r1', player_id: 'p1', hole, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' },
  attempts: 2,
  createdAt,
})

describe('outbox upgrade from v2', () => {
  it('keeps every queued write, oldest first, with a version', async () => {
    // What the previous build left on the phone.
    const old = new Dexie('cardi-golf-outbox')
    old.version(2).stores({ items: 'key, tournamentId, createdAt', rejected: 'key, tournamentId, at' })
    await old.table('items').bulkPut([legacy(7, 3000), legacy(3, 1000), legacy(5, 2000)])
    old.close()

    const { _outboxTest } = await import('./outbox')
    await _outboxTest.load()
    const q = _outboxTest.queue()
    expect(q.map((x) => x.key)).toEqual(['score:r1:p1:3', 'score:r1:p1:5', 'score:r1:p1:7'])
    expect(q.every((x) => typeof x.seq === 'number' && x.attempts === 2)).toBe(true)
    // Stored with their version, so a later push can settle exactly them.
    expect((await _outboxTest.stored()).every((x) => typeof x.seq === 'number')).toBe(true)

    // A write made after the upgrade sorts after every legacy item.
    _outboxTest.setPush(async () => {
      throw new Error('TypeError: Failed to fetch')
    })
    await _outboxTest.enqueue({ ...legacy(9, 4000), kind: 'score' as const, attempts: 0 } as Parameters<typeof _outboxTest.enqueue>[0])
    expect(_outboxTest.queue().at(-1)!.key).toBe('score:r1:p1:9')
  })
})
