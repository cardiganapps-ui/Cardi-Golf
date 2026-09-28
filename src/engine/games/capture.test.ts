/**
 * Captured games: hole contests (group claims, Comité overrides, disputes,
 * greenies needing par) and the custom bet the Comité settles.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { DEFAULT_SETTINGS } from '../settings/presets'
import type { GameConfig, GameMoney } from '../settings/games'
import type { TournamentSettings } from '../settings/schema'
import { makePlayer, makeRound, makeSnapshot, PAR_72, score } from '../testing/fixtures'
import type { HoleAward, Snapshot } from '../types'
import type { ContestState } from './contest'

const PARS = PAR_72.map(([p]) => p)
// PAR_72 par 3s: holes 3, 7, 11, 16.

const money = (over: Partial<GameMoney>): GameMoney => ({ source: 'none', buyIn: 0, amount: 0, stake: 0, split: [100], ...over })

function setup(games: GameConfig[], players = 4): Snapshot {
  const settings: TournamentSettings = { ...DEFAULT_SETTINGS, games }
  const snap = makeSnapshot({ settings, players: Array.from({ length: players }, (_, i) => makePlayer(i + 1, { baseHcp: 0 })), rounds: [makeRound(1)] })
  for (let i = 1; i <= players; i++) for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', `p${i}`, h, PARS[h - 1]!))
  return snap
}
const award = (hole: number, playerId: string, groupId: string | null = 'g1', gameId = 'ctp'): HoleAward => ({ roundId: 'r1', groupId, hole, gameId, playerId })
const run = (snap: Snapshot) => computeTournament(snap, snap.tournament.settings as TournamentSettings)

const ctp = (m: GameMoney): GameConfig => ({ id: 'ctp', type: 'contest', label: 'Más cerca', enabled: true, rounds: 'all', entrants: 'all', options: { kind: 'closest', holes: 'par3' }, money: m })

describe('hole contests', () => {
  it('closest to the pin on the par 3s: 4 × $100 = $400 over 2 holes won → $200 each', () => {
    const snap = setup([ctp(money({ source: 'side', buyIn: 100 }))])
    snap.holeAwards = [award(3, 'p1'), award(7, 'p2')]
    const st = run(snap)
    const s = st.games.ctp!.state as ContestState
    expect(s.holes.map((h) => [h.hole, h.status])).toEqual([[3, 'won'], [7, 'won'], [11, 'open'], [16, 'open']])
    expect(Object.fromEntries(st.prizes.map((p) => [p.playerId, p.amount]))).toEqual({ p1: 200, p2: 200 })
  })

  it('two groups claiming different winners is a dispute: nothing paid until the Comité decides', () => {
    const snap = setup([ctp(money({ source: 'side', buyIn: 100 }))])
    snap.holeAwards = [award(3, 'p1', 'g1'), award(3, 'p3', 'g2')]
    let st = run(snap)
    expect((st.games.ctp!.state as ContestState).holes[0]!.status).toBe('disputed')
    expect(st.prizes).toEqual([])
    expect(st.flags.warnings.some((w) => w.includes('en disputa'))).toBe(true)
    // The Comité's pick (no group) wins over the groups' claims.
    snap.holeAwards.push(award(3, 'p3', null))
    st = run(snap)
    expect((st.games.ctp!.state as ContestState).holes[0]!).toMatchObject({ status: 'won', winners: ['p3'] })
    expect(st.prizes.map((p) => [p.playerId, p.amount])).toEqual([['p3', 400]])
  })

  it('greenies: one per group allowed, and only with par or better', () => {
    const g: GameConfig = { id: 'gr', type: 'contest', label: 'Greenies', enabled: true, rounds: 'all', entrants: 'all', options: { kind: 'greenie', holes: 'par3' }, money: money({ source: 'direct', stake: 20 }) }
    const snap = setup([g])
    snap.scores.find((s) => s.playerId === 'p4' && s.hole === 7)!.strokes = 4 // bogey on the 7th
    snap.holeAwards = [award(3, 'p1', 'g1', 'gr'), award(3, 'p2', 'g2', 'gr'), award(7, 'p4', 'g2', 'gr')]
    const st = run(snap)
    const s = st.games.gr!.state as ContestState
    expect(s.units).toEqual({ p1: 1, p2: 1, p3: 0, p4: 0 })
    expect(s.holes[1]!.voided).toEqual(['p4'])
    // J1 and J2: $20 from each of the other three; they net each other out.
    const bets = st.money.flows.filter((f) => f.kind === 'bet').map((f) => `${f.from}>${f.to}:${f.amount}`).sort()
    expect(bets).toEqual(['p3>p1:20', 'p3>p2:20', 'p4>p1:20', 'p4>p2:20'])
  })

  it('chosen holes only: a claim on another hole is ignored', () => {
    const g: GameConfig = { id: 'ctp', type: 'contest', label: 'Drive', enabled: true, rounds: 'all', entrants: 'all', options: { kind: 'longDrive', holes: [5, 14] }, money: money({ source: 'main', amount: 300 }) }
    const snap = setup([g])
    snap.holeAwards = [award(5, 'p2'), award(3, 'p1')]
    const st = run(snap)
    expect((st.games.ctp!.state as ContestState).holes.map((h) => h.hole)).toEqual([5, 14])
    expect(st.prizes.map((p) => [p.playerId, p.amount])).toEqual([['p2', 300]])
  })
})

describe('apuesta libre', () => {
  const custom = (m: GameMoney): GameConfig => ({ id: 'tacos', type: 'custom', label: 'El que coma más tacos', enabled: true, rounds: 'all', entrants: 'all', options: { description: 'En la cena del sábado' }, money: m })

  it('nothing moves until the Comité marks a winner', () => {
    const snap = setup([custom(money({ source: 'side', buyIn: 100 }))])
    expect(run(snap).prizes).toEqual([])
  })

  it('side pot: 4 × $100, two winners with shares 2:1 → $267 / $133', () => {
    const snap = setup([custom(money({ source: 'side', buyIn: 100 }))])
    snap.gameResults = [{ gameId: 'tacos', playerId: 'p1', share: 2 }, { gameId: 'tacos', playerId: 'p2', share: 1 }]
    const st = run(snap)
    expect(Object.fromEntries(st.prizes.map((p) => [p.playerId, p.amount]))).toEqual({ p1: 267, p2: 133 })
    expect(st.money.banker.balanced).toBe(true)
  })

  it('direct: each loser pays $50 to the winner', () => {
    const snap = setup([custom(money({ source: 'direct', stake: 50 }))])
    snap.gameResults = [{ gameId: 'tacos', playerId: 'p4', share: 1 }]
    const bets = run(snap).money.flows.filter((f) => f.kind === 'bet').map((f) => `${f.from}>${f.to}:${f.amount}`).sort()
    expect(bets).toEqual(['p1>p4:50', 'p2>p4:50', 'p3>p4:50'])
  })

  it('direct with two winners: losers pay both, winners do not pay each other', () => {
    const snap = setup([custom(money({ source: 'direct', stake: 50 }))])
    snap.gameResults = [{ gameId: 'tacos', playerId: 'p1', share: 1 }, { gameId: 'tacos', playerId: 'p2', share: 1 }]
    const bets = run(snap).money.flows.filter((f) => f.kind === 'bet').map((f) => `${f.from}>${f.to}`).sort()
    expect(bets).toEqual(['p3>p1', 'p3>p2', 'p4>p1', 'p4>p2'])
  })
})
