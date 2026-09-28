/**
 * M4 acceptance (CLAUDE.md §16): a full simulated 2-day tournament whose
 * standings and prizes are cross-checked against a HAND calculation for one
 * group. Every number below was worked out by hand from §5 before running.
 *
 * Group 1 of the first-tournament fixture: p1 (A, base 6), p10 (D, base 25),
 * p4 (B, base 12), p7 (C, base 18). Card: PAR_72 from the fixtures.
 *   PH1: p1 → 80% × 6 = 4.8 → 5 · p10 → 20 · p4 → 9.6 → 10 · p7 → 14.4 → 14
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from './computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from './settings/presets'
import { PAR_72, fillRound, makeFirstTournament, score } from './testing/fixtures'

const S = FIRST_TOURNAMENT_SETTINGS

/** Gross per hole for the four players of group 1, Day 1, in hole order 1..18. */
const DAY1: Record<string, number[]> = {
  // p1 (PH 5 → 1 stroke on SI 1–5: holes 5,12,4,14,9): par golf with 2 birdies (holes 3, 11), a double on 17
  p1: [4, 4, 2, 5, 4, 4, 3, 4, 5, 4, 2, 4, 5, 4, 4, 3, 6, 5],
  // p10 (PH 20 → 2 strokes on SI 1–2 (holes 5,12), 1 elsewhere): bogey golf, a 7 on hole 4, a pick-up on 18
  p10: [5, 5, 4, 7, 5, 5, 4, 5, 6, 5, 4, 5, 6, 5, 5, 4, 5, 0],
  // p4 (PH 10 → 1 stroke on SI 1–10: holes 5,12,4,14,9,17,1,10,8,15): mixed
  p4: [5, 4, 3, 6, 5, 5, 3, 4, 5, 5, 3, 5, 5, 4, 5, 4, 4, 6],
  // p7 (PH 14 → 1 stroke on SI 1–14: all but SI 15,16,17,18 = holes 7,16,3,11)
  p7: [5, 5, 4, 6, 5, 5, 4, 5, 6, 5, 4, 5, 6, 5, 5, 4, 5, 6],
}
// Putts: p10 three-putts holes 3 and 9; p4 three-putts hole 9 too (same hole → tiebreak, p4 holed last); p1 never.
const PUTTS1: Record<string, number[]> = {
  p1: Array(18).fill(2),
  p10: [2, 2, 3, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  p4: [2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  p7: Array(18).fill(2),
}

/** Hand-calculated Day 1 Stableford per hole. */
const EXPECT1: Record<string, number[]> = {
  // p1 strokes on holes 4,5,9,12,14. Points = par + sr − gross + 2.
  p1: [2, 2, 3, 3, 3, 2, 2, 2, 3, 2, 3, 3, 2, 3, 2, 2, 0, 2], // = 41
  // p10 strokes: 2 on holes 5,12 (gross 5 there → 3 pts); 1 on all others. Hole 18 picked up → 0.
  p10: [2, 2, 2, 1, 3, 2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 0], // = 35
  // p4 strokes on holes 1,4,5,8,9,10,12,14,15,17.
  p4: [2, 2, 2, 2, 2, 1, 2, 3, 3, 2, 2, 2, 2, 3, 2, 1, 3, 1], // = 37
  // p7 strokes everywhere except holes 3,7,11,16.
  p7: [2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2], // = 32
}

describe('hand calculation, group 1 of the first tournament', () => {
  it('Day 1 points per hole, totals, snake and Day 2 handicaps match the hand calculation', () => {
    const snap = makeFirstTournament()
    // Group 1 Day 1 from the tables; everyone else gets seeded scores so the tournament is complete.
    for (const pid of Object.keys(DAY1)) {
      DAY1[pid]!.forEach((g, i) => {
        snap.scores.push(score('r1', pid, i + 1, g === 0 ? null : g, PUTTS1[pid]![i]!, g === 0))
      })
    }
    fillRound(snap, 'r1', 21, { playerIds: snap.players.map((p) => p.id).filter((id) => !(id in DAY1)) })
    snap.snakeTiebreaks.push({ roundId: 'r1', groupId: 'r1g1', hole: 9, lastHoledPlayerId: 'p4' })
    snap.rounds[0]!.status = 'finished'

    const st = computeTournament(snap, S)
    const r1 = st.core.rounds.r1!
    expect(r1.p1!.playingHcp).toBe(5)
    expect(r1.p10!.playingHcp).toBe(20)
    expect(r1.p4!.playingHcp).toBe(10)
    expect(r1.p7!.playingHcp).toBe(14)
    for (const pid of Object.keys(EXPECT1)) {
      expect(r1[pid]!.holes.map((h) => h.points), pid).toEqual(EXPECT1[pid])
    }
    expect(r1.p1!.points).toBe(41)
    expect(r1.p10!.points).toBe(35)
    expect(r1.p4!.points).toBe(37)
    expect(r1.p7!.points).toBe(32)

    // Snake, group 1: p10 on 3, p10+p4 on 9 (p4 holed last) → p4 holds at the end.
    const g1 = st.modules.snake!.groups.find((g) => g.groupId === 'r1g1')!
    expect(g1.passes.map((p) => `${p.hole}:${p.holderId}`)).toEqual(['3:p10', '9:p4'])
    expect(g1.holderId).toBe('p4')
    expect(Object.fromEntries(Object.entries(g1.payouts).map(([k, v]) => [k, v.amount]))).toEqual({ p1: 200, p10: 200, p4: 0, p7: 200 })

    // Day 2 cuts: 41 → (41−36)/2 = 2 → PH2 3 · 35 → 0 → 20 · 37 → 0 → 10 · 32 → 0 → 14
    const r2 = st.core.rounds.r2!
    expect(r2.p1!.cut).toBe(2)
    expect(r2.p1!.playingHcp).toBe(3)
    expect(r2.p10!.playingHcp).toBe(20)
    expect(r2.p4!.playingHcp).toBe(10)
    expect(r2.p7!.playingHcp).toBe(14)

    // Best round Day 1: nobody in the other groups beats 41? Check the module agrees with the max.
    const d1 = st.modules.bestRound!.days[0]!
    const max = Math.max(...d1.rows.map((r) => r.points))
    expect(d1.rows[0]!.points).toBe(max)

    // Pairs after Day 1: pair1 (p1+p10) = 76, pair4 (p4+p7) = 69.
    const pairs = st.modules.pairs!.rows
    expect(pairs.find((r) => r.pairId === 'pair1')!.perRound[0]).toBe(76)
    expect(pairs.find((r) => r.pairId === 'pair4')!.perRound[0]).toBe(69)
    // Fewest putts so far: p1 and p7 36 each; p10 38; p4 37.
    const putts = st.modules.fewestPutts!.rows
    expect(putts.find((r) => r.playerId === 'p1')!.putts).toBe(36)
    // p10 picked up a hole after two putts: the pick-up counts the setting (3), never less (§18.1).
    expect(putts.find((r) => r.playerId === 'p10')!.putts).toBe(39)
    expect(putts.find((r) => r.playerId === 'p4')!.putts).toBe(37)
    // Hole 18 for p10 was picked up with 2 putts entered → counts the entered 2 (no putts → would count 3).
  })

  it('Day 2 with the cut handicaps: p1 plays a 41 again and the totals follow', () => {
    const snap = makeFirstTournament()
    for (const pid of Object.keys(DAY1)) {
      DAY1[pid]!.forEach((g, i) => snap.scores.push(score('r1', pid, i + 1, g === 0 ? null : g, PUTTS1[pid]![i]!, g === 0)))
    }
    fillRound(snap, 'r1', 21, { playerIds: snap.players.map((p) => p.id).filter((id) => !(id in DAY1)) })
    snap.snakeTiebreaks.push({ roundId: 'r1', groupId: 'r1g1', hole: 9, lastHoledPlayerId: 'p4' })
    // Day 2: p1 shoots the same gross as Day 1 but now with PH 3 (strokes on SI 1–3: holes 5, 12, 4).
    DAY1.p1!.forEach((g, i) => snap.scores.push(score('r2', 'p1', i + 1, g, 2)))
    // Hand: same as Day 1 minus the strokes lost on holes 9 (SI 5) and 14 (SI 4): 41 − 2 = 39.
    fillRound(snap, 'r2', 22, { playerIds: snap.players.map((p) => p.id).filter((id) => id !== 'p1') })
    snap.rounds.forEach((r) => (r.status = 'finished'))
    for (let i = 0; i < 10; i++) {
      const pending = computeTournament(snap, S).flags.pendingSnakeTiebreaks
      if (!pending.length) break
      for (const q of pending) snap.snakeTiebreaks.push({ roundId: q.roundId, groupId: q.groupId, hole: q.hole, lastHoledPlayerId: q.candidates[0]! })
    }
    const st = computeTournament(snap, S)
    expect(st.core.rounds.r2!.p1!.playingHcp).toBe(3)
    expect(st.core.rounds.r2!.p1!.points).toBe(39)
    expect(st.core.totals.p1!.points).toBe(80)
    // Prize pool fully assigned and the bank balances to the peso.
    const prizes = st.prizes.filter((p) => p.moduleId !== 'auction').reduce((s, p) => s + p.amount, 0)
    expect(prizes).toBe(30000)
    expect(st.money.banker.balanced).toBe(true)
    expect(PAR_72.reduce((s, [par]) => s + par, 0)).toBe(72)
  })
})
