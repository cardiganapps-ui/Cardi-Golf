/**
 * ARCH probe: the Tarjeta's "Deshacer" (ScorecardScreen.tsx:316-323) re-enqueues
 * the same four keys while the save of that hole is still being pushed.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('/home/user/Cardi-Golf/src/lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('/home/user/Cardi-Golf/src/data/tournamentStore', () => ({
  registerOverlay: () => undefined,
  useTournament: { getState: () => ({ tournamentId: 't1', patch: () => undefined, reload: async () => undefined }) },
}))

const { _outboxTest } = await import('/home/user/Cardi-Golf/src/data/outbox')

const item = (pid: string, strokes: number) => ({
  key: `score:r1:${pid}:5`, kind: 'score' as const, tournamentId: 't1',
  payload: { round_id: 'r1', player_id: pid, hole: 5, strokes, putts: 2, picked_up: false, entered_by: 'p1', client_ts: String(strokes) },
  attempts: 0, createdAt: Date.now(),
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('outbox + Deshacer', () => {
  it('an undo tapped while the hole is still syncing reaches the server', async () => {
    const server = new Map<string, number>()
    _outboxTest.setPush(async (it) => {
      await sleep(40) // one round trip on 4G
      server.set(it.key, (it.payload as { strokes: number }).strokes)
    })
    // "Guardar hoyo": the hole had 4,4,4,4 before; the group saves 7,7,7,7 (writeHole awaits each enqueue).
    for (const p of ['p1', 'p2', 'p3', 'p4']) await _outboxTest.enqueue(item(p, 7))
    await sleep(20) // the toast shows; the player taps "Deshacer" right away
    for (const p of ['p1', 'p2', 'p3', 'p4']) await _outboxTest.enqueue(item(p, 4))
    await sleep(600)
    const final = Object.fromEntries(server)
    console.log('server after undo:', final, 'queue left:', _outboxTest.queue().length)
    expect(Object.values(final)).toEqual([4, 4, 4, 4])
  })
})
