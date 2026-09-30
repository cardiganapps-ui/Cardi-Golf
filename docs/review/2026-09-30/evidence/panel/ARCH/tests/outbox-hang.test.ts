import { expect, it, vi } from 'vitest'
vi.mock('/home/user/Cardi-Golf/src/lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('/home/user/Cardi-Golf/src/data/tournamentStore', () => ({
  registerOverlay: () => undefined,
  useTournament: { getState: () => ({ tournamentId: 't1', patch: () => undefined, reload: async () => undefined }) },
}))
const { _outboxTest, flush, useOutbox } = await import('/home/user/Cardi-Golf/src/data/outbox')
const item = (hole: number) => ({ key: `score:r1:p1:${hole}`, kind: 'score' as const, tournamentId: 't1', payload: { round_id: 'r1', player_id: 'p1', hole, strokes: 4, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' }, attempts: 0, createdAt: hole })
it('a push that never answers (dead 4G socket) stalls every later hole', async () => {
  let calls = 0
  _outboxTest.setPush(async () => { calls++; if (calls === 1) await new Promise(() => undefined) }) // first request hangs forever
  await _outboxTest.enqueue(item(1))
  for (let h = 2; h <= 6; h++) await _outboxTest.enqueue(item(h))
  for (let i = 0; i < 5; i++) await flush()
  await new Promise((r) => setTimeout(r, 200))
  console.log(`pushes attempted: ${calls}, still pending: ${useOutbox.getState().pending}, syncing: ${useOutbox.getState().syncing}, lastError: ${useOutbox.getState().lastError}`)
  expect(calls).toBeGreaterThan(1)
})
