/**
 * Best round, pairs and fewest putts, plus the cross-module rules:
 * each module can be disabled (state absent, money unaffected) and a
 * minimal tournament (8 players, 1 round, individual only) works.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { checkPrizePool } from '../settings/prizeCheck'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import type { ModuleId } from '../settings/schema'
import { fillRound, makeFirstTournament, makeSnapshot, score } from '../testing/fixtures'
import { generateGroupsFromStandings } from './pairs'

const S = FIRST_TOURNAMENT_SETTINGS

function fullFirstTournament(seed = 7) {
  const snap = makeFirstTournament()
  fillRound(snap, 'r1', seed)
  fillRound(snap, 'r2', seed + 1)
  snap.rounds.forEach((r) => (r.status = 'finished'))
  return snap
}

describe('Mejor ronda', () => {
  it('pays $1,200 per day to the best single-day total, using Day 2 adjusted handicaps', () => {
    const snap = fullFirstTournament()
    const st = computeTournament(snap, S)
    const days = st.modules.bestRound!.days
    expect(days).toHaveLength(2)
    for (const d of days) {
      const best = Math.max(...d.rows.map((r) => r.points))
      const winners = d.rows.filter((r) => r.points === best)
      const paid = Object.values(d.winners).reduce((s, w) => s + w.amount, 0)
      expect(paid).toBe(1200)
      expect(Object.keys(d.winners).length).toBeLessThanOrEqual(winners.length)
      expect(d.final).toBe(true)
    }
    // Day 2 uses the cut handicaps: the core already applied them, so the day-2 rows come from those.
    const r2 = st.core.rounds.r2!
    expect(Object.values(r2).some((pr) => pr.cut > 0)).toBe(true)
  })

  it('a day with no scores pays nobody', () => {
    const snap = makeFirstTournament()
    const st = computeTournament(snap, S)
    expect(st.modules.bestRound!.days.every((d) => Object.keys(d.winners).length === 0)).toBe(true)
  })
})

describe('Los Matrimonios', () => {
  it('pair score is the sum of both partners’ points; 1st pair $1,000 each, 2nd $500 each', () => {
    const snap = fullFirstTournament()
    const st = computeTournament(snap, S)
    const pairs = st.modules.pairs!
    expect(pairs.rows).toHaveLength(6)
    for (const row of pairs.rows) {
      const [a, b] = row.playerIds
      expect(row.total).toBe(st.core.totals[a]!.points + st.core.totals[b]!.points)
    }
    const first = pairs.rows[0]!
    const second = pairs.rows[1]!
    if (!first.tied) {
      expect(pairs.prizes[first.playerIds[0]]!.amount).toBe(1000)
      expect(pairs.prizes[first.playerIds[1]]!.amount).toBe(1000)
    }
    if (!second.tied && !first.tied) {
      expect(pairs.prizes[second.playerIds[0]]!.amount).toBe(500)
    }
    expect(st.prizes.filter((p) => p.moduleId === 'pairs').reduce((s, p) => s + p.amount, 0)).toBe(3000)
    expect(pairs.groupWarnings).toEqual([])
    expect(pairs.unpaired).toEqual([])
  })

  it('tie: better combined Day 2 decides, else split', () => {
    const snap = makeFirstTournament()
    // Pair1 (p1,p10) and pair2 (p2,p11): same total, pair2 better on day 2.
    const holes = snap.courses[0]!.tees[0]!.holes
    const enter = (rid: string, pid: string, ptsPerHole: number) => {
      const p = snap.players.find((x) => x.id === pid)!
      const ph = Math.floor(0.8 * p.baseHcp + 0.5)
      for (let h = 1; h <= 18; h++) {
        const sr = Math.floor(ph / 18) + (holes[h - 1]!.strokeIndex <= ph % 18 ? 1 : 0)
        snap.scores.push(score(rid, pid, h, holes[h - 1]!.par + sr + 2 - ptsPerHole))
      }
    }
    enter('r1', 'p1', 2); enter('r2', 'p1', 2); enter('r1', 'p10', 2); enter('r2', 'p10', 1) // 36+36+36+18 = 126
    enter('r1', 'p2', 2); enter('r2', 'p2', 2); enter('r1', 'p11', 1); enter('r2', 'p11', 2) // 36+36+18+36 = 126
    const rows = computeTournament(snap, S).modules.pairs!.rows
    expect(rows[0]!.pairId).toBe('pair2')
    expect(rows[0]!.label).toBe('1')
    expect(rows[1]!.pairId).toBe('pair1')
  })

  it('warns when a group is not one A+D pair plus one B+C pair', () => {
    const snap = makeFirstTournament()
    snap.groups[0]!.playerIds = ['p1', 'p10', 'p2', 'p11'] // two A+D pairs
    const st = computeTournament(snap, S)
    expect(st.modules.pairs!.groupWarnings[0]!.groupId).toBe('r1g1')
    expect(st.flags.warnings.join(' ')).toContain('AD')
  })

  it('generates Day 2 groups (5,6), (3,4), (1,2) from the standings', () => {
    expect(generateGroupsFromStandings(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual([
      ['e', 'f'],
      ['c', 'd'],
      ['a', 'b'],
    ])
    expect(generateGroupsFromStandings(['a', 'b', 'c', 'd', 'e'])).toEqual([['d', 'e'], ['b', 'c'], ['a']])
  })
})

describe('Menos putts', () => {
  it('lowest total putts over 36 holes wins $1,000; picked-up holes count 3', () => {
    const snap = fullFirstTournament()
    // Make p5 pick up on hole 1 of day 1 with no putts entered.
    const s = snap.scores.find((x) => x.playerId === 'p5' && x.roundId === 'r1' && x.hole === 1)!
    s.pickedUp = true
    s.strokes = null
    s.putts = null
    const st = computeTournament(snap, S)
    const fp = st.modules.fewestPutts!
    const p5 = fp.rows.find((r) => r.playerId === 'p5')!
    const rawP5 = snap.scores.filter((x) => x.playerId === 'p5' && !x.pickedUp).reduce((a, x) => a + (x.putts ?? 0), 0)
    expect(p5.putts).toBe(rawP5 + 3)
    expect(p5.pickedUpHoles).toBe(1)
    const min = Math.min(...fp.rows.map((r) => r.putts))
    expect(fp.rows[0]!.putts).toBe(min)
    expect(Object.values(fp.prizes).reduce((a, p) => a + p.amount, 0)).toBe(1000)
  })

  it('tie splits the prize', () => {
    const snap = makeSnapshot({ players: 3, rounds: 1, settings: S })
    for (const pid of ['p1', 'p2', 'p3']) for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', pid, h, 4, pid === 'p3' ? 2 : 1))
    const fp = computeTournament(snap, S).modules.fewestPutts!
    expect(fp.rows.map((r) => r.label)).toEqual(['T1', 'T1', '3'])
    expect(fp.prizes.p1!.amount).toBe(500)
    expect(fp.prizes.p2!.amount).toBe(500)
  })
})

describe('module switches (§0.5)', () => {
  const ids: ModuleId[] = ['bestRound', 'pairs', 'snake', 'fewestPutts', 'auction']
  it.each(ids)('disabling %s removes its state and its money', (id) => {
    const snap = fullFirstTournament()
    if (id === 'auction') {
      snap.players.forEach((p, i) => snap.calcuttaLots.push({ id: `l${i}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 500, ownerId: p.id, soldAt: '' }))
    }
    const on = computeTournament(snap, S)
    expect(on.modules[id]).toBeDefined()
    expect(on.prizes.some((p) => p.moduleId === id)).toBe(true)

    const settings = structuredClone(S)
    settings.modules[id].enabled = false
    const off = computeTournament(snap, settings)
    expect(off.modules[id]).toBeUndefined()
    expect(off.prizes.some((p) => p.moduleId === id)).toBe(false)
    expect(off.money.flows.some((f) => f.label.startsWith(S.modules[id].label))).toBe(false)
    // Everything else is untouched.
    const other = on.prizes.filter((p) => p.moduleId !== id).reduce((s, p) => s + p.amount, 0)
    expect(off.prizes.reduce((s, p) => s + p.amount, 0)).toBe(other)
  })

  it('a minimal tournament works: 8 players, 1 round, individual Stableford only, no tiers', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.entryFee = 500
    settings.prizes.stableford = [2000, 1200, 800]
    expect(checkPrizePool(settings, { players: 8 }).balanced).toBe(true)
    const snap = makeSnapshot({ players: 8, rounds: 1, settings })
    fillRound(snap, 'r1', 3)
    snap.rounds[0]!.status = 'finished'
    const st = computeTournament(snap, settings)
    expect(Object.keys(st.modules)).toEqual(['individual'])
    expect(st.modules.individual!.rows).toHaveLength(8)
    expect(st.prizes.reduce((s, p) => s + p.amount, 0)).toBe(4000)
    expect(st.money.banker.receives).toBe(4000)
    expect(st.money.banker.pays).toBe(4000)
    expect(st.money.banker.balanced).toBe(true)
    expect(st.flags.missingModules).toEqual([])
    expect(st.tournamentFinal).toBe(true)
  })
})
