/**
 * REL-11, PERF-07: the rows a live change carries are applied where they
 * belong, by their key, and where a fetch would put them; another
 * tournament's are left alone; a row of a day or lot this phone has not
 * loaded waits ('unknown'); what cannot be placed at all asks for a reload.
 * Every case states its result, so a handler that answers «reload» for the
 * wrong reason fails here.
 */
import { describe, expect, it } from 'vitest'
import { getFixture } from '../dev/fixtures'
import type { Snapshot } from '../engine/types'
import { applyChange, canonicalTime, inLiveOrder, sameChange, type LiveChange } from './realtimeApply'

const fx = () => structuredClone(getFixture('full12-live')!.snapshot)
const T = (s: Snapshot) => s.tournament.id
const ins = (table: string, row: Record<string, unknown>): LiveChange => ({ table, eventType: 'INSERT', new: row as LiveChange['new'], old: {} as LiveChange['old'] })
const upd = (table: string, row: Record<string, unknown>): LiveChange => ({ table, eventType: 'UPDATE', new: row as LiveChange['new'], old: {} as LiveChange['old'] })
const del = (table: string, key: Record<string, unknown>): LiveChange => ({ table, eventType: 'DELETE', new: {} as LiveChange['new'], old: key as LiveChange['old'] })

describe('scores', () => {
  it('a hole saved on another phone replaces that hole, in its place, and only that hole', () => {
    const s = fx()
    const before = s.scores.length
    const i = 3
    const target = s.scores[i]!
    const r = applyChange(s, T(s), upd('scores', { id: target.id, round_id: target.roundId, player_id: target.playerId, hole: target.hole, strokes: 9, putts: 3, picked_up: false, updated_at: '2027-04-12T10:00:00Z', disputed: false }))
    expect(r).toBe('applied')
    expect(s.scores).toHaveLength(before)
    expect(s.scores[i]).toMatchObject({ roundId: target.roundId, playerId: target.playerId, hole: target.hole, strokes: 9, putts: 3 })
  })

  it('a new hole is added where a fetch would put it (by its id)', () => {
    const s = fx()
    const round = s.rounds.find((r) => r.status === 'live')!
    s.scores = [
      { id: 'b', roundId: round.id, playerId: s.players[0]!.id, hole: 1, strokes: 4, putts: 2, pickedUp: false, enteredBy: null, updatedAt: null },
      { id: 'd', roundId: round.id, playerId: s.players[0]!.id, hole: 2, strokes: 4, putts: 2, pickedUp: false, enteredBy: null, updatedAt: null },
    ]
    expect(applyChange(s, T(s), ins('scores', { id: 'c', round_id: round.id, player_id: s.players[1]!.id, hole: 1, strokes: 5, putts: 2, picked_up: false }))).toBe('applied')
    expect(s.scores.map((x) => x.id)).toEqual(['b', 'c', 'd'])
  })

  it('a hole this phone sent (no id yet) moves to its id’s place when the server’s row comes back', () => {
    const s = fx()
    const round = s.rounds.find((r) => r.status === 'live')!
    const p = s.players[2]!.id
    s.scores = [
      { id: 'a', roundId: round.id, playerId: p, hole: 1, strokes: 4, putts: 2, pickedUp: false, enteredBy: null, updatedAt: null },
      { id: 'z', roundId: round.id, playerId: p, hole: 3, strokes: 4, putts: 2, pickedUp: false, enteredBy: null, updatedAt: null },
      { roundId: round.id, playerId: p, hole: 2, strokes: 5, putts: 2, pickedUp: false, enteredBy: null, updatedAt: null },
    ]
    expect(applyChange(s, T(s), upd('scores', { id: 'm', round_id: round.id, player_id: p, hole: 2, strokes: 5, putts: 2, picked_up: false }))).toBe('applied')
    expect(s.scores.map((x) => x.id)).toEqual(['a', 'm', 'z'])
  })

  it("a score of a round this phone has not loaded (a new day, another tournament's) waits, and changes nothing", () => {
    const s = fx()
    const copy = JSON.stringify(s.scores)
    expect(applyChange(s, T(s), ins('scores', { id: 'n', round_id: 'elsewhere', player_id: 'p1', hole: 1, strokes: 4 }))).toBe('unknown')
    expect(JSON.stringify(s.scores)).toBe(copy)
  })

  it('a deleted score names only its id: removed when it is one of ours, left alone when not', () => {
    const s = fx()
    // As fetched: every row the server sent carries its id.
    s.scores = s.scores.map((x, i) => ({ ...x, id: `score-${String(i).padStart(4, '0')}` }))
    const target = s.scores[5]!
    const before = s.scores.length
    expect(applyChange(s, T(s), del('scores', { id: 'a-score-of-another-tournament' }))).toBe('ignored')
    expect(s.scores).toHaveLength(before)
    expect(applyChange(s, T(s), del('scores', { id: target.id }))).toBe('applied')
    expect(s.scores).toHaveLength(before - 1)
    expect(s.scores.some((x) => x.roundId === target.roundId && x.playerId === target.playerId && x.hole === target.hole)).toBe(false)
  })

  it('a hole only on this phone (no id) is never what a delete names', () => {
    const s = fx()
    const round = s.rounds[0]!
    s.scores = [{ roundId: round.id, playerId: s.players[0]!.id, hole: 1, strokes: 4, putts: 2, pickedUp: false, enteredBy: null, updatedAt: null }]
    expect(applyChange(s, T(s), del('scores', { id: undefined }))).toBe('ignored')
    expect(s.scores).toHaveLength(1)
  })
})

describe("another tournament's rows", () => {
  it('an insert of another tournament (an account in two of them hears both) is left alone', () => {
    const s = fx()
    const copy = JSON.stringify(s.payments)
    expect(applyChange(s, T(s), ins('payments', { id: 'pay-x', tournament_id: 'other', from_player_id: 'p1', to_player_id: null, amount: 100, kind: 'entry', paid: true }))).toBe('ignored')
    expect(JSON.stringify(s.payments)).toBe(copy)
  })

  it('a delete is not filtered by the server (DB-05): a key this snapshot does not hold changes nothing', () => {
    const s = fx()
    const copy = JSON.stringify(s)
    expect(applyChange(s, T(s), del('payments', { id: 'not-ours' }))).toBe('ignored')
    expect(applyChange(s, T(s), del('calcutta_bids', { id: 'not-ours' }))).toBe('ignored')
    expect(applyChange(s, T(s), del('card_signatures', { round_id: 'elsewhere', pair_id: 'x' }))).toBe('ignored')
    expect(JSON.stringify(s)).toBe(copy)
  })

  it('a bid or buyback of a lot this phone has not loaded waits; it is never applied', () => {
    const s = fx()
    const copy = JSON.stringify([s.calcuttaBids, s.calcuttaBuybacks])
    expect(applyChange(s, T(s), ins('calcutta_bids', { id: 'b-x', lot_id: 'another-lot', bidder_id: 'p1', amount: 500, created_at: '2027-04-08T22:00:00Z' }))).toBe('unknown')
    expect(applyChange(s, T(s), ins('calcutta_buybacks', { lot_id: 'another-lot', pct: 25, amount: 125, paid: false }))).toBe('unknown')
    expect(JSON.stringify([s.calcuttaBids, s.calcuttaBuybacks])).toBe(copy)
  })
})

describe('the other tables applied in place', () => {
  it('a payment marked paid, then taken back', () => {
    const s = fx()
    const pay = { id: 'pay-new', tournament_id: T(s), from_player_id: s.players[0]!.id, to_player_id: null, amount: 2500, kind: 'entry', paid: true, note: null }
    expect(applyChange(s, T(s), ins('payments', pay))).toBe('applied')
    expect(s.payments.find((p) => p.id === 'pay-new')).toMatchObject({ amount: 2500, paid: true })
    expect(applyChange(s, T(s), upd('payments', { ...pay, paid: false }))).toBe('applied')
    expect(s.payments.filter((p) => p.id === 'pay-new')).toEqual([expect.objectContaining({ paid: false })])
    expect(applyChange(s, T(s), del('payments', { id: 'pay-new' }))).toBe('applied')
    expect(s.payments.some((p) => p.id === 'pay-new')).toBe(false)
  })

  it('a bid, and its undo (the delete names only its id)', () => {
    const s = fx()
    const lot = s.calcuttaLots[0]!
    expect(applyChange(s, T(s), ins('calcutta_bids', { id: 'b-new', lot_id: lot.id, bidder_id: s.players[1]!.id, amount: 750, created_at: '2027-04-08T22:00:00Z' }))).toBe('applied')
    expect(s.calcuttaBids.some((b) => b.id === 'b-new')).toBe(true)
    expect(applyChange(s, T(s), del('calcutta_bids', { id: 'b-new' }))).toBe('applied')
    expect(s.calcuttaBids.some((b) => b.id === 'b-new')).toBe(false)
  })

  it('a tiebreak answered and then changed: one row for its key', () => {
    const s = fx()
    const round = s.rounds[0]!
    const group = s.groups.find((g) => g.roundId === round.id)!
    expect(applyChange(s, T(s), ins('snake_tiebreaks', { round_id: round.id, group_id: group.id, hole: 7, last_holed_player_id: group.playerIds[0] }))).toBe('applied')
    expect(applyChange(s, T(s), upd('snake_tiebreaks', { round_id: round.id, group_id: group.id, hole: 7, last_holed_player_id: group.playerIds[1] }))).toBe('applied')
    expect(s.snakeTiebreaks.filter((x) => x.roundId === round.id && x.groupId === group.id && x.hole === 7)).toEqual([expect.objectContaining({ lastHoledPlayerId: group.playerIds[1] })])
  })

  it('a card signed on each day: signing or unsigning one day never touches the other', () => {
    const s = fx()
    const [r1, r2] = s.rounds
    const pair = s.pairs[0]!
    s.cardSignatures = []
    expect(applyChange(s, T(s), ins('card_signatures', { round_id: r1!.id, pair_id: pair.id, signed_by: pair.player1Id, signed_at: '2027-04-09T15:00:00Z' }))).toBe('applied')
    expect(applyChange(s, T(s), ins('card_signatures', { round_id: r2!.id, pair_id: pair.id, signed_by: pair.player1Id, signed_at: '2027-04-10T15:00:00Z' }))).toBe('applied')
    expect(s.cardSignatures).toHaveLength(2)
    expect(applyChange(s, T(s), del('card_signatures', { round_id: r1!.id, pair_id: pair.id }))).toBe('applied')
    expect(s.cardSignatures).toEqual([expect.objectContaining({ roundId: r2!.id, pairId: pair.id })])
  })

  it('two winners of one contest on one hole: taking one away keeps the other', () => {
    const s = fx()
    const round = s.rounds[0]!
    const group = s.groups.find((g) => g.roundId === round.id)!
    const [a, b] = group.playerIds
    s.holeAwards = []
    expect(applyChange(s, T(s), ins('hole_awards', { round_id: round.id, group_id: group.id, hole: 3, game_id: 'ctp', player_id: a }))).toBe('applied')
    expect(applyChange(s, T(s), ins('hole_awards', { round_id: round.id, group_id: group.id, hole: 3, game_id: 'ctp', player_id: b }))).toBe('applied')
    expect(s.holeAwards).toHaveLength(2)
    expect(applyChange(s, T(s), del('hole_awards', { round_id: round.id, game_id: 'ctp', hole: 3, player_id: a }))).toBe('applied')
    expect(s.holeAwards).toEqual([expect.objectContaining({ playerId: b })])
  })

  it('arrays are replaced, never mutated: a snapshot on screen does not move under it', () => {
    const s = fx()
    const shown = s.scores
    const copy = JSON.stringify(shown)
    const target = s.scores[0]!
    applyChange(s, T(s), upd('scores', { id: target.id, round_id: target.roundId, player_id: target.playerId, hole: target.hole, strokes: 12 }))
    expect(JSON.stringify(shown)).toBe(copy)
    expect(s.scores).not.toBe(shown)
  })
})

describe('tables that are not applied in place', () => {
  it('rounds, groups, players, pairs and the tournament row ask for a reload, even when the row is of a day this phone holds', () => {
    const s = fx()
    const round = s.rounds[0]!
    const group = s.groups.find((g) => g.roundId === round.id)!
    const copy = JSON.stringify(s)
    for (const table of ['tournaments', 'players', 'rounds', 'groups', 'group_members', 'pairs', 'teams']) {
      expect(applyChange(s, T(s), upd(table, { id: group.id, round_id: round.id, group_id: group.id, tournament_id: T(s), player_id: s.players[0]!.id })), table).toBe('reload')
    }
    expect(JSON.stringify(s)).toBe(copy)
  })

  it('an event without its row (a malformed payload) asks for a reload', () => {
    const s = fx()
    expect(applyChange(s, T(s), upd('payments', {}))).toBe('reload')
    expect(applyChange(s, T(s), del('payments', {}))).toBe('reload')
  })
})

describe('the same lists whichever way the rows came', () => {
  it('a fetched snapshot is put in the order changes insert in', () => {
    const s = fx()
    const round = s.rounds[0]!
    const group = s.groups.find((g) => g.roundId === round.id)!
    s.holeAwards = [
      { roundId: round.id, groupId: group.id, hole: 7, gameId: 'ctp', playerId: 'p2' },
      { roundId: round.id, groupId: group.id, hole: 3, gameId: 'ctp', playerId: 'p9' },
      { roundId: round.id, groupId: group.id, hole: 3, gameId: 'ctp', playerId: 'p1' },
    ]
    s.payments = [...s.payments].reverse()
    inLiveOrder(s)
    expect(s.holeAwards.map((x) => `${x.hole}:${x.playerId}`)).toEqual(['3:p1', '3:p9', '7:p2'])
    expect(s.payments.map((x) => x.id)).toEqual([...s.payments.map((x) => x.id)].sort())
  })

  it('sameChange knows a write’s echo: same table, same row, every value the server stored', () => {
    const row = { id: 's1', round_id: 'r1', player_id: 'p1', hole: 4, strokes: 5, putts: 2, updated_at: '2027-04-09T12:00:01.5+00:00', previous: { strokes: 4 } }
    // The channel and PostgREST may write the same instant differently.
    expect(sameChange(upd('scores', { ...row, updated_at: '2027-04-09 12:00:01.500000+00' }), upd('scores', row))).toBe(true)
    expect(sameChange(ins('scores', row), upd('scores', row))).toBe(true)
    expect(sameChange(upd('scores', { ...row, strokes: 6 }), upd('scores', row))).toBe(false)
    expect(sameChange(upd('scores', { ...row, previous: { strokes: 3 } }), upd('scores', row))).toBe(false)
    expect(sameChange(upd('payments', row), upd('scores', row))).toBe(false)
    // A delete is its key; an upsert is never a delete's echo.
    const key = { round_id: 'r1', game_id: 'cerca', hole: 3, player_id: 'p2' }
    expect(sameChange(del('hole_awards', key), del('hole_awards', key))).toBe(true)
    expect(sameChange(del('hole_awards', { ...key, player_id: 'p3' }), del('hole_awards', key))).toBe(false)
    expect(sameChange(ins('hole_awards', key), del('hole_awards', key))).toBe(false)
    expect(sameChange(upd('scores', row), upd('scores', {}))).toBe(false)
  })

  it('sameChange reads jsonb whatever order its keys come in: PostgREST and the Realtime server may list them differently (R4)', () => {
    const previous = { strokes: 4, putts: 2, picked_up: false, entered_by: 'p2', updated_at: '2027-04-09T12:00:00+00:00' }
    const row = { id: 's1', round_id: 'r1', player_id: 'p1', hole: 4, strokes: 5, disputed: true, previous }
    const shuffled = { updated_at: previous.updated_at, entered_by: 'p2', picked_up: false, putts: 2, strokes: 4 }
    expect(sameChange(upd('scores', { ...row, previous: shuffled }), upd('scores', row))).toBe(true)
    expect(sameChange(upd('scores', { ...row, previous: { ...shuffled, putts: 3 } }), upd('scores', row))).toBe(false)
  })

  it('canonicalTime writes one instant one way, and its forms sort in time', () => {
    expect(canonicalTime('2027-04-09 12:00:01+00')).toBe('2027-04-09T12:00:01.000000+00:00')
    expect(canonicalTime('2027-04-09T12:00:01.25Z')).toBe('2027-04-09T12:00:01.250000+00:00')
    expect(canonicalTime('2027-04-09T12:00:01.123456+0000')).toBe('2027-04-09T12:00:01.123456+00:00')
    expect(canonicalTime('not a time')).toBe('not a time')
    expect(canonicalTime(null)).toBeNull()
    expect(canonicalTime('2027-04-09T12:00:01.9+00:00')! < canonicalTime('2027-04-09 12:00:02+00')!).toBe(true)
  })

  it('a score this phone’s own write brought back, stamped earlier than the one held, is not applied over it', () => {
    const s = fx()
    const target = s.scores[2]!
    const at = (stamp: string, strokes: number) => upd('scores', { id: target.id, round_id: target.roundId, player_id: target.playerId, hole: target.hole, strokes, putts: 2, picked_up: false, updated_at: stamp, disputed: false })
    expect(applyChange(s, T(s), at('2027-04-12T12:00:05+00:00', 7))).toBe('applied')
    // A write this phone landed, its answer after a fetch that read the later one.
    expect(applyChange(s, T(s), at('2027-04-12 12:00:04.999+00', 4), { landed: true })).toBe('stale')
    const held = () => s.scores.find((x) => x.roundId === target.roundId && x.playerId === target.playerId && x.hole === target.hole)
    expect(held()).toMatchObject({ strokes: 7 })
    expect(applyChange(s, T(s), at('2027-04-12T12:00:06+00:00', 8), { landed: true })).toBe('applied')
    expect(held()).toMatchObject({ strokes: 8 })
  })

  it('the channel’s changes apply in the order they come, whatever their stamps: a write that waited on the row’s lock commits last with the earlier stamp (R1)', () => {
    const s = fx()
    const target = s.scores[2]!
    const at = (stamp: string, strokes: number) => upd('scores', { id: target.id, round_id: target.roundId, player_id: target.playerId, hole: target.hole, strokes, putts: 2, picked_up: false, updated_at: stamp, disputed: true })
    // B's transaction began later and committed first; A's began first, waited on B's lock, and committed last.
    expect(applyChange(s, T(s), at('2027-10-03T10:48:28.840158+00:00', 4))).toBe('applied')
    expect(applyChange(s, T(s), at('2027-10-03T10:48:28.534263+00:00', 7))).toBe('applied')
    expect(s.scores.find((x) => x.roundId === target.roundId && x.playerId === target.playerId && x.hole === target.hole)).toMatchObject({ strokes: 7 })
  })

  it('a payment Dinero laid with a local id is the row the server made for that flow, not a second one', () => {
    const s = fx()
    const tid = T(s)
    s.payments = [...s.payments, { id: 'local:entry|pX|', kind: 'entry', fromPlayerId: 'pX', toPlayerId: null, amount: 2500, paid: true, note: null }]
    const before = s.payments.length
    expect(applyChange(s, tid, ins('payments', { id: 'f0000000-0000-0000-0000-000000000001', tournament_id: tid, kind: 'entry', from_player_id: 'pX', to_player_id: null, amount: 2500, paid: true, note: null }))).toBe('applied')
    expect(s.payments).toHaveLength(before)
    expect(s.payments.filter((x) => x.fromPlayerId === 'pX').map((x) => x.id)).toEqual(['f0000000-0000-0000-0000-000000000001'])
    // Another flow of the same player is its own row.
    expect(applyChange(s, tid, ins('payments', { id: 'f0000000-0000-0000-0000-000000000002', tournament_id: tid, kind: 'calcutta', from_player_id: 'pX', to_player_id: null, amount: 750, paid: false, note: null }))).toBe('applied')
    expect(s.payments).toHaveLength(before + 1)
  })
})
