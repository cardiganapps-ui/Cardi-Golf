import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { FIRST_TOURNAMENT_SETTINGS, DEFAULT_SETTINGS } from '../settings/presets'
import { fillRound, makeFirstTournament, makeGroup, makePlayer, makeSnapshot, PAR_72, score } from '../testing/fixtures'
import { buildTournamentResults } from './results'

function finished() {
  const snap = makeFirstTournament()
  fillRound(snap, 'r1', 11)
  fillRound(snap, 'r2', 12)
  snap.rounds.forEach((r) => (r.status = 'finished'))
  snap.tournament.status = 'finished'
  return snap
}

describe('published tournament results', () => {
  it('one row per player: finish, points per round, what paid, and the net from the money module', () => {
    const snap = finished()
    const state = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS)
    const rows = buildTournamentResults(state, snap.players)
    expect(rows).toHaveLength(12)
    const byRank = [...rows].sort((a, b) => a.rank! - b.rank!)
    expect(byRank[0]!.rank).toBe(1)
    for (const r of rows) {
      const ind = state.modules.individual!.rows.find((x) => x.playerId === r.playerId)!
      expect(r.rankLabel).toBe(ind.label)
      expect(r.points).toBe(ind.total)
      expect(r.perRound.reduce((s, x) => s + x, 0)).toBe(ind.total)
      expect(r.net).toBe(state.money.people[r.playerId]!.net)
    }
    // The champion's first prize is among their awards; no amounts are published besides the private net.
    const champ = state.modules.individual!.rows.find((x) => x.position === 1)!.playerId
    expect(rows.find((r) => r.playerId === champ)!.awards.some((a) => a.startsWith('prize:'))).toBe(true)
    expect(Object.keys(rows[0]!).sort()).toEqual(['awards', 'net', 'perRound', 'playerId', 'points', 'rank', 'rankLabel'])
  })

  it('a team format publishes each member with his team’s place (STRAT-03: before, nobody had a finish)', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.modules.individual = { ...settings.modules.individual, format: 'team', formatOptions: { ...settings.modules.individual.formatOptions, teamMode: 'bestBall', teamScoring: 'stableford' } }
    const snap = makeSnapshot({ settings, players: [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: 1 })
    snap.pairs = [
      { id: 'tA', name: 'Los Compadres', player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'tB', name: 'Las Palmas', player1Id: 'p3', player2Id: 'p4', kind: null, pickedByHonoree: false, drawnAt: null },
    ]
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2', 'p3', 'p4'])]
    fillRound(snap, 'r1', 3)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    snap.tournament.status = 'finished'
    const state = computeTournament(snap, settings)
    const rows = buildTournamentResults(state, snap.players)
    const team = (id: string) => state.modules.individual!.rows.find((r) => r.entrant.id === id)!
    for (const [pid, tid] of [['p1', 'tA'], ['p2', 'tA'], ['p3', 'tB'], ['p4', 'tB']] as const) {
      const r = rows.find((x) => x.playerId === pid)!
      expect(r).toMatchObject({ rank: team(tid).position, rankLabel: team(tid).label, points: team(tid).total })
    }
  })

  it('stroke play publishes the finish and no «points»: a stroke total is not points', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.modules.individual = { ...settings.modules.individual, format: 'strokePlay' }
    const snap = makeSnapshot({ settings, players: [1, 2, 3].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: 1 })
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2', 'p3'])]
    fillRound(snap, 'r1', 5)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    snap.tournament.status = 'finished'
    const rows = buildTournamentResults(computeTournament(snap, settings), snap.players)
    expect(rows.map((r) => r.rank).sort()).toEqual([1, 2, 3])
    expect(rows.every((r) => r.points === null && r.perRound.length === 0)).toBe(true)
  })

  it('match play with a halved match publishes no half point, so the database takes it', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.modules.individual = { ...settings.modules.individual, format: 'matchPlay', formatOptions: { ...settings.modules.individual.formatOptions, matchMode: 'singles', scoring: 'gross' } }
    const snap = makeSnapshot({ settings, players: [1, 2].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: 1 })
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2'])]
    // The same card for both: the match is halved, ½ point each.
    for (const pid of ['p1', 'p2']) for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', pid, h, PAR_72[h - 1]![0], 2))
    snap.rounds.forEach((r) => (r.status = 'finished'))
    snap.tournament.status = 'finished'
    const state = computeTournament(snap, settings)
    expect(state.modules.individual!.rows.map((r) => r.total)).toEqual([0.5, 0.5])
    const rows = buildTournamentResults(state, snap.players)
    expect(rows.map((r) => [r.rank, r.points])).toEqual([[1, null], [1, null]])
    // Every number published is a whole number (tournament_results.points integer, per_round integer[]).
    expect(rows.flatMap((r) => [r.rank, r.points, ...r.perRound]).filter((v) => v != null && !Number.isInteger(v))).toEqual([])
  })

  it('with the individual game off there is no finish, and awards are only the fun ones', () => {
    const snap = finished()
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.modules.individual.enabled = false
    const rows = buildTournamentResults(computeTournament(snap, settings), snap.players)
    expect(rows.every((r) => r.rank === null && r.rankLabel === null && r.points === null)).toBe(true)
    expect(rows.every((r) => r.awards.every((a) => a.startsWith('award:')))).toBe(true)
  })
})
