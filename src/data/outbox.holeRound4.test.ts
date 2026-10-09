/**
 * Outbox v2's edges (PR #106, round 4), from its round-3 verifier:
 *
 * - A1: the server's look at a gone round was two requests (the rounds, then
 *   the tournament). A device still released when the first was answered and
 *   claimed again before the second read no rounds and then the tournament,
 *   and a hole of a round that exists was rejected as «Ese día del torneo ya
 *   no existe». The look is now one request (the tournament with its rounds
 *   embedded), so membership is read once.
 * - G-X07: that request is tried once (no client retries).
 * - G-X17: a held write of an older build for another round (same hole, same
 *   player) holds nothing back.
 *
 * Real outbox and tournament store, the app's real Supabase client, entered
 * as p1 with the PIN, against the fake server (src/data/testing/fakeSupabase.ts).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Row } from './mappers'
import { enterAs, holeScore, installFakePhone, settle, until, type Outcome } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, adoptQueuedWrites, enqueueHole, rejectGoneRounds, startOutbox, useOutbox } = await import('./outbox')
type HoleEntry = import('./outbox').HoleEntry
const { useTournament } = await import('./tournamentStore')
const { t } = await import('../i18n/es-MX')

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

const boards = () => useTournament.getState().data!.snapshot
const calls = () => server.wire.filter((r) => r.target === 'rpc/save_hole' && r.as === me)
const saveHole = (hole: number, entries: HoleEntry[], round = 'r1') => enqueueHole('t1', { round_id: round, hole, entered_by: 'p1', entries })
const played = (strokes: number, putts = 2): HoleEntry['fields'] => ({ strokes, putts })
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))
const roundGone = () => useOutbox.getState().rejected.filter((r) => r.message === t.sync.errRoundGone)
/** The reads a look sends (any GET of the rounds or the tournament). */
const reads = (from: number) => server.wire.slice(from).filter((r) => r.method === 'GET' && (r.target === 'rounds' || r.target === 'tournaments'))

/** Re-stamp every queued item with another identity (null: saved before the session was confirmed). */
async function markAllHeld(uid: string | null) {
  const d = _outboxTest.db()!
  for (const it of await d.items.toArray()) await d.items.put({ ...it, actingUid: uid })
  await _outboxTest.load()
}
/** The boards fetched while this phone still has no signal for its writes. */
async function reloadWithoutFlushing() {
  const reachable = server.reachable
  server.reachable = () => true
  try {
    await useTournament.getState().reload()
  } finally {
    server.reachable = reachable
  }
}
/** Boards that came from the server with the tournament and no rounds: the device was released between the two reads (NEW-1). */
async function boardsWithoutRounds() {
  const mine = (server.tables.device_sessions ?? []).filter((d) => d.auth_user_id === me)
  server.decide = async (req): Promise<Outcome> => {
    if (req.target === 'rounds' && req.method === 'GET') {
      await tick(20)
      server.tables.device_sessions = (server.tables.device_sessions ?? []).filter((d) => d.auth_user_id !== me)
    }
    return 'answer'
  }
  await reloadWithoutFlushing()
  server.decide = () => 'answer'
  expect(useTournament.getState().source).toBe('server')
  expect(boards().rounds).toEqual([])
  return mine
}
/** `rejectGoneRounds` with signal for this look only (no `online` event, so nothing is flushed meanwhile). */
async function look(): Promise<number> {
  const reachable = server.reachable
  server.reachable = () => true
  phone.online = true
  try {
    return await rejectGoneRounds('t1')
  } finally {
    server.reachable = reachable
    server.decide = () => 'answer'
  }
}

describe('A1: the look at a gone round reads membership once', () => {
  it('a device claimed again while the server is asked never rejects a hole of a round that exists', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    await markAllHeld('not-member')
    await tick(5)
    const mine = await boardsWithoutRounds()
    // Still released when the look sets out; claimed again (the PIN) by the time the tournament is read. Under
    // the two requests the rounds read empty (as a stranger) and the tournament then read (as a member).
    server.decide = async (req): Promise<Outcome> => {
      if (req.target === 'tournaments' && req.method === 'GET') server.tables.device_sessions = [...(server.tables.device_sessions ?? []), ...mine]
      return 'answer'
    }
    let moved = -1
    try {
      moved = await look()
    } finally {
      if (!(server.tables.device_sessions ?? []).some((d) => d.auth_user_id === me)) server.tables.device_sessions = [...(server.tables.device_sessions ?? []), ...mine]
    }
    expect((server.tables.rounds ?? []).some((r: Row) => r.id === 'r1')).toBe(true)
    expect(moved).toBe(0)
    expect(roundGone()).toEqual([])
    expect(useOutbox.getState().pending).toBe(1)
    // The PIN's adopt then sends it, and it lands.
    phone.goOnline()
    await adoptQueuedWrites('t1')
    await until(() => useOutbox.getState().pending === 0, 'the hole to go out')
    await settle(useOutbox)
    expect(server.score('p1', 5)).toMatchObject({ strokes: 5, putts: 2 })
    expect(roundGone()).toEqual([])
  })

  it('the look is one request: the tournament with, embedded, the rounds asked about', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    await tick(5)
    server.tables.rounds = (server.tables.rounds ?? []).filter((r: Row) => r.id !== 'r1')
    await reloadWithoutFlushing()
    const before = server.wire.length
    expect(await look()).toBe(1)
    const sent = reads(before)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.target).toBe('tournaments')
    expect(sent[0]!.params.get('select')).toBe('id,rounds!rounds_tournament_id_fkey(id)')
    expect(sent[0]!.params.get('id')).toBe('eq.t1')
    expect(sent[0]!.params.get('rounds.id')).toBe('in.(r1)')
    expect(roundGone()).toEqual([expect.objectContaining({ key: 'score:r1:p1:5' })])
  })

  it('a round that exists is kept and one that is gone is rejected, from the same answer', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    await saveHole(6, [{ player_id: 'p1', fields: played(4), base: {} }], 'r-gone')
    await tick(5)
    // Boards without either round (read across a lost membership), then the device is a member again.
    const mine = await boardsWithoutRounds()
    server.tables.device_sessions = [...(server.tables.device_sessions ?? []), ...mine]
    const before = server.wire.length
    expect(await look()).toBe(1)
    expect(reads(before)).toHaveLength(1)
    expect(roundGone().map((r) => r.key)).toEqual(['score:r-gone:p1:6'])
    expect(_outboxTest.queue()).toMatchObject([{ kind: 'hole', payload: { round_id: 'r1', hole: 5 } }])
  })
})

describe('gap tests (round-3 verifier)', () => {
  it('G-X07: a lost answer is tried once, and rejects nothing', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    await tick(5)
    server.tables.rounds = (server.tables.rounds ?? []).filter((r: Row) => r.id !== 'r1')
    await reloadWithoutFlushing()
    server.decide = (req) => (req.target === 'tournaments' ? 'offline' : 'answer')
    const before = server.wire.length
    const started = Date.now()
    expect(await look()).toBe(0)
    expect(Date.now() - started).toBeLessThan(1000)
    expect(server.wire.slice(before).filter((r) => r.target === 'tournaments')).toHaveLength(1)
    expect(useOutbox.getState().pending).toBe(1)
    expect(roundGone()).toEqual([])
  })

  it('G-X17: a held legacy item of another round (same hole, same player) holds nothing back', async () => {
    phone.goOffline()
    const legacy = { key: 'score:r2:p2:7', kind: 'score' as const, tournamentId: 't1', payload: holeScore('p2', 7, 6, 'r2'), attempts: 0, createdAt: 1, seq: 1000, actingUid: null }
    await _outboxTest.db()!.items.put(legacy)
    await _outboxTest.load()
    await saveHole(7, [{ player_id: 'p2', fields: played(5), base: {} }])
    phone.goOnline()
    await until(() => calls().length === 1, 'the hole')
    await settle(useOutbox)
    expect(server.score('p2', 7)).toMatchObject({ strokes: 5 })
    // The legacy write still waits for the PIN; it was not sent.
    expect(useOutbox.getState().held).toBe(1)
  })
})
