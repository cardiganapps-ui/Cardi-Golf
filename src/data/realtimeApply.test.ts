/**
 * REL-11, PERF-07: the rows a live change carries are applied where they
 * belong, by their key; another tournament's are left alone; what cannot be
 * placed asks for a reload.
 */
import { describe, expect, it } from 'vitest'
import { getFixture } from '../dev/fixtures'
import type { Snapshot } from '../engine/types'
import { applyChange, type LiveChange } from './realtimeApply'

const fx = () => structuredClone(getFixture('full12-live')!.snapshot)
const T = (s: Snapshot) => s.tournament.id
const ins = (table: string, row: Record<string, unknown>): LiveChange => ({ table, eventType: 'INSERT', new: row as LiveChange['new'], old: {} as LiveChange['old'] })
const upd = (table: string, row: Record<string, unknown>): LiveChange => ({ table, eventType: 'UPDATE', new: row as LiveChange['new'], old: {} as LiveChange['old'] })
const del = (table: string, key: Record<string, unknown>): LiveChange => ({ table, eventType: 'DELETE', new: {} as LiveChange['new'], old: key as LiveChange['old'] })

describe('scores', () => {
  it('a hole saved on another phone replaces that hole, and only that hole', () => {
    const s = fx()
    const before = s.scores.length
    const target = s.scores[0]!
    const r = applyChange(s, T(s), upd('scores', { id: 'x', round_id: target.roundId, player_id: target.playerId, hole: target.hole, strokes: 9, putts: 3, picked_up: false, updated_at: '2027-04-09T10:00:00Z', disputed: false }))
    expect(r).toBe('applied')
    expect(s.scores).toHaveLength(before)
    expect(s.scores.find((x) => x.roundId === target.roundId && x.playerId === target.playerId && x.hole === target.hole)).toMatchObject({ strokes: 9, putts: 3 })
  })

  it('a new hole is added', () => {
    const s = fx()
    const round = s.rounds[0]!
    const free = s.players.find((p) => !s.scores.some((x) => x.playerId === p.id && x.hole === 18 && x.roundId === round.id))
    const playerId = free?.id ?? s.players[0]!.id
    s.scores = s.scores.filter((x) => !(x.roundId === round.id && x.playerId === playerId && x.hole === 18))
    const before = s.scores.length
    expect(applyChange(s, T(s), ins('scores', { id: 'n', round_id: round.id, player_id: playerId, hole: 18, strokes: 4, putts: 2, picked_up: false }))).toBe('applied')
    expect(s.scores).toHaveLength(before + 1)
  })

  it("a score of a round this phone has not loaded (a new day, another tournament's) asks for a reload, and changes nothing", () => {
    const s = fx()
    const copy = JSON.stringify(s.scores)
    expect(applyChange(s, T(s), ins('scores', { id: 'n', round_id: 'elsewhere', player_id: 'p1', hole: 1, strokes: 4 }))).toBe('reload')
    expect(JSON.stringify(s.scores)).toBe(copy)
  })

  it('a deleted score names only its id, which the snapshot does not keep: reload', () => {
    const s = fx()
    expect(applyChange(s, T(s), del('scores', { id: 'whatever' }))).toBe('reload')
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
    const lot = s.calcuttaLots[0]
    if (!lot) return
    expect(applyChange(s, T(s), ins('calcutta_bids', { id: 'b-new', lot_id: lot.id, bidder_id: s.players[1]!.id, amount: 750, created_at: '2027-04-08T22:00:00Z' }))).toBe('applied')
    expect(s.calcuttaBids.some((b) => b.id === 'b-new')).toBe(true)
    expect(applyChange(s, T(s), del('calcutta_bids', { id: 'b-new' }))).toBe('applied')
    expect(s.calcuttaBids.some((b) => b.id === 'b-new')).toBe(false)
  })

  it('a tiebreak answered, a card signed, a contest claimed, each by its own key', () => {
    const s = fx()
    const round = s.rounds[0]!
    const group = s.groups.find((g) => g.roundId === round.id)!
    const pair = s.pairs[0]
    applyChange(s, T(s), ins('snake_tiebreaks', { round_id: round.id, group_id: group.id, hole: 7, last_holed_player_id: group.playerIds[0] }))
    applyChange(s, T(s), upd('snake_tiebreaks', { round_id: round.id, group_id: group.id, hole: 7, last_holed_player_id: group.playerIds[1] }))
    expect(s.snakeTiebreaks.filter((x) => x.roundId === round.id && x.groupId === group.id && x.hole === 7)).toEqual([expect.objectContaining({ lastHoledPlayerId: group.playerIds[1] })])
    if (pair) {
      applyChange(s, T(s), ins('card_signatures', { round_id: round.id, pair_id: pair.id, signed_by: group.playerIds[0], signed_at: '2027-04-09T15:00:00Z' }))
      expect(s.cardSignatures.some((x) => x.roundId === round.id && x.pairId === pair.id)).toBe(true)
    }
    applyChange(s, T(s), ins('hole_awards', { round_id: round.id, group_id: group.id, hole: 3, game_id: 'ctp', player_id: group.playerIds[0] }))
    expect(s.holeAwards.some((x) => x.roundId === round.id && x.hole === 3 && x.gameId === 'ctp')).toBe(true)
    applyChange(s, T(s), del('hole_awards', { round_id: round.id, game_id: 'ctp', hole: 3, player_id: group.playerIds[0] }))
    expect(s.holeAwards.some((x) => x.roundId === round.id && x.hole === 3 && x.gameId === 'ctp')).toBe(false)
  })

  it('arrays are replaced, never mutated: a snapshot on screen does not move under it', () => {
    const s = fx()
    const shown = s.scores
    const copy = JSON.stringify(shown)
    const target = s.scores[0]!
    applyChange(s, T(s), upd('scores', { round_id: target.roundId, player_id: target.playerId, hole: target.hole, strokes: 12 }))
    expect(JSON.stringify(shown)).toBe(copy)
    expect(s.scores).not.toBe(shown)
  })
})

describe('tables that are not applied in place', () => {
  it('rounds, groups, players, pairs and the tournament row ask for a reload (their rows need joins the event does not carry)', () => {
    const s = fx()
    for (const table of ['tournaments', 'players', 'rounds', 'groups', 'group_members', 'pairs', 'teams']) {
      expect(applyChange(s, T(s), upd(table, { id: 'x', tournament_id: T(s) })), table).toBe('reload')
    }
  })
})
