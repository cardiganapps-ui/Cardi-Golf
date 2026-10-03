/**
 * REL-11, PERF-07: a saved hole reaches the other phones from the event
 * itself, without the whole tournament downloaded again (22 requests); a
 * structural change still reloads; another tournament's changes cost
 * nothing; and no fetch, switch or leave ever takes a change back or puts
 * one where it does not belong. The cases PR #92's verifier found, each
 * failing before its fix, and one for each mutant that survived.
 */
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../dev/fixtures'
import type { Row } from './mappers'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { snapshotToRows } from './testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))

const { useTournament, HEAL_MS } = await import('./tournamentStore')
const { clearAllCached, clearCached } = await import('./snapshotCache')

const fx = getFixture('full12-live')!
const TID = fx.snapshot.tournament.id
const store = () => useTournament.getState()
/** Snapshot reads so far: each one starts with the tournament's row. */
const reads = () => server.requests.filter((r) => r.table === 'tournaments').length
/** Every request the server saw, any table. */
const requests = () => server.requests.length
const channel = () => server.channels.at(-1)!
const emitOn = (ch: FakeSupabase['channels'][number], table: string, payload: Record<string, unknown>) => ch.bindings.get(table)!(payload)
const emit = (table: string, payload: Record<string, unknown>) => emitOn(channel(), table, payload)
const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
const group = fx.snapshot.groups.find((g) => g.roundId === round.id)!
const scoreOf = (playerId: string, hole: number) => store().data!.snapshot.scores.find((x) => x.roundId === round.id && x.playerId === playerId && x.hole === hole)
const scoreRow = (playerId: string, hole: number, strokes: number) => ({ id: `live-${playerId}-${hole}`, round_id: round.id, player_id: playerId, hole, strokes, putts: 1, picked_up: false, updated_at: '2027-04-09T12:00:00Z', disputed: false })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ready = async () => {
  const n = reads()
  await store().load(TID)
  expect(store().error).toBeNull()
  channel().status!('SUBSCRIBED')
  // Coming up live fetches what was missed: let that settle before counting.
  await vi.waitFor(() => expect(reads()).toBe(n + 2))
}

/** A second tenant on the same server: another fixture with its ids prefixed. */
function remap(rows: Record<string, Row[]>, pfx: string): Record<string, Row[]> {
  const out: Record<string, Row[]> = {}
  for (const [table, list] of Object.entries(rows)) {
    out[table] = list.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && (k === 'id' || (k.endsWith('_id') && k !== 'game_id')) ? pfx + v : v])))
  }
  return out
}
function merge(a: Record<string, Row[]>, b: Record<string, Row[]>): Record<string, Row[]> {
  const out: Record<string, Row[]> = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = [...(out[k] ?? []), ...v]
  return out
}
const Y = 'Y:' + getFixture('minimal4-live')!.snapshot.tournament.id

beforeEach(async () => {
  server = fakeSupabase(merge(snapshotToRows(fx.snapshot), remap(snapshotToRows(getFixture('minimal4-live')!.snapshot), 'Y:')))
  await ready()
})
afterEach(() => {
  store().unsubscribe()
  vi.useRealTimers()
  useTournament.setState({ tournamentId: null, loading: false, error: null, data: null, realtime: 'off', updatedAt: 0, source: null, keepOnPhone: true })
})

describe('a hole saved on another phone', () => {
  it('four rows of a foursome: one recompute, and not one request', async () => {
    vi.useFakeTimers()
    const before = requests()
    const shown = store().data
    for (const playerId of group.playerIds) emit('scores', { eventType: 'UPDATE', new: scoreRow(playerId, 18, 3), old: {} })
    // Taken together: nothing moves until the four are in.
    expect(store().data).toBe(shown)
    await vi.advanceTimersByTimeAsync(40)
    expect(store().data).not.toBe(shown)
    for (const playerId of group.playerIds) expect(scoreOf(playerId, 18)).toMatchObject({ strokes: 3, putts: 1 })
    // The engine ran on them: the boards moved.
    expect(store().data!.state).not.toBe(shown!.state)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(requests()).toBe(before)
  })

  it('what the screen held does not move under the change: the next boards are new objects', async () => {
    vi.useFakeTimers()
    const shown = store().data!
    const copy = JSON.stringify([shown.snapshot, shown.base])
    emit('scores', { eventType: 'UPDATE', new: scoreRow(group.playerIds[0]!, 17, 2), old: {} })
    await vi.advanceTimersByTimeAsync(40)
    expect(scoreOf(group.playerIds[0]!, 17)).toMatchObject({ strokes: 2 })
    expect(JSON.stringify([shown.snapshot, shown.base])).toBe(copy)
  })

  it('the boards read as fresh as the change on server data; a copy from the phone keeps its own age', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2027-04-09T12:00:00Z'))
    useTournament.setState({ updatedAt: 1 })
    emit('scores', { eventType: 'UPDATE', new: scoreRow(group.playerIds[1]!, 16, 4), old: {} })
    await vi.advanceTimersByTimeAsync(40)
    expect(store().updatedAt).toBe(Date.parse('2027-04-09T12:00:00Z') + 40)
    useTournament.setState({ updatedAt: 1, source: 'cache' })
    emit('scores', { eventType: 'UPDATE', new: scoreRow(group.playerIds[1]!, 15, 4), old: {} })
    await vi.advanceTimersByTimeAsync(40)
    expect(scoreOf(group.playerIds[1]!, 15)).toMatchObject({ strokes: 4 })
    expect(store().updatedAt).toBe(1)
  })

  it('the server’s rows with the change are kept on the phone', async () => {
    emit('scores', { eventType: 'UPDATE', new: scoreRow(group.playerIds[2]!, 14, 7), old: {} })
    await sleep(1700)
    const db = new Dexie('cardi-golf-cache')
    db.version(1).stores({ entries: 'slug, tournamentId', snapshots: 'tournamentId' })
    const kept = (await db.table('snapshots').get(TID)) as { snapshot: { scores: Array<{ roundId: string; playerId: string; hole: number; strokes: number }> } } | undefined
    db.close()
    expect(kept?.snapshot.scores.find((x) => x.roundId === round.id && x.playerId === group.playerIds[2] && x.hole === 14)?.strokes).toBe(7)
  })

  it('a payload that comes with errors is not applied: the tournament reloads', async () => {
    vi.useFakeTimers()
    const before = reads()
    const was = scoreOf(group.playerIds[0]!, 13)?.strokes ?? null
    emit('scores', { eventType: 'UPDATE', new: scoreRow(group.playerIds[0]!, 13, 9), old: {}, errors: ['Error 401: Unauthorized'] })
    await vi.advanceTimersByTimeAsync(250)
    expect(reads()).toBe(before + 1)
    expect(scoreOf(group.playerIds[0]!, 13)?.strokes ?? null).toBe(was)
  })

  it('a structural change (a group redrawn) reloads once, and is never applied as a row', async () => {
    vi.useFakeTimers()
    const before = reads()
    const g = server.tables.groups!.find((x) => x.id === group.id)!
    const members = store().data!.snapshot.groups.find((x) => x.id === group.id)!.playerIds
    emit('groups', { eventType: 'UPDATE', new: { ...g, tee_time: '09:20' }, old: {} })
    await vi.advanceTimersByTimeAsync(200)
    expect(reads()).toBe(before + 1)
    expect(store().data!.snapshot.groups.find((x) => x.id === group.id)!.playerIds).toEqual(members)
  })
})

describe('a day or lot this phone has not loaded', () => {
  it('its score waits instead of reloading, and lands with the day when the day’s own change brings it', async () => {
    vi.useFakeTimers()
    const before = reads()
    const r3 = { id: 'r3-new', tournament_id: TID, number: 3, date: '2027-04-11', course_id: round.courseId, holes: 18, status: 'live' }
    emit('scores', { eventType: 'INSERT', new: { ...scoreRow(group.playerIds[0]!, 1, 4), id: 'r3-score', round_id: r3.id }, old: {} })
    await vi.advanceTimersByTimeAsync(250)
    expect(reads()).toBe(before)
    server.tables.rounds!.push(r3)
    emit('rounds', { eventType: 'INSERT', new: r3, old: {} })
    await vi.advanceTimersByTimeAsync(250)
    expect(reads()).toBe(before + 1)
    expect(store().data!.snapshot.scores.find((x) => x.roundId === r3.id && x.hole === 1)).toMatchObject({ strokes: 4 })
  })

  it('five holes saved in another tournament (an account in two of them) cost nothing', async () => {
    vi.useFakeTimers()
    const before = requests()
    const shown = store().data
    for (let i = 0; i < 5; i++) {
      emit('scores', { eventType: 'UPDATE', new: { id: `o-${i}`, round_id: 'other-round', player_id: 'other-player', hole: i + 1, strokes: 4, putts: 2, picked_up: false, updated_at: '2027-04-09T12:00:00+00:00', disputed: false }, old: {} })
      await vi.advanceTimersByTimeAsync(1000)
    }
    expect(requests()).toBe(before)
    expect(store().data).toBe(shown)
  })

  it('a score deleted anywhere on the platform (deletes are not filtered) costs nothing; one of ours goes', async () => {
    vi.useFakeTimers()
    const before = requests()
    emit('scores', { eventType: 'DELETE', new: {}, old: { id: 'a-score-of-some-other-tournament' } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(requests()).toBe(before)
    const ours = store().data!.base.scores.find((x) => x.roundId === round.id)!
    expect(ours.id).toBeTruthy()
    emit('scores', { eventType: 'DELETE', new: {}, old: { id: ours.id } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(requests()).toBe(before)
    expect(store().data!.snapshot.scores.some((x) => x.roundId === ours.roundId && x.playerId === ours.playerId && x.hole === ours.hole)).toBe(false)
  })

  it('a payment of another tournament changes nothing and asks for nothing', async () => {
    vi.useFakeTimers()
    const before = requests()
    const shown = store().data
    emit('payments', { eventType: 'INSERT', new: { id: 'elsewhere', tournament_id: 'other', from_player_id: 'x', to_player_id: null, amount: 100, kind: 'entry', paid: true }, old: {} })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(store().data).toBe(shown)
    expect(requests()).toBe(before)
  })
})

describe('a fetch on its way when a change lands', () => {
  it('a reload does not take the change back: what it read before the change is corrected with it', async () => {
    const playerId = group.playerIds[0]!
    // A reload starts (the phone woke up) and its answer is slow.
    const slow = server.hold()
    const reload = store().reload()
    await slow.received
    // Meanwhile another phone saves hole 17, which the reload read before it was saved
    // (here: the server's table never gets it, as when the read came first).
    emit('scores', { eventType: 'UPDATE', new: scoreRow(playerId, 17, 2), old: {} })
    await vi.waitFor(() => expect(scoreOf(playerId, 17)).toMatchObject({ strokes: 2 }))
    slow.release()
    await reload
    expect(scoreOf(playerId, 17)).toMatchObject({ strokes: 2 })
  })

  it('a reload never re-applies a change it already read past', async () => {
    const playerId = group.playerIds[1]!
    emit('scores', { eventType: 'UPDATE', new: scoreRow(playerId, 12, 2), old: {} })
    await vi.waitFor(() => expect(scoreOf(playerId, 12)).toMatchObject({ strokes: 2 }))
    // Later the server has 3 for that hole, and its event was lost: the next fetch brings 3.
    const row = server.tables.scores!.find((x) => x.round_id === round.id && x.player_id === playerId && x.hole === 12)
    if (row) row.strokes = 3
    else server.tables.scores!.push({ ...scoreRow(playerId, 12, 3), id: 'srv-12' })
    await store().reload()
    expect(scoreOf(playerId, 12)).toMatchObject({ strokes: 3 })
  })

  it('a load of the same tournament (the gate resolving again) does not take back a payment marked meanwhile', async () => {
    const pay = server.tables.payments![0]!
    const target = !pay.paid
    const slow = server.hold()
    const loading = store().load(TID)
    await slow.received
    pay.paid = target
    emit('payments', { eventType: 'UPDATE', new: structuredClone(pay), old: {} })
    await vi.waitFor(() => expect(store().data!.snapshot.payments.find((p) => p.id === pay.id)?.paid).toBe(target))
    slow.release()
    await loading
    expect(store().data!.snapshot.payments.find((p) => p.id === pay.id)?.paid).toBe(target)
  })

  for (const order of ['newer first', 'older first'] as const) {
    it(`two reloads in flight keep the change (${order})`, async () => {
      const playerId = group.playerIds[1]!
      const h1 = server.hold()
      const r1 = store().reload()
      await h1.received
      const h2 = server.hold()
      const r2 = store().reload()
      await h2.received
      emit('scores', { eventType: 'UPDATE', new: scoreRow(playerId, 16, 2), old: {} })
      await vi.waitFor(() => expect(scoreOf(playerId, 16)).toMatchObject({ strokes: 2 }))
      const newer = { hold: h2, done: r2 }
      const older = { hold: h1, done: r1 }
      for (const x of order === 'newer first' ? [newer, older] : [older, newer]) {
        x.hold.release()
        await x.done
      }
      expect(scoreOf(playerId, 16)).toMatchObject({ strokes: 2 })
    })
  }

  it('a reload that found the round deleted does not bring its scores back, and does not loop', async () => {
    const playerId = group.playerIds[0]!
    server.tables.rounds = server.tables.rounds!.filter((r) => r.id !== round.id)
    server.tables.scores = server.tables.scores!.filter((r) => r.round_id !== round.id)
    server.tables.groups = server.tables.groups!.filter((r) => r.round_id !== round.id)
    const slow = server.hold()
    const reloading = store().reload()
    await slow.received
    emit('scores', { eventType: 'UPDATE', new: scoreRow(playerId, 15, 3), old: {} })
    await vi.waitFor(() => expect(scoreOf(playerId, 15)).toMatchObject({ strokes: 3 }))
    slow.release()
    await reloading
    const n = reads()
    await sleep(500)
    expect(store().data!.snapshot.rounds.some((r) => r.id === round.id)).toBe(false)
    expect(store().data!.snapshot.scores.some((s) => s.roundId === round.id)).toBe(false)
    expect(reads()).toBe(n)
  })

  it('a card unsigned while a reload is out, on a day this phone had not loaded, does not come back signed', async () => {
    const pair = fx.snapshot.pairs[0]!
    const r3 = { id: 'r3-new', tournament_id: TID, number: 3, date: '2027-04-11', course_id: round.courseId, holes: 18, status: 'live' }
    const sig = { round_id: r3.id, pair_id: pair.id, signed_by: pair.player1Id, signed_at: '2027-04-11T20:00:00+00:00' }
    server.tables.rounds!.push(r3)
    server.tables.card_signatures!.push(sig)
    // The reload reads the signatures, and its answer is slow.
    const slow = server.hold()
    const reloading = store().reload()
    await slow.received
    // Now the card is unsigned: the delete names a key the boards do not hold yet.
    server.tables.card_signatures = server.tables.card_signatures!.filter((x) => x !== sig)
    emit('card_signatures', { eventType: 'DELETE', new: {}, old: { round_id: r3.id, pair_id: pair.id } })
    await sleep(100)
    // What the reload read was from before the delete.
    server.tables.card_signatures!.push(sig)
    slow.release()
    await reloading
    server.tables.card_signatures = server.tables.card_signatures!.filter((x) => x !== sig)
    expect(store().data!.snapshot.rounds.some((r) => r.id === r3.id)).toBe(true)
    expect(store().data!.snapshot.cardSignatures.some((x) => x.roundId === r3.id && x.pairId === pair.id)).toBe(false)
  })
})

describe('leaving a tournament', () => {
  it('a change that waited for its day is forgotten with the channel: coming back, it never takes back what the fetch brings', async () => {
    vi.useFakeTimers()
    const playerId = group.playerIds[0]!
    const r3 = { id: 'r3-new', tournament_id: TID, number: 3, date: '2027-04-11', course_id: round.courseId, holes: 18, status: 'live' }
    emit('scores', { eventType: 'INSERT', new: { ...scoreRow(playerId, 1, 4), id: 'r3-score', round_id: r3.id }, old: {} })
    await vi.advanceTimersByTimeAsync(100)
    store().unsubscribe()
    // While the phone was away, the day was created and that hole saved again.
    server.tables.rounds!.push(r3)
    server.tables.scores!.push({ ...scoreRow(playerId, 1, 6), id: 'r3-score', round_id: r3.id })
    vi.useRealTimers()
    // What the load brings is what shows, before anything else comes along to correct it.
    await store().load(TID)
    expect(store().data!.snapshot.scores.find((x) => x.roundId === r3.id && x.hole === 1)).toMatchObject({ strokes: 6 })
  })

  it('a late change on the channel that was left is not applied', async () => {
    const ch = channel()
    const playerId = group.playerIds[2]!
    const was = scoreOf(playerId, 14)?.strokes ?? null
    store().unsubscribe()
    emitOn(ch, 'scores', { eventType: 'UPDATE', new: scoreRow(playerId, 14, 9), old: {} })
    await sleep(300)
    expect(scoreOf(playerId, 14)?.strokes ?? null).toBe(was)
  })

  it('a change still waiting when the phone leaves never lands on what it opens next', async () => {
    vi.useFakeTimers()
    const playerId = group.playerIds[3]!
    const fetched = scoreOf(playerId, 11)?.strokes ?? null
    emit('scores', { eventType: 'UPDATE', new: scoreRow(playerId, 11, 9), old: {} })
    store().unsubscribe()
    vi.useRealTimers()
    await ready()
    // Anything that makes the store apply again (another phone's mark).
    emit('payments', { eventType: 'UPDATE', new: structuredClone(server.tables.payments![0]!), old: {} })
    await sleep(100)
    expect(scoreOf(playerId, 11)?.strokes ?? null).toBe(fetched)
  })

  it('switching tournaments with a late change on the old channel: it never lands on the new one, which still goes live', async () => {
    const xChannel = channel()
    const before = server.channels.length
    const slow = server.hold()
    const loading = store().load(Y)
    await slow.received
    emitOn(xChannel, 'payments', { eventType: 'INSERT', new: { id: 'late-x', tournament_id: TID, from_player_id: 'p1', to_player_id: null, amount: 100, kind: 'other', paid: true, note: null }, old: {} })
    await sleep(400)
    slow.release()
    await loading
    await sleep(300)
    const s = store()
    expect(s.data!.snapshot.tournament.id).toBe(Y)
    expect(s.data!.snapshot.payments.some((p) => p.id === 'late-x')).toBe(false)
    expect({ channels: server.channels.length - before, realtime: s.realtime, loading: s.loading }).toEqual({ channels: 1, realtime: 'connecting', loading: false })
  })

  it('a tournament the phone forgot is not written back by a change that lands just before', async () => {
    const pay = server.tables.payments![0]!
    pay.paid = !pay.paid
    emit('payments', { eventType: 'UPDATE', new: { ...pay }, old: {} })
    await sleep(100)
    await clearCached(TID)
    await sleep(1700)
    const db = new Dexie('cardi-golf-cache')
    db.version(1).stores({ entries: 'slug, tournamentId', snapshots: 'tournamentId' })
    const back = await db.table('snapshots').get(TID)
    db.close()
    expect(back).toBeUndefined()
  })

  it('nor after a sign-out, which forgets every tournament on the phone', async () => {
    const pay = server.tables.payments![0]!
    pay.paid = !pay.paid
    emit('payments', { eventType: 'UPDATE', new: { ...pay }, old: {} })
    await sleep(100)
    await clearAllCached()
    await sleep(1700)
    const db = new Dexie('cardi-golf-cache')
    db.version(1).stores({ entries: 'slug, tournamentId', snapshots: 'tournamentId' })
    const back = await db.table('snapshots').get(TID)
    db.close()
    expect(back).toBeUndefined()
  })
})

describe('the same boards on every phone', () => {
  it('fetched rows are put in the order changes insert in, whatever order the database gave', async () => {
    store().unsubscribe()
    useTournament.setState({ tournamentId: null, data: null, source: null })
    // A collation that sorts differently: the payments come back reversed.
    const orig = server.client.from.bind(server.client)
    server.client.from = ((t: string) => {
      const q = orig(t)
      if (t !== 'payments') return q
      const then = q.then.bind(q)
      ;(q as unknown as { then: typeof then }).then = ((ok, err) => then((res) => ok!(Array.isArray(res.data) ? { ...res, data: [...res.data].reverse() } : res), err)) as typeof then
      return q
    }) as typeof server.client.from
    await store().load(TID)
    const ids = store().data!.base.payments.map((p) => p.id)
    expect(ids.length).toBeGreaterThan(1)
    expect(ids).toEqual([...ids].sort())
  })

  it('a bet with a side pot and three equal winners pays the same whether the rows were applied or fetched', async () => {
    store().unsubscribe()
    const s = structuredClone(getFixture('friends8')!.snapshot)
    const settings = s.tournament.settings as { games: Array<{ id: string; money: Record<string, unknown> }> }
    settings.games.find((g) => g.id === 'tacos')!.money = { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [100] }
    s.gameResults = []
    const id = s.tournament.id
    server = fakeSupabase(snapshotToRows(s))
    useTournament.setState({ tournamentId: null, data: null, source: null })
    await store().load(id)
    channel().status!('SUBSCRIBED')
    await vi.waitFor(() => expect(reads()).toBe(2))
    for (const pid of ['p7', 'p3', 'p1']) {
      const row = { tournament_id: id, game_id: 'tacos', player_id: pid, share: '1', created_at: '2027-04-10T22:00:00+00:00' }
      server.tables.game_results!.push(row)
      emit('game_results', { eventType: 'INSERT', new: structuredClone(row), old: {} })
    }
    await vi.waitFor(() => expect(store().data!.snapshot.gameResults).toHaveLength(3))
    const applied = store().data!
    store().unsubscribe()
    useTournament.setState({ tournamentId: null, data: null, source: null })
    await store().load(id)
    const fresh = store().data!
    expect(applied.state.prizes).toEqual(fresh.state.prizes)
    expect(applied.state.money).toEqual(fresh.state.money)
    expect(applied.base.gameResults).toEqual(fresh.base.gameResults)
  })
})

describe('a load overtaken by another fetch of the same tournament', () => {
  it('still goes live, and is not left loading', async () => {
    store().unsubscribe()
    const before = server.channels.length
    const slow = server.hold()
    const loading = store().load(TID)
    await slow.received
    // A reload of the same tournament overtakes it and lands first.
    await store().reload()
    slow.release()
    await loading
    expect(server.channels.length).toBe(before + 1)
    expect(store().realtime).toBe('connecting')
    expect(store().loading).toBe(false)
  })

  it('when the fetch that overtook it failed, the boards it had are not left loading', async () => {
    const first = server.hold()
    const loading = store().load(TID)
    await first.received
    const second = server.hold()
    const reloading = store().reload()
    await second.received
    second.fail({ message: 'Failed to fetch', code: '' })
    await reloading
    first.release()
    await loading
    expect(store().data).not.toBeNull()
    expect(store().loading).toBe(false)
  })
})

describe('a quiet live channel is checked against the server', () => {
  it(`after ${HEAL_MS / 1000} s without a fetch, once; not while the phone is hidden`, async () => {
    store().unsubscribe()
    vi.useFakeTimers()
    await ready()
    const n = reads()
    await vi.advanceTimersByTimeAsync(HEAL_MS - 20_000)
    expect(reads()).toBe(n)
    // Checked every sixth of it: by one check past the mark, once.
    await vi.advanceTimersByTimeAsync(20_000 + HEAL_MS / 6)
    expect(reads()).toBe(n + 1)
    vi.stubGlobal('document', { visibilityState: 'hidden' })
    try {
      await vi.advanceTimersByTimeAsync(HEAL_MS * 2)
      expect(reads()).toBe(n + 1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
