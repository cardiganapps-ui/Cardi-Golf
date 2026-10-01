/**
 * Formats that pay on strokes rank fairly (MONEY-02), and a team is one
 * entrant in the Calcutta (MONEY-20). Adapted from the 2026-09-30 panel's
 * reproductions (docs/review/2026-09-30/evidence/panel/MONEY/focused.test.ts),
 * which showed:
 * - a player who walked off after nine holes at +9 won the stroke-play prize;
 * - live, +8 through 4 led −12 through 12;
 * - a best-ball team missing the back nine beat a complete team;
 * - one birdie and gone won the Low neto pot;
 * - the winning team took both the champion's and the runner-up's Calcutta slots.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import type { TournamentSettings } from '../settings/schema'
import { PAR_72, makePlayer, makeRound, makeSnapshot, score } from '../testing/fixtures'
import type { Snapshot } from '../types'

/** Every listed hole at par + delta (default card PAR_72). */
function card(snap: Snapshot, pid: string, holes: number[], delta = 0) {
  for (const h of holes) snap.scores.push(score('r1', pid, h, PAR_72[h - 1]![0] + delta, 2))
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

function strokePlay(prizes: number[]): TournamentSettings {
  const base = structuredClone(DEFAULT_SETTINGS)
  return {
    ...base,
    entryFee: 500,
    prizes: { ...base.prizes, stableford: prizes },
    modules: { ...base.modules, individual: { ...base.modules.individual, format: 'strokePlay', formatOptions: { ...base.modules.individual.formatOptions, scoring: 'gross' } } },
  }
}

describe('stroke play pays a full card (MONEY-02)', () => {
  it('a player who walks off after nine holes does not win', () => {
    const settings = strokePlay([1000])
    const snap = makeSnapshot({ players: [1, 2].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    card(snap, 'p1', range(1, 18), 0) // 72, even, complete
    card(snap, 'p2', range(1, 9), 1) // +9 over nine, then walked off
    const st = computeTournament(snap, settings)
    expect(st.modules.individual!.rows.map((r) => r.playerId)).toEqual(['p1', 'p2'])
    expect(st.prizes.filter((p) => p.moduleId === 'individual').map((p) => [p.playerId, p.amount])).toEqual([['p1', 1000]])
    expect(st.modules.individual!.warnings.join(' ')).toMatch(/incompleta.*9 de 18/)
  })

  it('an incomplete card that is better to par still ranks after every complete one', () => {
    const settings = strokePlay([1000, 500])
    const snap = makeSnapshot({ players: [1, 2, 3].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    card(snap, 'p1', range(1, 18), 1) // +18, complete
    card(snap, 'p2', range(1, 17), -1) // −17 through 17
    card(snap, 'p3', range(1, 18), 0) // E, complete
    const rows = computeTournament(snap, settings).modules.individual!.rows
    expect(rows.map((r) => r.playerId)).toEqual(['p3', 'p1', 'p2'])
  })

  it('live, the board ranks to par: −12 through 12 leads +8 through 4', () => {
    const settings = strokePlay([1000])
    const snap = makeSnapshot({ players: [1, 2].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: [makeRound(1, { status: 'live' })], settings })
    card(snap, 'p1', range(1, 12), -1)
    card(snap, 'p2', range(1, 4), 2)
    const st = computeTournament(snap, settings)
    expect(st.modules.individual!.rows.map((r) => [r.playerId, r.figure.text])).toEqual([
      ['p1', '−12'],
      ['p2', '+8'],
    ])
    // The «si terminara ahora» chip follows the board.
    expect(st.prizes.filter((p) => p.moduleId === 'individual').map((p) => p.playerId)).toEqual(['p1'])
    // Live, nobody is called incomplete: everyone is still playing.
    expect(st.modules.individual!.warnings).toEqual([])
  })

  it('best ball on strokes: a team missing the back nine ranks after a complete team', () => {
    const base = structuredClone(DEFAULT_SETTINGS)
    const settings: TournamentSettings = {
      ...base,
      entryFee: 500,
      prizes: { ...base.prizes, stableford: [2000] },
      modules: { ...base.modules, individual: { ...base.modules.individual, format: 'team', formatOptions: { ...base.modules.individual.formatOptions, teamMode: 'bestBall', teamScoring: 'strokes', scoring: 'gross' } } },
    }
    const snap = makeSnapshot({ players: [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    snap.pairs = [
      { id: 'A', name: 'A', player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'B', name: 'B', player1Id: 'p3', player2Id: 'p4', kind: null, pickedByHonoree: false, drawnAt: null },
    ]
    card(snap, 'p1', range(1, 10), -1)
    card(snap, 'p1', range(11, 18), 0)
    card(snap, 'p2', range(1, 18), 1)
    card(snap, 'p3', range(1, 9), 1)
    card(snap, 'p4', range(1, 9), 2)
    const st = computeTournament(snap, settings)
    expect(st.modules.individual!.rows.map((r) => r.playerId)).toEqual(['A', 'B'])
    expect(st.prizes.filter((p) => p.moduleId === 'individual').map((p) => p.playerId).sort()).toEqual(['p1', 'p2'])
  })

  it('Stableford is unchanged: missing holes already score nothing, and nobody is flagged', () => {
    const base = structuredClone(DEFAULT_SETTINGS)
    const settings: TournamentSettings = { ...base, entryFee: 500, prizes: { ...base.prizes, stableford: [1000] } }
    const snap = makeSnapshot({ players: [1, 2].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    card(snap, 'p1', range(1, 18), 1) // 18 points
    card(snap, 'p2', range(1, 9), -1) // 27 points over nine
    const st = computeTournament(snap, settings)
    expect(st.modules.individual!.rows.map((r) => r.playerId)).toEqual(['p2', 'p1'])
    expect(st.modules.individual!.warnings).toEqual([])
  })
})

describe('Low neto pays a full card (MONEY-02)', () => {
  it('one birdie and gone does not win the pot', () => {
    const base = structuredClone(DEFAULT_SETTINGS)
    const settings: TournamentSettings = {
      ...base,
      games: [{ id: 'lownet', type: 'lowScore', label: 'Low neto', enabled: true, rounds: 'all', entrants: 'all', options: { basis: 'net', scope: 'perRound' }, money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [100] } }],
    }
    const snap = makeSnapshot({ players: [1, 2, 3].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    card(snap, 'p1', range(1, 18), 0)
    card(snap, 'p2', range(1, 18), 0)
    card(snap, 'p3', [1], -1)
    const st = computeTournament(snap, settings)
    const prizes = st.prizes.filter((p) => p.gameId === 'lownet').map((p) => [p.playerId, p.amount])
    expect(prizes).toEqual([
      ['p1', 150],
      ['p2', 150],
    ])
    expect(st.games.lownet!.board.notes.join(' ')).toMatch(/incompleta.*\(1 de 18\)/)
  })
})

describe('a team is one entrant in the Calcutta (MONEY-20)', () => {
  it('three teams of two: champion slot to team 1, runner-up slot to team 2, the pot conserved', () => {
    const base = structuredClone(FIRST_TOURNAMENT_SETTINGS)
    const settings: TournamentSettings = {
      ...base,
      tiers: [],
      modules: {
        ...base.modules,
        pairs: { ...base.modules.pairs, enabled: false, pairing: [] },
        snake: { ...base.modules.snake, enabled: false },
        bestRound: { ...base.modules.bestRound, enabled: false },
        fewestPutts: { ...base.modules.fewestPutts, enabled: false },
        individual: { ...base.modules.individual, format: 'team', formatOptions: { ...base.modules.individual.formatOptions, teamMode: 'bestBall', teamScoring: 'strokes', scoring: 'gross' } },
      },
      rounds: 1,
      entryFee: 0,
      prizes: { ...base.prizes, stableford: [] },
      auction: { ...base.auction, payout: [{ slot: 'place', place: 1, share: 0.7 }, { slot: 'place', place: 2, share: 0.3 }] },
    }
    const players = [1, 2, 3, 4, 5, 6].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    snap.teams = [
      { id: 'T1', name: 'Uno', number: 1, playerIds: ['p1', 'p2'], drawnAt: null },
      { id: 'T2', name: 'Dos', number: 2, playerIds: ['p3', 'p4'], drawnAt: null },
      { id: 'T3', name: 'Tres', number: 3, playerIds: ['p5', 'p6'], drawnAt: null },
    ]
    card(snap, 'p1', range(1, 18), -1)
    card(snap, 'p2', range(1, 18), 0)
    card(snap, 'p3', range(1, 18), 0)
    card(snap, 'p4', range(1, 18), 1)
    card(snap, 'p5', range(1, 18), 1)
    card(snap, 'p6', range(1, 18), 2)
    // Each player owns himself; every lot sold for $1,000: a $6,000 pot.
    players.forEach((p, i) => snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 1000, ownerId: p.id, soldAt: '' }))
    const a = computeTournament(snap, settings).modules.auction!
    expect(a.slots.map((s) => [s.playerIds, s.share, s.amount])).toEqual([
      [['p1', 'p2'], 0.7, 4200],
      [['p3', 'p4'], 0.3, 1800],
    ])
    expect(Object.fromEntries(Object.entries(a.payouts).map(([k, v]) => [k, v.amount]))).toEqual({ p1: 2100, p2: 2100, p3: 900, p4: 900 })
    expect(Object.values(a.payouts).reduce((s, v) => s + v.amount, 0)).toBe(6000)
    // Called what it is: a team in 1st, not a two-way tie.
    expect(a.slots[0]!.why.steps.join(' ')).not.toMatch(/Empate/)
  })

  it('two teams tied for 1st share 1st and 2nd between their four players', () => {
    const base = structuredClone(FIRST_TOURNAMENT_SETTINGS)
    const settings: TournamentSettings = {
      ...base,
      tiers: [],
      modules: {
        ...base.modules,
        pairs: { ...base.modules.pairs, enabled: false, pairing: [] },
        snake: { ...base.modules.snake, enabled: false },
        bestRound: { ...base.modules.bestRound, enabled: false },
        fewestPutts: { ...base.modules.fewestPutts, enabled: false },
        individual: { ...base.modules.individual, format: 'team', formatOptions: { ...base.modules.individual.formatOptions, teamMode: 'bestBall', teamScoring: 'strokes', scoring: 'gross' } },
      },
      rounds: 1,
      entryFee: 0,
      prizes: { ...base.prizes, stableford: [] },
      auction: { ...base.auction, payout: [{ slot: 'place', place: 1, share: 0.7 }, { slot: 'place', place: 2, share: 0.3 }] },
    }
    const players = [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    snap.teams = [
      { id: 'T1', name: 'Uno', number: 1, playerIds: ['p1', 'p2'], drawnAt: null },
      { id: 'T2', name: 'Dos', number: 2, playerIds: ['p3', 'p4'], drawnAt: null },
    ]
    for (const p of ['p1', 'p2', 'p3', 'p4']) card(snap, p, range(1, 18), 0)
    players.forEach((p, i) => snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 1000, ownerId: p.id, soldAt: '' }))
    const a = computeTournament(snap, settings).modules.auction!
    expect(a.slots).toHaveLength(1)
    expect(a.slots[0]!.share).toBeCloseTo(1)
    expect(Object.values(a.payouts).map((v) => v.amount)).toEqual([1000, 1000, 1000, 1000])
  })
})
