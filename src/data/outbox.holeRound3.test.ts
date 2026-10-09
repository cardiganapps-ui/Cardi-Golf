/**
 * Outbox v2's edges (PR #106, round 3), found by its independent verifier:
 *
 * - NEW-1: the boards' tournament and rounds are separate reads. A device
 *   released between the two got the tournament and no rounds, and adopting
 *   then rejected every held hole as «Ese día del torneo ya no existe», which
 *   the server never got. A hole on its way to the server is never rejected
 *   either.
 * - NEW-2: the Comité's own direct write (an organizer who plays nobody, or
 *   the Polo admin) leaves `entered_by` null and no reason: par and 2 putts
 *   from it is a claim, never a phone's untouched default.
 * - NEW-4: a correction saved as a `hole` never overtakes an older build's
 *   capture of the same player and hole (a `score` item) that waits.
 * - «Guardar el mío» over a row that is gone sends the whole hole the player
 *   saw, not only the fields he changed.
 *
 * Real outbox and tournament store, the app's real Supabase client, entered
 * as p1 with the PIN, against the fake server (src/data/testing/fakeSupabase.ts).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Row } from './mappers'
import { enterAs, gate, holeScore, installFakePhone, settle, snakeAnswer, until, type Outcome } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, adoptQueuedWrites, enqueueHole, rejectGoneRounds, sendMineAgain, startOutbox, useOutbox } = await import('./outbox')
type HoleEntry = import('./outbox').HoleEntry
const { useTournament } = await import('./tournamentStore')
const { supabase } = await import('../lib/supabase')
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
const onBoards = (player: string, hole: number) => boards().scores.find((s) => s.roundId === 'r1' && s.playerId === player && s.hole === hole)
const seen = (player: string, hole: number) => {
  const s = onBoards(player, hole)!
  return { strokes: s.strokes, putts: s.putts, picked_up: s.pickedUp }
}
const calls = () => server.wire.filter((r) => r.target === 'rpc/save_hole' && r.as === me)
const saveHole = (hole: number, entries: HoleEntry[], round = 'r1') => enqueueHole('t1', { round_id: round, hole, entered_by: 'p1', entries })
const played = (strokes: number, putts = 2): HoleEntry['fields'] => ({ strokes, putts })
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))
const roundGone = () => useOutbox.getState().rejected.filter((r) => r.message === t.sync.errRoundGone)

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
const withoutRound = (id: string) => (server.tables.rounds = (server.tables.rounds ?? []).filter((r: Row) => r.id !== id))

describe('NEW-1: adopting never rejects a hole of a round that exists', () => {
  it('boards read across a lost membership (tournament in, rounds empty): the held hole goes, nothing rejected', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    // Held (the device was released before: not_member), as REL-16 keeps it.
    await markAllHeld('not-member')
    await tick(5)
    const mine = (server.tables.device_sessions ?? []).filter((d) => d.auth_user_id === me)
    server.decide = async (req): Promise<Outcome> => {
      if (req.target === 'rounds' && req.method === 'GET') {
        await tick(20)
        // The device is released (the Comité's «No soy yo», another tab's «Cambiar de jugador») between the
        // tournament's read and the rounds'.
        server.tables.device_sessions = (server.tables.device_sessions ?? []).filter((d) => d.auth_user_id !== me)
      }
      return 'answer'
    }
    await reloadWithoutFlushing()
    server.decide = () => 'answer'
    // What the store kept: the tournament, no rounds, from the server.
    expect(useTournament.getState().source).toBe('server')
    expect(boards().rounds).toEqual([])
    // The player enters again (the PIN): the gate adopts, before its own load.
    server.tables.device_sessions = [...(server.tables.device_sessions ?? []), ...mine]
    phone.goOnline()
    await adoptQueuedWrites('t1')
    await until(() => useOutbox.getState().pending === 0, 'the hole to go out')
    await settle(useOutbox)
    expect(roundGone()).toEqual([])
    expect(server.score('p1', 5)).toMatchObject({ strokes: 5, putts: 2 })
  })

  it('a device that is nobody here when it asks again rejects nothing (the tournament does not read)', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    await tick(5)
    withoutRound('r1')
    await reloadWithoutFlushing()
    // Released after the boards came: the rounds read empty under RLS, and so does the tournament.
    const claims = server.tables.device_sessions ?? []
    server.tables.device_sessions = claims.filter((d) => d.auth_user_id !== me)
    const before = server.wire.length
    // Signal for this look only (no `online` event, so the hole is not flushed meanwhile).
    const reachable = server.reachable
    server.reachable = () => true
    phone.online = true
    try {
      expect(await rejectGoneRounds('t1')).toBe(0)
    } finally {
      server.reachable = reachable
      phone.online = false
      // The PIN claims outlive server.reset(): the next tests need this phone back in.
      server.tables.device_sessions = claims
    }
    // It did ask, in one request (round 4): the tournament with its rounds embedded, which read nothing.
    expect(server.wire.slice(before).map((r) => r.target)).toEqual(['tournaments'])
    expect(useOutbox.getState().pending).toBe(1)
    expect(roundGone()).toEqual([])
  })

  it('no answer to the look rejects nothing', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    await tick(5)
    withoutRound('r1')
    await reloadWithoutFlushing()
    // Still offline: the server can't be asked, so nothing is decided.
    expect(await rejectGoneRounds('t1')).toBe(0)
    expect(useOutbox.getState().pending).toBe(1)
    // Signal, but every answer lost (lie-fi): the same, at once (one try, no client retries).
    server.decide = () => 'offline'
    phone.goOnline()
    const asked = server.wire.length
    const started = Date.now()
    expect(await rejectGoneRounds('t1')).toBe(0)
    expect(Date.now() - started).toBeLessThan(1000)
    expect(server.wire.slice(asked).filter((r) => r.target === 'tournaments')).toHaveLength(1)
    expect(server.wire.slice(asked).filter((r) => r.target === 'rounds')).toHaveLength(0)
    expect(useOutbox.getState().pending).toBe(1)
    expect(roundGone()).toEqual([])
  })

  it('with no session to ask with, nothing is decided (and nothing goes out as the anon key)', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    await tick(5)
    withoutRound('r1')
    await reloadWithoutFlushing()
    const before = server.wire.length
    const getSession = vi.spyOn(supabase().auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null })
    const reachable = server.reachable
    server.reachable = () => true
    phone.online = true
    try {
      expect(await rejectGoneRounds('t1')).toBe(0)
    } finally {
      getSession.mockRestore()
      server.reachable = reachable
      phone.online = false
    }
    expect(server.wire.slice(before).filter((r) => r.target === 'rounds' || r.target === 'tournaments')).toEqual([])
    expect(useOutbox.getState().pending).toBe(1)
  })

  it('a hole on its way to the server is never rejected, even for a round that is gone; once back, it is', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    await tick(5)
    withoutRound('r1')
    await reloadWithoutFlushing()
    const held = gate()
    server.decide = async (req): Promise<Outcome> => {
      if (req.target === 'rpc/save_hole' && req.as === me) await held.wait
      return 'answer'
    }
    phone.goOnline()
    await until(() => calls().length === 1, 'the call on its way')
    try {
      // The gate's look while the call is out: the server may be storing it right now.
      expect(await rejectGoneRounds('t1')).toBe(0)
      expect(roundGone()).toEqual([])
    } finally {
      // Never left hanging: a call held for good keeps the outbox's lock from the tests after this one.
      held.open()
    }
    // save_hole answers not_member for a round that does not exist: held for the PIN.
    await until(() => useOutbox.getState().held === 1, 'held')
    await settle(useOutbox)
    server.decide = () => 'answer'
    expect(await rejectGoneRounds('t1')).toBe(1)
    expect(roundGone()).toEqual([expect.objectContaining({ key: 'score:r1:p1:5' })])
  })

  it('a hole replaced while the server is asked again is not rejected: its newer version stays', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    await tick(5)
    withoutRound('r1')
    await reloadWithoutFlushing()
    let merged = false
    server.decide = async (req): Promise<Outcome> => {
      if (req.target === 'tournaments' && req.method === 'GET' && !merged) {
        merged = true
        // The player corrects the hole while the gate asks: merged into the same item, a newer version. Saved
        // with the phone offline, so it waits on the phone and is not on its way (the in-flight guard stays out).
        phone.online = false
        await saveHole(5, [{ player_id: 'p1', fields: { strokes: 6 }, base: {} }])
        phone.online = true
      }
      return 'answer'
    }
    // Signal for this look only (no `online` event, so the hole is not flushed meanwhile).
    const reachable = server.reachable
    server.reachable = () => true
    phone.online = true
    try {
      expect(await rejectGoneRounds('t1')).toBe(0)
    } finally {
      server.reachable = reachable
      phone.online = false
    }
    expect(merged).toBe(true)
    expect(calls()).toHaveLength(0)
    expect(useOutbox.getState().pending).toBe(1)
    expect(_outboxTest.queue()).toMatchObject([{ payload: { entries: [{ fields: { strokes: 6, putts: 2 } }] } }])
    expect(roundGone()).toEqual([])
  })
})

describe('NEW-2: the Comité’s own direct write is a claim', () => {
  it('par and 2 with no player behind it (an organizer who plays nobody): this phone is asked, and the 4 stands', async () => {
    // What a direct write by an organizer with no player leaves: entered_by null (scores_00_writer), no reason.
    server.seed('scores', [{ round_id: 'r1', player_id: 'p3', hole: 8, strokes: 4, putts: 2, picked_up: false, entered_by: null }])
    await saveHole(8, [{ player_id: 'p3', fields: played(6), base: {}, dflt: { strokes: 4, putts: 2, picked_up: false } }])
    await until(() => useOutbox.getState().pending === 0, 'the save')
    await settle(useOutbox)
    expect(useOutbox.getState().conflicts).toMatchObject([{ player_id: 'p3', hole: 8, fields: { strokes: 6, putts: 2 } }])
    expect(server.score('p3', 8)).toMatchObject({ strokes: 4, putts: 2, entered_by: null })
    // One call for this hole: nothing re-sent over the Comité's 4.
    expect(calls().filter((r) => (r.body as { p: { hole: number } }).p.hole === 8)).toHaveLength(1)
  })
})

describe('NEW-4: a correction never overtakes an older build’s capture that waits', () => {
  it('a held legacy score item and a newer hole of the same player: the legacy one goes first, the correction lands', async () => {
    phone.goOffline()
    // Queued by an older build (one player's direct write), before the session was confirmed.
    const legacy = { key: 'score:r1:p2:7', kind: 'score' as const, tournamentId: 't1', payload: holeScore('p2', 7, 6), attempts: 0, createdAt: 1, seq: 1000, actingUid: null }
    await _outboxTest.db()!.items.put(legacy)
    await _outboxTest.load()
    // The correction to 5, typed over the 6 the boards show.
    await saveHole(7, [{ player_id: 'p2', fields: { strokes: 5 }, base: seen('p2', 7) }])
    expect(onBoards('p2', 7)).toMatchObject({ strokes: 5 })
    phone.goOnline()
    await tick(300)
    await settle(useOutbox)
    // The correction waits behind the capture it was typed over.
    expect(calls()).toHaveLength(0)
    await adoptQueuedWrites('t1')
    await until(() => useOutbox.getState().pending === 0, 'both')
    await settle(useOutbox)
    expect(server.strokesWritten('p2', 7)).toEqual([6, 5])
    expect(server.score('p2', 7)).toMatchObject({ strokes: 5 })
    expect(useOutbox.getState().conflicts).toEqual([])
  })

  it('an older held write of another kind (a snake answer) holds no hole back', async () => {
    phone.goOffline()
    const answer = { key: 'tiebreak:r1:g1:7', kind: 'tiebreak' as const, tournamentId: 't1', payload: snakeAnswer(7, 'p2'), attempts: 0, createdAt: 1, seq: 1000, actingUid: null }
    await _outboxTest.db()!.items.put(answer)
    await _outboxTest.load()
    await saveHole(7, [{ player_id: 'p2', fields: played(5), base: {} }])
    phone.goOnline()
    await until(() => calls().length === 1, 'the hole')
    await settle(useOutbox)
    expect(server.score('p2', 7)).toMatchObject({ strokes: 5 })
    expect(useOutbox.getState().held).toBe(1)
  })

  it('a held legacy item of another player, or another hole, holds nothing back', async () => {
    phone.goOffline()
    const legacy = { key: 'score:r1:p3:7', kind: 'score' as const, tournamentId: 't1', payload: holeScore('p3', 7, 6), attempts: 0, createdAt: 1, seq: 1000, actingUid: null }
    const other = { key: 'score:r1:p2:6', kind: 'score' as const, tournamentId: 't1', payload: holeScore('p2', 6, 6), attempts: 0, createdAt: 1, seq: 1001, actingUid: null }
    await _outboxTest.db()!.items.bulkPut([legacy, other])
    await _outboxTest.load()
    await saveHole(7, [{ player_id: 'p2', fields: played(5), base: {} }])
    phone.goOnline()
    await until(() => calls().length === 1, 'the hole')
    await settle(useOutbox)
    expect(server.score('p2', 7)).toMatchObject({ strokes: 5 })
    expect(useOutbox.getState().held).toBe(2)
  })
})

describe('«Guardar el mío» over a row that is gone', () => {
  it('sends the whole hole the player saw: his putts are not lost with the row', async () => {
    server.seed('scores', [{ round_id: 'r1', player_id: 'p2', hole: 4, strokes: 5, putts: 3, picked_up: false, entered_by: 'p3' }])
    await useTournament.getState().reload()
    phone.goOffline()
    // This phone corrects p2's strokes only, over the 5 and 3 it saw.
    await saveHole(4, [{ player_id: 'p2', fields: { strokes: 6 }, base: seen('p2', 4) }])
    // The Comité deletes the row meanwhile.
    server.tables.scores = (server.tables.scores ?? []).filter((r: Row) => !(r.player_id === 'p2' && r.hole === 4))
    phone.goOnline()
    await until(() => useOutbox.getState().conflicts.length === 1, 'the question')
    await settle(useOutbox)
    const [c] = useOutbox.getState().conflicts
    expect(c!.server).toBeNull()
    await sendMineAgain(c!.key, 'p1')
    await until(() => useOutbox.getState().pending === 0, 'the hole again')
    await settle(useOutbox)
    expect(server.score('p2', 4)).toMatchObject({ strokes: 6, putts: 3, picked_up: false })
    expect(useOutbox.getState().conflicts).toEqual([])
  })
})
