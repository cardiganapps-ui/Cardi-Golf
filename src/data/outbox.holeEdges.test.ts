/**
 * Outbox v2's edges (PR #106, round 2), found by its independent verifier:
 *
 * - V1: a hole saved before the phone's session was confirmed waits for the
 *   gate; a correction of the same hole saved after it must not overtake it,
 *   or it met the older value as someone else's, and the older one went over
 *   the correction.
 * - V2: a round the Comité deleted answers `not_member`; its hole waited for a
 *   PIN that could never send it, and kept the phone from signing out.
 * - The tarjeta-cruzada rule (an untouched default is gone over without
 *   asking) never applies to a Comité correction or to anything but par and
 *   2 putts.
 * - The boards show a waiting hole over what they hold, not over what the
 *   phone saw.
 *
 * Real outbox and tournament store, the app's real Supabase client, entered
 * as p1 with the PIN, against the fake server (src/data/testing/fakeSupabase.ts).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Row } from './mappers'
import { enterAs, holeScore, installFakePhone, settle, until, type Outcome } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, adoptQueuedWrites, enqueueHole, rejectGoneRounds, startOutbox, unsentWrites, useOutbox } = await import('./outbox')
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
const onBoards = (player: string, hole: number) => boards().scores.find((s) => s.roundId === 'r1' && s.playerId === player && s.hole === hole)
const calls = () => server.wire.filter((r) => r.target === 'rpc/save_hole' && r.as === me)
const saveHole = (hole: number, entries: HoleEntry[], round = 'r1') => enqueueHole('t1', { round_id: round, hole, entered_by: 'p1', entries })
const played = (strokes: number, putts = 2): HoleEntry['fields'] => ({ strokes, putts })
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The other phone of the group (p3's), saving through the same door with its own session. */
async function otherPhoneSaves(hole: number, entries: Array<{ player_id: string; fields: Row; base: Row }>, mutation = `other-${hole}-${Math.random()}`) {
  if (!(server.tables.device_sessions ?? []).some((d) => d.auth_user_id === 'phone-b')) {
    server.tables.device_sessions = [...(server.tables.device_sessions ?? []), { auth_user_id: 'phone-b', player_id: 'p3', tournament_id: 't1' }]
  }
  const token = server.auth.sessionFor('phone-b')
  const reachable = server.reachable
  server.reachable = () => true
  try {
    const res = await server.fetch(`${server.url}/rest/v1/rpc/save_hole`, {
      method: 'POST',
      headers: { apikey: server.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: { round_id: 'r1', hole, mutation_id: mutation, entries } }),
    })
    return (await res.json()) as { status: string }
  } finally {
    server.reachable = reachable
  }
}

/** Re-stamp every queued item as saved before the session was confirmed (a cold open from the saved boards). */
async function markAllHeld(uid: string | null) {
  const d = _outboxTest.db()!
  for (const it of await d.items.toArray()) await d.items.put({ ...it, actingUid: uid })
  await _outboxTest.load()
}

/** The boards fetched while this phone still has no signal for its writes (another tab, a fetch that got through). */
async function reloadWithoutFlushing() {
  const reachable = server.reachable
  server.reachable = () => true
  try {
    await useTournament.getState().reload()
  } finally {
    server.reachable = reachable
  }
}

describe('V1: a correction never overtakes an older capture of the same hole that waits for the gate', () => {
  it('the correction (6) is what lands, after the older 5, and nobody is asked', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p2', fields: played(5), base: {} }])
    // Saved before this phone's session was confirmed (a cold open from the saved boards, its token expired).
    await markAllHeld(null)
    expect(onBoards('p2', 5)).toMatchObject({ strokes: 5 })
    // The session is confirmed; before the gate adopts, the player corrects p2 to 6, over the 5 the boards show.
    await saveHole(5, [{ player_id: 'p2', fields: { strokes: 6 }, base: { strokes: 5, putts: 2, picked_up: false } }])
    expect(onBoards('p2', 5)).toMatchObject({ strokes: 6 })
    phone.goOnline()
    await tick(300)
    await settle(useOutbox)
    // The correction waits behind the capture it was typed over: nothing went out yet.
    expect(calls()).toHaveLength(0)
    expect(useOutbox.getState().pending).toBe(2)
    // The gate confirms the player and adopts the older capture: both go, in the order they were typed.
    await adoptQueuedWrites('t1')
    await until(() => useOutbox.getState().pending === 0, 'everything to go out')
    await settle(useOutbox)
    expect(server.strokesWritten('p2', 5)).toEqual([5, 6])
    expect(server.score('p2', 5)).toMatchObject({ strokes: 6, putts: 2 })
    expect(onBoards('p2', 5)).toMatchObject({ strokes: 6 })
    expect(useOutbox.getState().conflicts).toEqual([])
    expect(useOutbox.getState().rejected).toEqual([])
  })

  it('an older capture that waits is never the one a conflicted correction is folded into', async () => {
    // The other phone has p2 at 7 on hole 5; this phone saw nothing, and its first capture (5) waits for the gate.
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p2', fields: played(5), base: {} }])
    await markAllHeld(null)
    await otherPhoneSaves(5, [{ player_id: 'p2', fields: played(7), base: {} }])
    // The correction to 6, typed over the 5 the boards showed.
    await saveHole(5, [{ player_id: 'p2', fields: { strokes: 6 }, base: { strokes: 5, putts: 2, picked_up: false } }])
    phone.goOnline()
    await adoptQueuedWrites('t1')
    await until(() => useOutbox.getState().pending === 0, 'everything to go out')
    await settle(useOutbox)
    // The 7 stands, and the player is asked about his latest value (6), never about the 5 he corrected.
    expect(server.score('p2', 5)).toMatchObject({ strokes: 7 })
    const asked = useOutbox.getState().conflicts.map((c) => ({ ...c.base, ...c.fields }))
    expect(asked).toEqual([expect.objectContaining({ strokes: 6 })])
  })
})

describe('V2: a hole of a round the Comité deleted', () => {
  it('goes to the rejected list once the boards come from the server, and no longer keeps the phone from signing out', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    server.tables.rounds = (server.tables.rounds ?? []).filter((r) => r.id !== 'r1')
    phone.goOnline()
    // save_hole answers not_member for a round that does not exist: held for the PIN.
    await until(() => useOutbox.getState().held === 1, 'held')
    await settle(useOutbox)
    expect(unsentWrites()).toMatchObject({ waitsFor: 'pin' })
    // The PIN again, as the gate does it: adopt (the boards still show the round, so it goes and is held again)…
    await adoptQueuedWrites('t1')
    await settle(useOutbox)
    await until(() => useOutbox.getState().held === 1, 'held again')
    // …then the boards from the server, without the round: the hole can never go out.
    await useTournament.getState().reload()
    expect(boards().rounds.some((r) => r.id === 'r1')).toBe(false)
    expect(await rejectGoneRounds('t1')).toBe(1)
    expect(unsentWrites()).toBeNull()
    expect(useOutbox.getState().pending).toBe(0)
    expect(useOutbox.getState().rejected).toEqual([expect.objectContaining({ key: 'score:r1:p1:5', message: t.sync.errRoundGone })])
    // Adopting again (the next PIN) finds nothing to send.
    const sent = calls().length
    await adoptQueuedWrites('t1')
    await settle(useOutbox)
    expect(calls()).toHaveLength(sent)
  })

  it('adopting after the server’s boards came rejects it before it goes', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    await markAllHeld(null)
    server.tables.rounds = (server.tables.rounds ?? []).filter((r) => r.id !== 'r1')
    await reloadWithoutFlushing()
    phone.goOnline()
    await adoptQueuedWrites('t1')
    await settle(useOutbox)
    expect(calls()).toHaveLength(0)
    expect(useOutbox.getState().rejected).toEqual([expect.objectContaining({ message: t.sync.errRoundGone })])
    expect(unsentWrites()).toBeNull()
  })

  it('a hole queued after the boards were fetched is never rejected for a round they lack (one created since)', async () => {
    // The boards were fetched before this hole: a round they do not list may be newer than them.
    await tick(5)
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }], 'r-new')
    expect(await rejectGoneRounds('t1')).toBe(0)
    await adoptQueuedWrites('t1')
    expect(useOutbox.getState().pending).toBe(1)
    expect(useOutbox.getState().rejected).toEqual([])
  })

  it('the boards from the phone’s copy (not the server) reject nothing', async () => {
    phone.goOffline()
    await saveHole(5, [{ player_id: 'p1', fields: played(5), base: {} }])
    const copy = structuredClone(boards())
    copy.rounds = []
    useTournament.setState({ source: null })
    useTournament.getState().seed('t1', copy, Date.now())
    expect(await rejectGoneRounds('t1')).toBe(0)
    expect(useOutbox.getState().pending).toBe(1)
  })
})

describe('the untouched-default rule (tarjeta cruzada) goes over nothing but a phone’s par and 2 putts', () => {
  it('a Comité correction of par and 2 putts is a claim: this phone is asked, and the correction stands', async () => {
    server.seed('scores', [{ round_id: 'r1', player_id: 'p3', hole: 8, strokes: 4, putts: 2, picked_up: false, entered_by: 'pz' }])
    // As admin_save_score leaves it (a phone's insert never carries a reason, so the seed drops it).
    server.score('p3', 8)!.reason = 'Corrección del Comité'
    // This phone typed p3's hole before it saw the correction (offline).
    await saveHole(8, [{ player_id: 'p3', fields: played(6), base: {}, dflt: { strokes: 4, putts: 2, picked_up: false } }])
    await until(() => useOutbox.getState().conflicts.length === 1, 'the question')
    await settle(useOutbox)
    expect(server.score('p3', 8)).toMatchObject({ strokes: 4, putts: 2, reason: 'Corrección del Comité' })
    expect(calls()).toHaveLength(1)
  })

  it('par and 3 putts the other phone typed is a value: this phone is asked, never sent over it', async () => {
    await otherPhoneSaves(4, [{ player_id: 'p3', fields: played(4, 3), base: {} }])
    await saveHole(4, [{ player_id: 'p3', fields: played(6), base: {}, dflt: { strokes: 4, putts: 2, picked_up: false } }])
    await until(() => useOutbox.getState().conflicts.length === 1, 'the question')
    await settle(useOutbox)
    expect(server.score('p3', 4)).toMatchObject({ strokes: 4, putts: 3, entered_by: 'p3' })
    expect(calls()).toHaveLength(1)
  })
})

describe('the boards while a hole waits', () => {
  it('show its fields over what they hold now: another phone’s change to a field it left alone shows', async () => {
    server.seed('scores', [{ round_id: 'r1', player_id: 'p2', hole: 4, strokes: 5, putts: 2, picked_up: false, entered_by: 'p3' }])
    await useTournament.getState().reload()
    phone.goOffline()
    // This phone corrects p2's strokes only, over the 5 and 2 it saw.
    await saveHole(4, [{ player_id: 'p2', fields: { strokes: 6 }, base: { strokes: 5, putts: 2, picked_up: false } }])
    // The other phone changes p2's putts to 3; the boards get it.
    await otherPhoneSaves(4, [{ player_id: 'p2', fields: { putts: 3 }, base: { strokes: 5, putts: 2, picked_up: false } }])
    await reloadWithoutFlushing()
    // 6 strokes (this phone's, waiting) and 3 putts (the other's): what the server will hold once it lands.
    expect(onBoards('p2', 4)).toMatchObject({ strokes: 6, putts: 3 })
    phone.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'the hole')
    await settle(useOutbox)
    expect(server.score('p2', 4)).toMatchObject({ strokes: 6, putts: 3 })
  })
})

describe('regressions the verifier checked', () => {
  it('a replayed answer older than the hole: the boards end on the newer value', async () => {
    let lose = true
    server.decide = async (req): Promise<Outcome> => {
      if (req.target !== 'rpc/save_hole' || req.as !== me || !lose) return 'answer'
      lose = false
      await server.fetch(`${server.url}/rest/v1/rpc/save_hole`, { method: 'POST', headers: { apikey: server.anonKey, Authorization: req.authorization ?? '', 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) })
      // While the answer is lost, the other phone changes p1 over the 5 it saw.
      await otherPhoneSaves(4, [{ player_id: 'p1', fields: { strokes: 7 }, base: { strokes: 5, putts: 2, picked_up: false } }])
      return 'offline'
    }
    await saveHole(4, [{ player_id: 'p1', fields: played(5), base: {} }])
    await until(() => useOutbox.getState().pending === 1 && !!useOutbox.getState().lastError, 'the lost answer')
    phone.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'the retry')
    await settle(useOutbox)
    // The replayed answer asks one more fetch, which says what stands.
    await tick(1500)
    await until(() => onBoards('p1', 4)?.strokes === 7, 'the boards to show 7', 20000)
    expect(server.score('p1', 4)).toMatchObject({ strokes: 7 })
  })

  it('a legacy direct write and a later hole of the same player go out in order, with no conflict', async () => {
    phone.goOffline()
    const legacy = { key: 'score:r1:p2:7', kind: 'score' as const, tournamentId: 't1', payload: holeScore('p2', 7, 6), attempts: 0, createdAt: 1, seq: 1000, actingUid: me }
    await _outboxTest.db()!.items.put(legacy)
    await _outboxTest.load()
    const seen = onBoards('p2', 7)!
    await saveHole(7, [{ player_id: 'p2', fields: { strokes: 5 }, base: { strokes: seen.strokes, putts: seen.putts, picked_up: seen.pickedUp } }])
    phone.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'both')
    await settle(useOutbox)
    expect(server.strokesWritten('p2', 7)).toEqual([6, 5])
    expect(useOutbox.getState().conflicts).toEqual([])
  })
})
