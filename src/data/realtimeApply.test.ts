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
import { applyChange, changeTouches, inLiveOrder, type LiveChange } from './realtimeApply'

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
    const r = applyChange(s, T(s), upd('scores', { id: target.id, round_id: target.roundId, player_id: target.playerId, hole: target.hole, strokes: 9, putts: 3, picked_up: false, updated_at: '2027-04-09T10:00:00Z', disputed: false }))
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

  it('changeTouches names a change by its table and its key, a delete by what it carries', () => {
    const isHole = (r: Record<string, unknown>) => r.round_id === 'r1' && r.player_id === 'p1' && r.hole === 4
    expect(changeTouches(upd('scores', { round_id: 'r1', player_id: 'p1', hole: 4 }), 'scores', isHole)).toBe(true)
    expect(changeTouches(upd('scores', { round_id: 'r1', player_id: 'p1', hole: 5 }), 'scores', isHole)).toBe(false)
    expect(changeTouches(upd('payments', { round_id: 'r1', player_id: 'p1', hole: 4 }), 'scores', isHole)).toBe(false)
    expect(changeTouches(del('scores', { round_id: 'r1', player_id: 'p1', hole: 4 }), 'scores', isHole)).toBe(true)
  })
})
