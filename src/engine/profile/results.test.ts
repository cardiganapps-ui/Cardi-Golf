import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { FIRST_TOURNAMENT_SETTINGS, DEFAULT_SETTINGS } from '../settings/presets'
import { fillRound, makeFirstTournament } from '../testing/fixtures'
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

  it('with the individual game off there is no finish, and awards are only the fun ones', () => {
    const snap = finished()
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.modules.individual.enabled = false
    const rows = buildTournamentResults(computeTournament(snap, settings), snap.players)
    expect(rows.every((r) => r.rank === null && r.rankLabel === null && r.points === null)).toBe(true)
    expect(rows.every((r) => r.awards.every((a) => a.startsWith('award:')))).toBe(true)
  })
})
