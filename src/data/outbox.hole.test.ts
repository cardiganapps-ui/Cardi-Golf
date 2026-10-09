/**
 * Outbox v2 (REL-05, PLAN §5.1): a group's hole goes out as one `save_hole`
 * call, with only the fields the phone set and the row it saw for each
 * player. Two phones on one card each saving a different player both land;
 * two on the same player, the second is asked instead of overwriting the
 * first; a retry after a lost answer is answered again, never applied twice;
 * nine holes kept offline go out in order when the signal returns; and a hole
 * queued by the previous build still goes out the way it was written.
 *
 * Real outbox and tournament store, and the app's real Supabase client,
 * entered as p1 with the PIN, against the fake server, whose save_hole is the
 * database's (src/data/testing/fakeSupabase.ts, cases/serverRules.json).
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Row } from './mappers'
import { gate, holeScore, enterAs, installFakePhone, settle, until, type Outcome } from './testing/fakePhone'

const { server, phone } = installFakePhone()
const { _outboxTest, adoptQueuedWrites, enqueueHole, keepTheirs, sendMineAgain, startOutbox, useOutbox } = await import('./outbox')
type HoleEntry = import('./outbox').HoleEntry
const { useTournament } = await import('./tournamentStore')
const { t } = await import('../i18n/es-MX')
const { closeCheck } = await import('../engine/close')

/** The user this phone is, holding p1 by the PIN. */
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
afterEach(() => {
  _outboxTest.reset()
})

const boards = () => useTournament.getState().data!.snapshot
const onBoards = (player: string, hole: number) => boards().scores.find((s) => s.roundId === 'r1' && s.playerId === player && s.hole === hole)
/** This phone's save_hole calls (the other phone's go through the same door). */
const calls = () => server.wire.filter((r) => r.target === 'rpc/save_hole' && r.as === me)

/** The hole as the Tarjeta queues it: per player the fields set and the row seen (`{}`: none). */
function saveHole(hole: number, entries: HoleEntry[]) {
  return enqueueHole('t1', { round_id: 'r1', hole, entered_by: 'p1', entries })
}
const played = (strokes: number, putts = 2): HoleEntry['fields'] => ({ strokes, putts })

/** The other phone of the group (p3's), saving through the same door with its own session. */
async function otherPhoneSaves(hole: number, entries: Array<{ player_id: string; fields: Row; base: Row }>, mutation = `other-${hole}-${entries.map((e) => e.player_id).join('')}`) {
  if (!(server.tables.device_sessions ?? []).some((d) => d.auth_user_id === 'phone-b')) {
    server.tables.device_sessions = [...(server.tables.device_sessions ?? []), { auth_user_id: 'phone-b', player_id: 'p3', tournament_id: 't1' }]
  }
  const token = server.auth.sessionFor('phone-b')
  // The other phone has signal, whatever this one has.
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

/** What the Comité's «Pendientes de revisar» lists after it (0028 `rejected_inbox`), read as the Comité with its own session. */
async function comiteInbox(): Promise<Row[]> {
  server.tables.tournament_organizers = [{ tournament_id: 't1', auth_user_id: 'comite', role: 'owner' }]
  const reachable = server.reachable
  server.reachable = () => true
  try {
    const res = await server.fetch(`${server.url}/rest/v1/rpc/rejected_inbox`, {
      method: 'POST',
      headers: { apikey: server.anonKey, Authorization: `Bearer ${server.auth.sessionFor('comite')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_tournament_id: 't1' }),
    })
    return (await res.json()) as Row[]
  } finally {
    server.reachable = reachable
  }
}

describe('two phones on one card (REL-05)', () => {
  it('each touching a different player: both land, and neither overwrites the other', async () => {
    // This phone saw hole 4 empty; its player touched p1, and the other three go as the defaults nobody touched.
    phone.goOffline()
    await saveHole(4, [
      { player_id: 'p1', fields: played(5), base: {} },
      { player_id: 'p2', fields: played(4), base: {}, auto: true },
      { player_id: 'p3', fields: played(4), base: {}, auto: true },
      { player_id: 'p4', fields: played(4), base: {}, auto: true },
    ])
    // Meanwhile the other phone saved p3 and p4 as they really went.
    expect((await otherPhoneSaves(4, [{ player_id: 'p3', fields: played(7, 3), base: {} }, { player_id: 'p4', fields: played(6), base: {} }])).status).toBe('ok')
    phone.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'the hole to go out')
    await settle(useOutbox)
    expect(server.score('p1', 4)).toMatchObject({ strokes: 5, entered_by: 'p1' })
    expect(server.score('p2', 4)).toMatchObject({ strokes: 4, entered_by: 'p1' })
    // The other phone's values stand, on the server and on this phone's boards.
    expect(server.score('p3', 4)).toMatchObject({ strokes: 7, putts: 3, entered_by: 'p3' })
    expect(server.score('p4', 4)).toMatchObject({ strokes: 6, entered_by: 'p3' })
    expect(onBoards('p3', 4)).toMatchObject({ strokes: 7, putts: 3 })
    // Defaults nobody touched take the server's value without asking.
    expect(useOutbox.getState().conflicts).toEqual([])
    expect(useOutbox.getState().rejected).toEqual([])
    expect(calls()).toHaveLength(1)
  })

  it('each changing a different field of one player: both changes stand', async () => {
    server.seed('scores', [{ round_id: 'r1', player_id: 'p2', hole: 6, strokes: 5, putts: 2, picked_up: false, entered_by: 'p2' }])
    await useTournament.getState().reload()
    phone.goOffline()
    await saveHole(6, [{ player_id: 'p2', fields: { strokes: 4 }, base: { strokes: 5, putts: 2, picked_up: false } }])
    await otherPhoneSaves(6, [{ player_id: 'p2', fields: { putts: 1 }, base: { strokes: 5, putts: 2, picked_up: false } }])
    phone.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'the hole to go out')
    expect(server.score('p2', 6)).toMatchObject({ strokes: 4, putts: 1 })
    expect(useOutbox.getState().conflicts).toEqual([])
  })

  it('each keeping the other pair, the first one’s untouched defaults do not hold up the second: its values go over them, flagged', async () => {
    // Tarjeta cruzada: the other phone saved its pair's players (p1, p2 here) and, untouched, par for p3 and p4.
    await otherPhoneSaves(4, [
      { player_id: 'p1', fields: played(6), base: {} },
      { player_id: 'p2', fields: played(5, 1), base: {} },
      { player_id: 'p3', fields: played(4), base: {} },
      { player_id: 'p4', fields: played(4), base: {} },
    ])
    // This phone saw the hole empty: p3 and p4 typed, p1 and p2 its own untouched defaults.
    const dflt = { strokes: 4, putts: 2, picked_up: false }
    await saveHole(4, [
      { player_id: 'p1', fields: played(4), base: {}, auto: true, dflt },
      { player_id: 'p2', fields: played(4), base: {}, auto: true, dflt },
      { player_id: 'p3', fields: played(7, 3), base: {}, dflt },
      { player_id: 'p4', fields: played(5), base: {}, dflt },
    ])
    await until(() => useOutbox.getState().pending === 0, 'both saves')
    await settle(useOutbox)
    // Each phone's typed values stand; the defaults they replaced are kept as a discrepancy, for the card's signature.
    expect(server.score('p1', 4)).toMatchObject({ strokes: 6, entered_by: 'p3', disputed: false })
    expect(server.score('p2', 4)).toMatchObject({ strokes: 5, putts: 1, entered_by: 'p3' })
    expect(server.score('p3', 4)).toMatchObject({ strokes: 7, putts: 3, entered_by: 'p1', disputed: true, previous: { strokes: 4, entered_by: 'p3' } })
    expect(server.score('p4', 4)).toMatchObject({ strokes: 5, entered_by: 'p1', disputed: true })
    expect(onBoards('p3', 4)).toMatchObject({ strokes: 7, putts: 3 })
    expect(onBoards('p1', 4)).toMatchObject({ strokes: 6 })
    expect(useOutbox.getState().conflicts).toEqual([])
    // The first call met the defaults; the second went over them, as the rows then stood.
    const sent = calls().map((r) => (r.body as { p: { entries: Array<{ player_id: string; base: Row }> } }).p.entries)
    expect(sent).toHaveLength(2)
    // The untouched defaults go out saying so; the typed values do not (0028).
    expect(sent[0]).toEqual([
      { player_id: 'p1', fields: { strokes: 4, putts: 2 }, base: {}, auto: true },
      { player_id: 'p2', fields: { strokes: 4, putts: 2 }, base: {}, auto: true },
      { player_id: 'p3', fields: { strokes: 7, putts: 3 }, base: {} },
      { player_id: 'p4', fields: { strokes: 5, putts: 2 }, base: {} },
    ])
    expect(sent[1]).toEqual([
      { player_id: 'p3', fields: { strokes: 7, putts: 3 }, base: dflt },
      { player_id: 'p4', fields: { strokes: 5, putts: 2 }, base: dflt },
    ])
    // REL-08: the server kept the four conflicts as its record, and the Comité is asked about none of them: the phone
    // settled each one itself. Nothing holds «Cerrar torneo».
    expect(server.tables.rejected_writes?.filter((r) => r.reason === 'conflict' && r.status === 'open')).toHaveLength(4)
    const inbox = await comiteInbox()
    expect(inbox).toEqual([])
    const d = useTournament.getState().data!
    expect(closeCheck(d.snapshot, d.settings, { finishLiveRounds: true, openRejected: inbox.length }).blockers.map((b) => b.kind)).not.toContain('rejectedWrites')
  })

  it('a value the other phone typed (not par and 2 putts) is never gone over: this phone is asked', async () => {
    await otherPhoneSaves(4, [{ player_id: 'p3', fields: played(5), base: {} }])
    await saveHole(4, [{ player_id: 'p3', fields: played(7, 3), base: {}, dflt: { strokes: 4, putts: 2, picked_up: false } }])
    await until(() => useOutbox.getState().conflicts.length === 1, 'the question')
    expect(server.score('p3', 4)).toMatchObject({ strokes: 5, entered_by: 'p3' })
    expect(calls()).toHaveLength(1)
  })

  it('both on the same player: the second is asked, and the first value stays', async () => {
    phone.goOffline()
    await saveHole(4, [{ player_id: 'p2', fields: played(5), base: {} }])
    await otherPhoneSaves(4, [{ player_id: 'p2', fields: played(6), base: {} }])
    phone.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'the hole to go out')
    await settle(useOutbox)
    expect(server.score('p2', 4)).toMatchObject({ strokes: 6, entered_by: 'p3' })
    expect(server.strokesWritten('p2', 4)).toEqual([6])
    // The server's row is on the boards, and the phone holds what it had, to ask.
    expect(onBoards('p2', 4)).toMatchObject({ strokes: 6 })
    const [c] = useOutbox.getState().conflicts
    expect(c).toMatchObject({ player_id: 'p2', hole: 4, fields: { strokes: 5, putts: 2 }, clash: ['strokes'], server: { strokes: 6, entered_by: 'p3' } })
    expect(useOutbox.getState().rejected).toEqual([])
    // Kept for the Comité too (REL-08).
    expect(server.tables.rejected_writes).toEqual([expect.objectContaining({ player_id: 'p2', reason: 'conflict', auth_user_id: me })])
  })

  it('«Guardar el mío» sends this phone’s value again over the row it now sees, and it lands', async () => {
    await otherPhoneSaves(4, [{ player_id: 'p2', fields: played(6), base: {} }])
    await saveHole(4, [{ player_id: 'p2', fields: played(5), base: {} }])
    await until(() => useOutbox.getState().conflicts.length === 1, 'the conflict')
    await sendMineAgain(useOutbox.getState().conflicts[0]!.key, 'p1')
    await until(() => useOutbox.getState().pending === 0, 'the second save')
    expect(server.score('p2', 4)).toMatchObject({ strokes: 5, entered_by: 'p1' })
    expect(useOutbox.getState().conflicts).toEqual([])
    const sent = calls().map((r) => (r.body as { p: { mutation_id: string; entries: Array<{ base: Row }> } }).p)
    // A new mutation, whose base is the server's row.
    expect(new Set(sent.map((p) => p.mutation_id)).size).toBe(2)
    expect(sent[1]!.entries[0]!.base).toEqual({ strokes: 6, putts: 2, picked_up: false })
  })

  it('«Dejar el suyo» leaves the server’s value and sends nothing', async () => {
    await otherPhoneSaves(4, [{ player_id: 'p2', fields: played(6), base: {} }])
    await saveHole(4, [{ player_id: 'p2', fields: played(5), base: {} }])
    await until(() => useOutbox.getState().conflicts.length === 1, 'the conflict')
    await keepTheirs(useOutbox.getState().conflicts[0]!.key)
    expect(useOutbox.getState().conflicts).toEqual([])
    expect(calls()).toHaveLength(1)
    expect(server.score('p2', 4)).toMatchObject({ strokes: 6 })
  })

  it('a conflict survives a restart of the app', async () => {
    await otherPhoneSaves(4, [{ player_id: 'p2', fields: played(6), base: {} }])
    await saveHole(4, [{ player_id: 'p2', fields: played(5), base: {} }])
    await until(() => useOutbox.getState().conflicts.length === 1, 'the conflict')
    _outboxTest.reset()
    expect(useOutbox.getState().conflicts).toEqual([])
    await _outboxTest.load()
    expect(useOutbox.getState().conflicts).toMatchObject([{ player_id: 'p2', hole: 4 }])
  })
})

describe('a mutation id: a retry is answered, never applied twice', () => {
  it('the answer lost on the way back: the retry gets the same answer, and the hole is written once', async () => {
    let lose = true
    server.decide = async (req): Promise<Outcome> => {
      if (req.target !== 'rpc/save_hole' || !lose) return 'answer'
      lose = false
      // The server takes it (the same request, as it arrived), and the answer never reaches the phone.
      await server.fetch(`${server.url}/rest/v1/rpc/save_hole`, { method: 'POST', headers: { apikey: server.anonKey, Authorization: req.authorization ?? '', 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) })
      return 'offline'
    }
    await saveHole(4, [{ player_id: 'p1', fields: played(5), base: {} }])
    await until(() => useOutbox.getState().lastError === t.sync.errNetwork, 'the lost answer')
    expect(useOutbox.getState().pending).toBe(1)
    // The retry goes once the backoff passes, or the signal comes back.
    phone.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'the retry')
    const ids = calls().map((r) => (r.body as { p: { mutation_id: string } }).p.mutation_id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(1)
    expect(server.strokesWritten('p1', 4)).toEqual([5])
    expect(server.score('p1', 4)).toMatchObject({ strokes: 5, version: 1 })
    expect(onBoards('p1', 4)).toMatchObject({ strokes: 5 })
    expect(useOutbox.getState().conflicts).toEqual([])
    expect(useOutbox.getState().rejected).toEqual([])
  })

  it('an answer it cannot read is no answer: the hole stays queued, and goes again', async () => {
    let garbled = true
    server.decide = (req) => {
      if (req.target !== 'rpc/save_hole' || !garbled) return 'answer'
      garbled = false
      return { status: 200, body: null }
    }
    await saveHole(4, [{ player_id: 'p1', fields: played(5), base: {} }])
    await until(() => useOutbox.getState().lastError === t.sync.errNetwork, 'the unreadable answer')
    expect(useOutbox.getState().pending).toBe(1)
    expect(useOutbox.getState().rejected).toEqual([])
    phone.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'the retry')
    expect(server.score('p1', 4)).toMatchObject({ strokes: 5 })
  })

  it('a refusal of the call itself (22023) goes to the rejected list, and is not sent again', async () => {
    server.decide = (req) => (req.target === 'rpc/save_hole' ? { status: 400, body: { code: '22023', details: null, hint: null, message: 'Ese guardado ya llegó antes con otros datos; vuelve a guardarlo' } } : 'answer')
    await saveHole(4, [{ player_id: 'p1', fields: played(5), base: {} }, { player_id: 'p2', fields: played(4), base: {} }])
    await until(() => useOutbox.getState().rejected.length === 2, 'the refusal')
    await settle(useOutbox)
    expect(useOutbox.getState().pending).toBe(0)
    expect(useOutbox.getState().rejected.map((r) => r.message)).toEqual([t.sync.errInvalid, t.sync.errInvalid])
    // Kept as the whole row the phone meant, under the hole's key.
    expect(useOutbox.getState().rejected[0]).toMatchObject({ key: 'score:r1:p1:4', kind: 'score', payload: { player_id: 'p1', hole: 4, strokes: 5, putts: 2, picked_up: false } })
    expect(calls()).toHaveLength(1)
  })
})

describe('refusals by code', () => {
  it('a privilege the server refuses (42501) is for good: rejected, not sent again', async () => {
    server.decide = (req) => (req.target === 'rpc/save_hole' ? { status: 403, body: { code: '42501', details: null, hint: null, message: 'permission denied for function save_hole' } } : 'answer')
    await saveHole(4, [{ player_id: 'p1', fields: played(5), base: {} }])
    await until(() => useOutbox.getState().rejected.length === 1, 'the refusal')
    await settle(useOutbox)
    expect(useOutbox.getState().rejected[0]!.message).toBe(t.sync.errDenied)
    expect(calls()).toHaveLength(1)
  })
})

describe('the queue', () => {
  it('a hole IndexedDB no longer holds (another tab sent it, or the storage was cleared) still goes, under its mutation id', async () => {
    phone.goOffline()
    await saveHole(4, [{ player_id: 'p1', fields: played(5), base: {} }])
    await _outboxTest.db()!.items.clear()
    phone.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'the hole')
    expect(server.score('p1', 4)).toMatchObject({ strokes: 5 })
    expect(calls()).toHaveLength(1)
  })

  it('nine holes saved with no signal go out in order when it returns, one call each', async () => {
    phone.goOffline()
    for (let h = 1; h <= 9; h++) await saveHole(h, [{ player_id: 'p1', fields: played(4 + (h % 3)), base: {} }, { player_id: 'p2', fields: played(5), base: {} }])
    expect(useOutbox.getState().pendingHoles).toBe(9)
    expect(calls()).toHaveLength(0)
    phone.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'the nine holes')
    expect(calls().map((r) => (r.body as { p: { hole: number } }).p.hole)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    for (let h = 1; h <= 9; h++) expect(server.score('p1', h)).toMatchObject({ strokes: 4 + (h % 3) })
    expect(useOutbox.getState().rejected).toEqual([])
    expect(await _outboxTest.stored()).toEqual([])
  })

  it('a hole corrected before it went out is one call, field by field over what was queued', async () => {
    phone.goOffline()
    await saveHole(4, [{ player_id: 'p1', fields: played(5), base: {} }, { player_id: 'p2', fields: played(4), base: {} }])
    // A correction of p1's putts, and p3 added: the boards show the queued hole, and that is what it was typed over.
    await saveHole(4, [{ player_id: 'p1', fields: { putts: 1 }, base: { strokes: 5, putts: 2, picked_up: false } }, { player_id: 'p3', fields: played(6), base: {} }])
    expect(_outboxTest.queue()).toHaveLength(1)
    expect(onBoards('p1', 4)).toMatchObject({ strokes: 5, putts: 1 })
    phone.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'the hole')
    const [call] = calls().map((r) => (r.body as { p: { entries: unknown[] } }).p)
    expect(call!.entries).toEqual([
      { player_id: 'p1', fields: { strokes: 5, putts: 1 }, base: {} },
      { player_id: 'p2', fields: { strokes: 4, putts: 2 }, base: {} },
      { player_id: 'p3', fields: { strokes: 6, putts: 2 }, base: {} },
    ])
    expect(server.score('p1', 4)).toMatchObject({ strokes: 5, putts: 1 })
    expect(useOutbox.getState().conflicts).toEqual([])
  })

  it('a hole already on its way is never touched: the correction queues behind it and lands after it', async () => {
    const held = gate()
    server.decide = async (req): Promise<Outcome> => {
      if (req.target === 'rpc/save_hole' && calls().length === 1) await held.wait
      return 'answer'
    }
    await saveHole(4, [{ player_id: 'p1', fields: played(5), base: {} }])
    await until(() => calls().length === 1, 'the first call to go out')
    const first = structuredClone(_outboxTest.queue()[0]!)
    // Typed over the hole the boards show (this phone's 5).
    await saveHole(4, [{ player_id: 'p1', fields: { strokes: 6 }, base: { strokes: 5, putts: 2, picked_up: false } }])
    expect(_outboxTest.queue()).toHaveLength(2)
    expect(_outboxTest.queue()[0]).toEqual(first)
    held.open()
    await until(() => useOutbox.getState().pending === 0, 'both')
    expect(server.strokesWritten('p1', 4)).toEqual([5, 6])
    expect(useOutbox.getState().conflicts).toEqual([])
    expect(onBoards('p1', 4)).toMatchObject({ strokes: 6 })
  })

  it('a hole on its way meets another phone’s value while its correction waits: the correction carries both, and asks', async () => {
    const held = gate()
    server.decide = async (req): Promise<Outcome> => {
      if (req.target === 'rpc/save_hole' && req.as === me && calls().length === 1) await held.wait
      return 'answer'
    }
    const dflt = { strokes: 4, putts: 2, picked_up: false }
    await saveHole(4, [{ player_id: 'p2', fields: played(5), base: {}, dflt }])
    await until(() => calls().length === 1, 'the first call to go out')
    // The other phone saves p2 first; then this phone corrects only his putts, typed over its own 5.
    await otherPhoneSaves(4, [{ player_id: 'p2', fields: played(6), base: {} }])
    await saveHole(4, [{ player_id: 'p2', fields: { putts: 1 }, base: { strokes: 5, putts: 2, picked_up: false }, dflt }])
    held.open()
    await until(() => useOutbox.getState().pending === 0, 'both')
    await settle(useOutbox)
    // Neither the 5 nor the 1 went over the other phone's 6: one question, with both of this phone's values.
    expect(server.score('p2', 4)).toMatchObject({ strokes: 6, putts: 2, entered_by: 'p3' })
    expect(useOutbox.getState().conflicts).toMatchObject([{ player_id: 'p2', fields: { strokes: 5, putts: 1 }, base: {} }])
    const second = (calls()[1]!.body as { p: { entries: unknown[] } }).p.entries
    expect(second).toEqual([{ player_id: 'p2', fields: { strokes: 5, putts: 1 }, base: {} }])
  })

  it('a hole the previous build queued (one direct write per player) still goes out as it was written', async () => {
    phone.goOffline()
    // As the previous build left it on the phone: a `score` item, under this phone's session.
    const legacy = { key: 'score:r1:p2:7', kind: 'score' as const, tournamentId: 't1', payload: holeScore('p2', 7, 6), attempts: 1, createdAt: 1, seq: 1000, actingUid: me }
    await _outboxTest.db()!.items.put(legacy)
    await _outboxTest.load()
    // And one this build queued after it.
    await saveHole(8, [{ player_id: 'p2', fields: played(5), base: {} }])
    expect(useOutbox.getState().pendingHoles).toBe(2)
    phone.goOnline()
    await until(() => useOutbox.getState().pending === 0, 'both to go out')
    expect(server.wire.filter((r) => r.method !== 'GET' && r.target !== 'auth/token').map((r) => r.target)).toEqual(['scores', 'rpc/save_hole'])
    expect(server.score('p2', 7)).toMatchObject({ strokes: 6, entered_by: 'p1' })
    expect(server.score('p2', 8)).toMatchObject({ strokes: 5, entered_by: 'p1' })
    expect(useOutbox.getState().rejected).toEqual([])
  })
})

describe('what the server did not take', () => {
  it('a player whose card is signed is refused with the reason; the rest of the hole lands', async () => {
    server.seed('card_signatures', [{ round_id: 'r1', pair_id: 'pb', signed_by: 'p1' }])
    await saveHole(4, [{ player_id: 'p1', fields: played(5), base: {} }, { player_id: 'p3', fields: played(4), base: {} }])
    await until(() => useOutbox.getState().pending === 0, 'the hole')
    await settle(useOutbox)
    expect(server.score('p1', 4)).toMatchObject({ strokes: 5 })
    expect(server.score('p3', 4)).toBeUndefined()
    expect(useOutbox.getState().rejected).toEqual([expect.objectContaining({ key: 'score:r1:p3:4', message: t.sync.errSigned, atServer: true })])
    expect(onBoards('p3', 4)).toBeUndefined()
    // REL-08: kept on the server too, for the Comité's «Pendientes de revisar»; the phone's line says so.
    expect(server.tables.rejected_writes).toEqual([expect.objectContaining({ player_id: 'p3', hole: 4, reason: 'card_signed', status: 'open' })])
    // A value a person typed: the Comité is asked about it.
    expect((await comiteInbox()).map((r) => [r.player_id, r.reason])).toEqual([['p3', 'card_signed']])
  })

  it('an untouched default the server refused is nobody\'s capture: kept as sent, but the Comité is not asked and the phone does not say it went there', async () => {
    server.seed('card_signatures', [{ round_id: 'r1', pair_id: 'pb', signed_by: 'p1' }])
    await saveHole(5, [
      { player_id: 'p1', fields: played(5), base: {} },
      { player_id: 'p4', fields: played(4), base: {}, auto: true },
    ])
    await until(() => useOutbox.getState().pending === 0, 'the hole')
    await settle(useOutbox)
    expect(server.score('p1', 5)).toMatchObject({ strokes: 5 })
    expect(server.tables.rejected_writes).toEqual([expect.objectContaining({ player_id: 'p4', hole: 5, reason: 'card_signed', payload: expect.objectContaining({ auto: true }) })])
    expect(await comiteInbox()).toEqual([])
    expect(useOutbox.getState().rejected).toEqual([expect.not.objectContaining({ atServer: true })])
  })

  it('a phone that holds no player any more: the hole waits for the PIN, and goes once the player is back', async () => {
    const claims = server.tables.device_sessions
    server.tables.device_sessions = (claims ?? []).filter((d) => d.auth_user_id !== me)
    await saveHole(4, [{ player_id: 'p1', fields: played(5), base: {} }])
    await until(() => useOutbox.getState().held === 1, 'the hole to be held')
    await settle(useOutbox)
    expect(useOutbox.getState().rejected).toEqual([])
    expect(useOutbox.getState().lastError).toBe(t.sync.errNotMember)
    expect(server.score('p1', 4)).toBeUndefined()
    // The PIN again: the claim is back, and the gate adopts what waited.
    server.tables.device_sessions = claims ?? []
    await adoptQueuedWrites('t1')
    await until(() => useOutbox.getState().pending === 0, 'the hole')
    expect(server.score('p1', 4)).toMatchObject({ strokes: 5 })
  })
})
