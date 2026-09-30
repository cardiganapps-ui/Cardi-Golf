import { expect, it, vi } from 'vitest'
vi.mock('/home/user/Cardi-Golf/src/lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
const { dataFromSnapshot, registerOverlay } = await import('/home/user/Cardi-Golf/src/data/tournamentStore')
const { overlayPending, _outboxTest } = await import('/home/user/Cardi-Golf/src/data/outbox')
import { makeFirstTournament } from '/home/user/Cardi-Golf/src/engine/testing/fixtures'
it('compute() leaves the fetched snapshot (the one load() saves to IndexedDB) untouched', async () => {
  registerOverlay(overlayPending)
  _outboxTest.setPush(async () => { throw new Error('Failed to fetch') }) // offline: stays queued
  const fetched = makeFirstTournament()
  await _outboxTest.enqueue({ key: 'score:r1:p1:1', kind: 'score', tournamentId: fetched.tournament.id, payload: { round_id: 'r1', player_id: 'p1', hole: 1, strokes: 9, putts: 2, picked_up: false, entered_by: 'p1', client_ts: 'x' }, attempts: 0, createdAt: 1 })
  const before = fetched.scores.length
  dataFromSnapshot(fetched)
  console.log('scores in the "server" snapshot before/after compute:', before, fetched.scores.length)
  expect(fetched.scores.length).toBe(before)
})
