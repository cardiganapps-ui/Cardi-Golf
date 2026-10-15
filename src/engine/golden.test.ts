/**
 * The first tournament end to end, worked out by hand (QA-18). This replaces
 * a 950-line snapshot of whatever the engine returned the day it was written,
 * which `vitest -u` would accept in one keystroke. Every number below follows
 * from §5 and the cards in this file, by the arithmetic in the comments,
 * without running the engine.
 *
 * The cards are designed to be worked by hand. Every hole is net par on the
 * player's playing handicap that day (gross = par + strokes received: 2
 * points) except the holes listed: +1 is a net birdie (3 points), −1 a net
 * bogey (1 point). So a day is worth 36 points plus its +1s, minus its −1s.
 * Putts are 2 except where listed. Group 1 is p1, p10, p4, p7; group 2 is p2,
 * p11, p5, p8; group 3 is p3, p12, p6, p9, both days, from hole 1. Pairs:
 * (p1, p10), (p2, p11), (p3, p12), (p4, p7), (p5, p8), (p6, p9). The banker
 * is p1.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from './computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from './settings/presets'
import { PAR_72, makeFirstTournament, score } from './testing/fixtures'

const S = FIRST_TOURNAMENT_SETTINGS
const ids = Array.from({ length: 12 }, (_, i) => `p${i + 1}`)

/**
 * Playing handicap, Day 1: 80 % of the base, half up (§5.2).
 * Bases 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 33:
 * 4.8 → 5 · 6.4 → 6 · 8 · 9.6 → 10 · 11.2 → 11 · 12.8 → 13 · 14.4 → 14 · 16 · 17.6 → 18 · 20 · 22.4 → 22 · 26.4 → 26.
 */
const PH1: Record<string, number> = { p1: 5, p2: 6, p3: 8, p4: 10, p5: 11, p6: 13, p7: 14, p8: 16, p9: 18, p10: 20, p11: 22, p12: 26 }

/** Day 1: net birdies (+1) and net bogeys (−1) by hole. */
const DAY1: Record<string, Record<number, 1 | -1>> = {
  p2: { 4: 1, 9: 1, 13: 1 }, // 39
  p3: { 1: -1, 2: -1 }, // 34
  p4: { 5: 1 }, // 37
  p5: { 7: 1, 12: 1 }, // 38
  p6: { 4: 1, 9: 1, 13: 1 }, // 39
  p7: { 10: 1 }, // 37
  p9: { 1: 1, 2: 1, 4: 1, 5: 1, 9: 1, 13: 1 }, // 42
  p10: { 5: 1, 12: 1, 14: 1, 17: 1 }, // 40
  p12: { 6: -1, 7: -1, 8: -1 }, // 33
} // p1, p8 and p11: 36
const POINTS1: Record<string, number> = { p1: 36, p2: 39, p3: 34, p4: 37, p5: 38, p6: 39, p7: 37, p8: 36, p9: 42, p10: 40, p11: 36, p12: 33 }

/**
 * The Day 2 cut (§5.2): above 36, (P1 − 36) / 2 rounded down, at most 4.
 * p2 39 → 1 · p4 37 → 0 · p5 38 → 1 · p6 39 → 1 · p7 37 → 0 · p9 42 → 3 · p10 40 → 2; nobody else is above 36.
 */
const CUT: Record<string, number> = { p1: 0, p2: 1, p3: 0, p4: 0, p5: 1, p6: 1, p7: 0, p8: 0, p9: 3, p10: 2, p11: 0, p12: 0 }
/** PH2 = PH1 − cut: 5 · 5 · 8 · 10 · 10 · 12 · 14 · 16 · 15 · 18 · 22 · 26. */
const PH2: Record<string, number> = Object.fromEntries(ids.map((p) => [p, PH1[p]! - CUT[p]!]))

/** Day 2. p2 and p6 make the same two birdies on the same holes, so their countback ties to the last hole. */
const DAY2: Record<string, Record<number, 1 | -1>> = {
  p1: { 10: -1 }, // 35
  p2: { 1: 1, 2: 1 }, // 38
  p3: { 3: -1 }, // 35
  p4: { 6: 1 }, // 37
  p5: { 9: 1, 12: 1, 15: 1, 18: 1 }, // 40
  p6: { 1: 1, 2: 1 }, // 38
  p7: { 11: 1 }, // 37
  p8: { 10: -1, 11: -1 }, // 34
  p9: { 3: 1, 6: 1, 9: 1, 12: 1 }, // 40
  p10: { 1: 1, 4: 1, 7: 1, 13: 1, 16: 1 }, // 41
  p11: { 8: 1 }, // 37
  p12: { 1: -1, 2: -1, 3: -1 }, // 33
}
const POINTS2: Record<string, number> = { p1: 35, p2: 38, p3: 35, p4: 37, p5: 40, p6: 38, p7: 37, p8: 34, p9: 40, p10: 41, p11: 37, p12: 33 }
/** Day 1 + Day 2. */
const TOTAL: Record<string, number> = { p1: 71, p2: 77, p3: 69, p4: 74, p5: 78, p6: 77, p7: 74, p8: 70, p9: 82, p10: 81, p11: 73, p12: 66 }

/**
 * Putts other than 2. Day 1: in group 1 p10 three-putts hole 3, then p4 and p7 both three-putt hole 9 (p7 holed
 * out last); in group 3 p12 three-putts hole 14; p3 one-putts holes 4, 6 and 8. Day 2: p1 three-putts hole 5
 * (group 1), p8 four-putts hole 18 (group 2), p3 three-putts hole 2 and p6 hole 17 (group 3).
 */
const PUTTS: Record<string, Record<string, Record<number, number>>> = {
  r1: { p10: { 3: 3 }, p4: { 9: 3 }, p7: { 9: 3 }, p12: { 14: 3 }, p3: { 4: 1, 6: 1, 8: 1 } },
  r2: { p1: { 5: 3 }, p8: { 18: 4 }, p3: { 2: 3 }, p6: { 17: 3 } },
}

/** Strokes received on a hole (§5.2): floor(PH / 18), plus one where SI ≤ PH % 18. */
const strokes = (ph: number, si: number) => Math.floor(ph / 18) + (si <= ph % 18 ? 1 : 0)

/**
 * The Calcutta: who owns each lot and what it sold for. Nobody topped p1's and p8's opening bids, so they own
 * themselves. p9 bought back 50 % of himself from p10 for 750 (half of 1,500), not paid yet.
 * Pot: 250 + 500 + 750 + 1,000 + 1,250 + 500 + 750 + 250 + 1,500 + 1,000 + 500 + 250 = 8,500.
 */
const LOTS: Array<[player: string, price: number, owner: string]> = [
  ['p1', 250, 'p1'],
  ['p2', 500, 'p3'],
  ['p3', 750, 'p4'],
  ['p4', 1000, 'p5'],
  ['p5', 1250, 'p6'],
  ['p6', 500, 'p7'],
  ['p7', 750, 'p8'],
  ['p8', 250, 'p8'],
  ['p9', 1500, 'p10'],
  ['p10', 1000, 'p11'],
  ['p11', 500, 'p12'],
  ['p12', 250, 'p1'],
]

function tournament() {
  const snap = makeFirstTournament()
  for (const [rid, days] of [['r1', DAY1], ['r2', DAY2]] as const) {
    for (const pid of ids) {
      const ph = rid === 'r1' ? PH1[pid]! : PH2[pid]!
      PAR_72.forEach(([par, si], i) => {
        const hole = i + 1
        const gross = par + strokes(ph, si) - (days[pid]?.[hole] ?? 0)
        snap.scores.push(score(rid, pid, hole, gross, PUTTS[rid]?.[pid]?.[hole] ?? 2))
      })
    }
  }
  snap.snakeTiebreaks.push({ roundId: 'r1', groupId: 'r1g1', hole: 9, lastHoledPlayerId: 'p7' })
  snap.rounds.forEach((r) => (r.status = 'finished'))
  snap.tournament.status = 'finished'
  LOTS.forEach(([playerId, price, ownerId], i) => snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId, lotNumber: i + 1, status: 'sold', price, ownerId, soldAt: '' }))
  snap.calcuttaBuybacks.push({ lotId: 'lot9', pct: 50, amount: 750, paid: false })
  // Everyone but p12 paid the entry on Calcutta night, and p6 paid his lot.
  for (const pid of ids.slice(0, 11)) snap.payments.push({ id: `entry-${pid}`, fromPlayerId: pid, toPlayerId: null, amount: 2500, kind: 'entry', paid: true, note: null })
  snap.payments.push({ id: 'lot-p6', fromPlayerId: 'p6', toPlayerId: null, amount: 1250, kind: 'calcutta', paid: true, note: null })
  return snap
}

const st = computeTournament(tournament(), S)
/** What one module pays each player, all its lines added up. */
function paidBy(moduleId: string) {
  const out: Record<string, number> = {}
  for (const p of st.prizes) if (p.moduleId === moduleId) out[p.playerId] = (out[p.playerId] ?? 0) + p.amount
  return out
}

describe('the first tournament, worked out by hand (QA-18)', () => {
  it('handicaps: Day 1 at 80 %, Day 2 after the cut', () => {
    for (const pid of ids) {
      expect(st.core.rounds.r1![pid]!.playingHcp, pid).toBe(PH1[pid])
      expect(st.core.rounds.r2![pid]!.cut, pid).toBe(CUT[pid])
      expect(st.core.rounds.r2![pid]!.playingHcp, pid).toBe(PH2[pid])
    }
  })

  it('points: 36 a day plus the birdies, minus the bogeys', () => {
    for (const pid of ids) {
      expect(st.core.rounds.r1![pid]!.points, pid).toBe(POINTS1[pid])
      expect(st.core.rounds.r2![pid]!.points, pid).toBe(POINTS2[pid])
      expect(st.core.totals[pid]!.points, pid).toBe(TOTAL[pid])
    }
  })

  it('the individual standings: p2 and p6 tie for 4th to the last hole and split places 4 and 5', () => {
    // 82 p9 · 81 p10 · 78 p5 · 77 p2 and p6 · 74 p7 and p4 · 73 p11 · 71 p1 · 70 p8 · 69 p3 · 66 p12.
    // p7 and p4: 37 each on Day 2, but Day 2's holes 10–18 are 19 for p7 (his birdie on 11) and 18 for p4 (his on 6).
    // p2 and p6: 38 each on Day 2, 18 on holes 10–18, 12 on 13–18, 6 on 16–18, 2 on 18: tied.
    const rows = st.modules.individual!.rows
    expect(rows.map((r) => r.playerId)).toEqual(['p9', 'p10', 'p5', 'p2', 'p6', 'p7', 'p4', 'p11', 'p1', 'p8', 'p3', 'p12'])
    expect(rows.map((r) => [r.position, r.tied])).toEqual([
      [1, false],
      [2, false],
      [3, false],
      [4, true],
      [4, true],
      [6, false],
      [7, false],
      [8, false],
      [9, false],
      [10, false],
      [11, false],
      [12, false],
    ])
    // 10,000 · 5,000 · 3,000, then 4th and 5th shared: (2,000 + 0) / 2 = 1,000 each. In all 20,000.
    expect(paidBy('individual')).toEqual({ p9: 10000, p10: 5000, p5: 3000, p2: 1000, p6: 1000 })
  })

  it('best round, the pairs, the snake and fewest putts', () => {
    // Best day: p9's 42 on Day 1, p10's 41 on Day 2, nobody level: 1,200 each.
    expect(paidBy('bestRound')).toEqual({ p9: 1200, p10: 1200 })
    // Pairs over both days: (p6, p9) 77 + 82 = 159 · (p1, p10) 71 + 81 = 152 · (p2, p11) 77 + 73 = 150 ·
    // (p4, p7) 74 + 74 = 148 · (p5, p8) 78 + 70 = 148 · (p3, p12) 69 + 66 = 135. First 2,000, second 1,000, halved.
    expect(paidBy('pairs')).toEqual({ p6: 1000, p9: 1000, p1: 500, p10: 500 })
    // The snake, 200 to each of the three who don't hold it at the end of each group's day:
    //   Day 1, group 1: p10 on 3, then p7 on 9 (he holed out last) → p1, p10, p4.
    //   Day 1, group 2: nobody three-putts → 600 split four ways, 150 each.
    //   Day 1, group 3: p12 on 14 → p3, p6, p9.
    //   Day 2, group 1: p1 on 5 → p10, p4, p7. Group 2: p8 on 18 → p2, p11, p5. Group 3: p3 on 2, p6 on 17 → p3, p12, p9.
    // 6 × 600 = 3,600.
    expect(paidBy('snake')).toEqual({ p1: 200, p2: 350, p3: 400, p4: 400, p5: 350, p6: 200, p7: 200, p8: 150, p9: 400, p10: 400, p11: 350, p12: 200 })
    // Putts: 72 for everyone, plus a stroke for each three-putt (two for p8's four-putt), less p3's three one-putts.
    // p3 72 − 3 + 1 = 70 is alone at the top; the next best is 72. 1,000.
    expect(paidBy('fewestPutts')).toEqual({ p3: 1000 })
    expect(st.modules.fewestPutts!.rows.find((r) => r.playerId === 'p3')!.putts).toBe(70)
  })

  it('the Calcutta: each slot, who owns it, and the rounding peso', () => {
    // 8,500 × 55 % = 4,675 · × 20 % = 1,700 · × 10 % = 850 · × 10 % = 850 · × 5 % = 425.
    // The champion p9 and the runner-up p10 are tier C and D, and each cashes only his highest slot: best of C
    // goes to the next C, p7 (74 over p8's 70), best of D to the next D, p11 (73 over p12's 66). Last is p12.
    const a = st.modules.auction!
    expect(a.pot).toBe(8500)
    expect(a.slots.map((s) => [s.playerIds, s.pesos])).toEqual([
      [['p9'], 4675],
      [['p10'], 1700],
      [['p7'], 850],
      [['p11'], 850],
      [['p12'], 425],
    ])
    // p9 is half p10's, half his own: 4,675 / 2 = 2,337.50 each, 2,337 in whole pesos, and the peso left over
    // goes to the champion's first owner, his buyer p10. p11 owns p10, p8 owns p7, p12 owns p11, p1 owns p12.
    expect(paidBy('auction')).toEqual({ p10: 2338, p9: 2337, p11: 1700, p8: 850, p12: 850, p1: 425 })
  })

  it('every person: what he puts in, what he takes out, and the difference', () => {
    // Pays: 2,500 entry, plus his lots (p1: 250 + 250, p8: 750 + 250), plus p9's 750 buyback to p10.
    // Prizes, from the lines above: p1 500 + 200 · p2 1,000 + 350 · p3 1,000 + 400 · p4 400 · p5 3,000 + 350 ·
    // p6 1,000 + 1,000 + 200 · p7 200 · p8 150 · p9 10,000 + 1,200 + 1,000 + 400 · p10 5,000 + 1,200 + 500 + 400 ·
    // p11 350 · p12 200. Receives: prizes, Calcutta shares, and p10 the buyback.
    const expected: Record<string, [prizes: number, calcutta: number, paid: number, receives: number, net: number]> = {
      p1: [700, 425, 3000, 1125, -1875],
      p2: [1350, 0, 2500, 1350, -1150],
      p3: [1400, 0, 3000, 1400, -1600],
      p4: [400, 0, 3250, 400, -2850],
      p5: [3350, 0, 3500, 3350, -150],
      p6: [2200, 0, 3750, 2200, -1550],
      p7: [200, 0, 3000, 200, -2800],
      p8: [150, 850, 3500, 1000, -2500],
      p9: [12600, 2337, 3250, 14937, 11687],
      p10: [7100, 2338, 4000, 10188, 6188],
      p11: [350, 1700, 3500, 2050, -1450],
      p12: [200, 850, 3000, 1050, -1950],
    }
    for (const pid of ids) {
      const m = st.money.people[pid]!
      expect([m.prizesTotal, m.calcuttaShares, m.paid, m.receives, m.net], pid).toEqual(expected[pid])
    }
    // The nets add up to nothing: 11,687 + 6,188 = 17,875 = what the other ten are down.
    expect(st.money.netSum).toBe(0)
    // The bank takes 12 × 2,500 + 8,500 = 38,500 and pays the 30,000 of prizes and the 8,500 of the Calcutta.
    expect(st.money.banker).toMatchObject({ playerId: 'p1', receives: 38500, pays: 38500, difference: 0, balanced: true })
    expect(st.prizes.every((p) => p.final)).toBe(true)
    expect(st.money.unassigned.total).toBe(0)
    expect(st.flags.warnings).toEqual([])
  })

  it('the settlement, on what is still owed: vía banco and sin banco', () => {
    // Vía banco: what the bank still owes each one, less what he still owes the bank (only p12's entry, and every
    // lot but p6's). p1 1,125 − 500 = 625 · p3 1,400 − 500 = 900 · p4 400 − 750 = −350 · p5 3,350 − 1,000 = 2,350 ·
    // p7 200 − 500 = −300 · p8 1,000 − 1,000 = 0 (the line closes both) · p9 12,600 + 2,337 = 14,937 ·
    // p10 9,438 − 1,500 = 7,938 · p11 2,050 − 1,000 = 1,050 · p12 1,050 − 2,500 − 500 = −1,950. The buyback goes direct.
    expect(st.money.viaBank.map((t) => [t.from, t.to, t.amount])).toEqual([
      [null, 'p1', 625],
      [null, 'p2', 1350],
      [null, 'p3', 900],
      ['p4', null, 350],
      [null, 'p5', 2350],
      [null, 'p6', 2200],
      ['p7', null, 300],
      ['p8', null, 0],
      [null, 'p9', 14937],
      [null, 'p10', 7938],
      [null, 'p11', 1050],
      ['p12', null, 1950],
      ['p9', 'p10', 750],
    ])
    // Sin banco: the banker p1 holds the bank, which has 11 × 2,500 + 1,250 = 28,750 in hand and owes it all out,
    // so he stands at 625 − 28,750 = −28,125. With the buyback, p9 is owed 14,937 − 750 = 14,187 and p10
    // 7,938 + 750 = 8,688. The largest debtor pays the largest creditor, in that order, each once:
    // p1 pays p9, p10, p5, p6 and 700 of p2's 1,350; p12's 1,950 covers the rest of p2, p11 and 250 of p3;
    // p4 and p7 pay the rest of p3.
    expect(st.money.peerToPeer.map((t) => [t.from, t.to, t.amount])).toEqual([
      ['p1', 'p9', 14187],
      ['p1', 'p10', 8688],
      ['p1', 'p5', 2350],
      ['p1', 'p6', 2200],
      ['p1', 'p2', 700],
      ['p12', 'p2', 650],
      ['p12', 'p11', 1050],
      ['p12', 'p3', 250],
      ['p4', 'p3', 350],
      ['p7', 'p3', 300],
    ])
  })
})
