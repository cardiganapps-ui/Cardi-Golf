/**
 * ARCH probe: a correction to the SAME hole made while the first save is still
 * in flight is dropped when the first push completes.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('/home/user/Cardi-Golf/src/lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('/home/user/Cardi-Golf/src/data/tournamentStore', () => ({
  registerOverlay: () => undefined,
  useTournament: { getState: () => ({ tournamentId: 't1', patch: () => undefined, reload: async () => undefined }) },
}))

const { _outboxTest, flush } = await import('/home/user/Cardi-Golf/src/data/outbox')

const score = (strokes: number) => ({
  key: 'score:r1:p1:5', kind: 'score' as const, tournamentId: 't1',
  payload: { round_id: 'r1', player_id: 'p1', hole: 5, strokes, putts: 2, picked_up: false, entered_by: 'p1', client_ts: String(strokes) },
  attempts: 0, createdAt: strokes,
})

describe('outbox same-key race', () => {
  it('keeps the newer value of a hole corrected while the first save is in flight', async () => {
    const server: number[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let first = true
    _outboxTest.setPush(async (item) => {
      const s = (item.payload as { strokes: number }).strokes
      if (first) { first = false; await gate }   // first push is slow (4G)
      server.push(s)
    })
    const p = _outboxTest.enqueue(score(5))      // "Guardar hoyo": 5 strokes, push starts
    await new Promise((r) => setTimeout(r, 0))
    await _outboxTest.enqueue(score(6))          // user fixes the hole: 6 strokes (flush is busy)
    release()                                    // the first push lands
    await p
    await flush()
    await new Promise((r) => setTimeout(r, 10))
    console.log('server received:', server, 'queue left:', _outboxTest.queue().map((q) => (q.payload as { strokes: number }).strokes))
    // What the player entered last must reach the server (or still be queued).
    const lastOnServer = server.at(-1)
    const stillQueued = _outboxTest.queue().some((q) => (q.payload as { strokes: number }).strokes === 6)
    expect(lastOnServer === 6 || stillQueued).toBe(true)
  })
})
