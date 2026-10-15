/**
 * UX-23 (0054): a signature on the live channel is a pair's card or one
 * player's, keyed (round, card_id). A player's signature lands beside the
 * pairs', in the order a fetch gives (card_id); a delete since 0054 names
 * (round_id, card_id) and takes that card only; one from before names the
 * pair, as it did.
 */
import { describe, expect, it } from 'vitest'
import { getFixture } from '../dev/fixtures'
import type { Snapshot } from '../engine/types'
import { applyChange, type LiveChange } from './realtimeApply'

const fx = () => structuredClone(getFixture('full12-live')!.snapshot)
const T = (s: Snapshot) => s.tournament.id
const ins = (row: Record<string, unknown>): LiveChange => ({ table: 'card_signatures', eventType: 'INSERT', new: row as LiveChange['new'], old: {} as LiveChange['old'] })
const del = (key: Record<string, unknown>): LiveChange => ({ table: 'card_signatures', eventType: 'DELETE', new: {} as LiveChange['new'], old: key as LiveChange['old'] })

describe('a player’s signature on the live channel', () => {
  it('lands as the player’s card, beside a pair’s of the same day, in card order', () => {
    const s = fx()
    const r1 = s.rounds[0]!.id
    const pair = s.pairs[0]!
    s.cardSignatures = []
    expect(applyChange(s, T(s), ins({ round_id: r1, pair_id: null, player_id: 'p9', card_id: 'p9', signed_by: 'p1', signed_at: '2027-04-09T15:00:00Z', tournament_id: T(s) }))).toBe('applied')
    expect(applyChange(s, T(s), ins({ round_id: r1, pair_id: pair.id, player_id: null, card_id: pair.id, signed_by: 'p1', signed_at: '2027-04-09T15:01:00Z', tournament_id: T(s) }))).toBe('applied')
    expect(s.cardSignatures).toEqual(
      [
        { roundId: r1, pairId: null, playerId: 'p9', signedBy: 'p1', signedAt: '2027-04-09T15:00:00Z' },
        { roundId: r1, pairId: pair.id, signedBy: 'p1', signedAt: '2027-04-09T15:01:00Z' },
      ].sort((a, b) => ((a.pairId ?? a.playerId)! < (b.pairId ?? b.playerId)! ? -1 : 1)),
    )
    // Its echo is the same row: nothing doubles.
    expect(applyChange(s, T(s), ins({ round_id: r1, pair_id: null, player_id: 'p9', card_id: 'p9', signed_by: 'p1', signed_at: '2027-04-09T15:00:00Z', tournament_id: T(s) }))).toBe('applied')
    expect(s.cardSignatures).toHaveLength(2)
  })

  it('a delete by (round, card) takes that card only; one from before 0054 names the pair', () => {
    const s = fx()
    const [r1, r2] = s.rounds
    const pair = s.pairs[0]!
    s.cardSignatures = [
      { roundId: r1!.id, pairId: pair.id, signedBy: 'p1', signedAt: '' },
      { roundId: r1!.id, pairId: null, playerId: 'p9', signedBy: 'p1', signedAt: '' },
      { roundId: r2!.id, pairId: null, playerId: 'p9', signedBy: 'p1', signedAt: '' },
    ]
    expect(applyChange(s, T(s), del({ round_id: r1!.id, card_id: 'p9' }))).toBe('applied')
    expect(s.cardSignatures.map((x) => `${x.roundId}:${x.pairId ?? x.playerId}`)).toEqual([`${r1!.id}:${pair.id}`, `${r2!.id}:p9`])
    expect(applyChange(s, T(s), del({ round_id: r1!.id, pair_id: pair.id }))).toBe('applied')
    expect(applyChange(s, T(s), del({ round_id: r1!.id, card_id: 'p9' }))).toBe('ignored')
    expect(s.cardSignatures.map((x) => `${x.roundId}:${x.pairId ?? x.playerId}`)).toEqual([`${r2!.id}:p9`])
  })

  it('a delete of a card these boards do not hold changes nothing', () => {
    const s = fx()
    const copy = JSON.stringify(s)
    expect(applyChange(s, T(s), del({ round_id: 'elsewhere', card_id: 'x' }))).toBe('ignored')
    expect(JSON.stringify(s)).toBe(copy)
  })
})
