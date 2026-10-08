/**
 * A phone that opens a tournament from its copy, with no signal, enters it by
 * `seed()` before the gate's load: the Comité's `await reload()` and a landing's
 * one more fetch must still fetch it (#92's fifth verifier, E3b). A fresh
 * module: nothing was open before the seed.
 */
import 'fake-indexeddb/auto'
import { expect, it, vi } from 'vitest'
import { getFixture } from '../dev/fixtures'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { snapshotToRows } from './testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))
const { useTournament } = await import('./tournamentStore')

it('a store entered from the copy fetches when asked, before any load', async () => {
  const f = getFixture('full12-live')!
  server = fakeSupabase(snapshotToRows(f.snapshot))
  useTournament.getState().seed(f.snapshot.tournament.id, structuredClone(f.snapshot), Date.now() - 60_000)
  expect(useTournament.getState().source).toBe('cache')
  const n = server.requests.filter((r) => r.table === 'tournaments').length
  await useTournament.getState().reload()
  expect(server.requests.filter((r) => r.table === 'tournaments').length - n).toBe(1)
  expect(useTournament.getState().source).toBe('server')
})
