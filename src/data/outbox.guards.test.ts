/**
 * The outbox v2 guards no other test pins (PR #106, from its round-2
 * verifier: mutants R05, R17, R18 and R19). A held hole holds back only its
 * own hole; deciding that a round is gone needs boards of this tournament,
 * from the server, read before the hole was queued, and short of that the
 * server is not even asked.
 *
 * Real outbox and tournament store, the app's real Supabase client, entered
 * as p1 with the PIN, against the fake server (src/data/testing/fakeSupabase.ts).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { enterAs, installFakePhone, settle, until, type Outcome } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, adoptQueuedWrites, enqueueHole, rejectGoneRounds, startOutbox, useOutbox } = await import('./outbox')
type HoleEntry = import('./outbox').HoleEntry
const { useTournament } = await import('./tournamentStore')

let me = ''
beforeAll(async () => {
  me = await enterAs('p1')
  await startOutbox()
})
beforeEach(async () => {
  server.reset()
  phone.online = true
  _outboxTest.reset()
  await _outboxTest.clearStored()
  useTournament.setState({ tournamentId: 't1' })
  await useTournament.getState().reload()
})
afterEach(() => _outboxTest.reset())

const calls = () => server.wire.filter((r) => r.target === 'rpc/save_hole' && r.as === me)
const saveHole = (hole: number, entries: HoleEntry[], round = 'r1') => enqueueHole('t1', { round_id: round, hole, entered_by: 'p1', entries })
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))
/**
 * Calls `rejectGoneRounds` with signal (no `online` event, so no flush), and
 * says how many rounds reads it sent: a guard that holds asks nothing.
 */
async function looks(tid: string): Promise<{ moved: number; asked: number }> {
  const before = server.wire.length
  const reachable = server.reachable
  const online = phone.online
  server.reachable = () => true
  phone.online = true
  try {
    const moved = await rejectGoneRounds(tid)
    return { moved, asked: server.wire.slice(before).filter((r) => r.target === 'rounds').length }
  } finally {
    server.reachable = reachable
    phone.online = online
  }
}
async function reloadWithoutFlushing() {
  const reachable = server.reachable
  server.reachable = () => true
  try {
    await useTournament.getState().reload()
  } finally {
    server.reachable = reachable
  }
}
async function heldNull() {
  const d = _outboxTest.db()!
  for (const it of await d.items.toArray()) await d.items.put({ ...it, actingUid: null })
  await _outboxTest.load()
}

describe('guards', () => {
  it('a held hole blocks only its own hole: another hole goes at once (R05)', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p2', fields: { strokes: 5, putts: 2 }, base: {} }])
    await heldNull()
    await saveHole(7, [{ player_id: 'p2', fields: { strokes: 5, putts: 2 }, base: {} }])
    phone.goOnline()
    await until(() => calls().length === 1, 'hole 7')
    expect(calls().map((c) => (c.body as { p: { hole: number } }).p.hole)).toEqual([7])
  })

  it('the phone’s copy rejects nothing, even after a later server read (R17)', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: { strokes: 5, putts: 2 }, base: {} }])
    await tick(5)
    await reloadWithoutFlushing()
    const copy = structuredClone(useTournament.getState().data!.snapshot)
    copy.rounds = []
    useTournament.setState({ source: null })
    useTournament.getState().seed('t1', copy, Date.now())
    // Nothing decided from the phone's copy: the server is not even asked.
    expect(await looks('t1')).toEqual({ moved: 0, asked: 0 })
  })

  it('boards of another tournament reject nothing (R18: adopt runs before the gate’s load)', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: { strokes: 5, putts: 2 }, base: {} }])
    await tick(5)
    // The store still shows the tournament the phone came from, read after this hole was queued, without r1.
    const rounds = server.tables.rounds
    server.tables.rounds = []
    await reloadWithoutFlushing()
    server.tables.rounds = rounds ?? []
    useTournament.setState({ tournamentId: 't-other' })
    expect(await looks('t1')).toEqual({ moved: 0, asked: 0 })
  })

  it('a hole queued while a fetch is on its way, for a round that fetch could not see, is kept (R19)', async () => {
    phone.goOffline()
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    server.decide = async (req): Promise<Outcome> => {
      if (req.target === 'rounds' && req.method === 'GET') await held
      return 'answer'
    }
    const reachable = server.reachable
    server.reachable = () => true
    const fetching = useTournament.getState().reload()
    await tick(20)
    // Another tab saw the round the Comité just made, and saved a hole of it.
    await saveHole(5, [{ player_id: 'p1', fields: { strokes: 5, putts: 2 }, base: {} }], 'r-new')
    await tick(5)
    release()
    await fetching
    server.reachable = reachable
    server.decide = () => 'answer'
    // The server has no such round yet either: only the time guard keeps it, before anything is asked.
    expect(await looks('t1')).toEqual({ moved: 0, asked: 0 })
    await adoptQueuedWrites('t1')
    await settle(useOutbox)
    expect(useOutbox.getState().rejected).toEqual([])
  })
})
