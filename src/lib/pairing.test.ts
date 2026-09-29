import { describe, expect, it } from 'vitest'
import { makeFirstTournament } from '../engine/testing/fixtures'
import { drawGroupsFromPairs, drawPairs, drawTeams, groupsFromTeams, partnerTier, shuffle } from './pairing'
import type { Player } from '../engine/types'

// Deterministic rng: a simple LCG.
function lcg(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

describe('pairing', () => {
  const snap = makeFirstTournament()
  const pairing: Array<[string, string]> = [
    ['A', 'D'],
    ['B', 'C'],
  ]

  it('shuffle keeps every element', () => {
    expect(shuffle([1, 2, 3, 4, 5], lcg(1)).sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('draws every player exactly once into A+D and B+C pairs', () => {
    const pairs = drawPairs(snap.players, pairing, [], lcg(7))
    expect(pairs).toHaveLength(6)
    const ids = pairs.flatMap((p) => [p.player1Id, p.player2Id])
    expect(new Set(ids).size).toBe(12)
    expect(pairs.filter((p) => p.kind === 'AD')).toHaveLength(3)
    expect(pairs.filter((p) => p.kind === 'BC')).toHaveLength(3)
    const tier = (id: string) => snap.players.find((p) => p.id === id)!.tier
    for (const p of pairs) expect([tier(p.player1Id), tier(p.player2Id)].sort().join('')).toBe(p.kind === 'AD' ? 'AD' : 'BC')
  })

  it('keeps the honoree pick and draws the rest', () => {
    const fixed = [{ player1Id: 'p4', player2Id: 'p7', kind: 'BC', pickedByHonoree: true }]
    const pairs = drawPairs(snap.players, pairing, fixed, lcg(3))
    expect(pairs[0]).toEqual(fixed[0])
    expect(pairs).toHaveLength(6)
    expect(new Set(pairs.flatMap((p) => [p.player1Id, p.player2Id])).size).toBe(12)
  })

  it('finds the partner tier from the rules', () => {
    expect(partnerTier('B', pairing)).toBe('C')
    expect(partnerTier('D', pairing)).toBe('A')
    expect(partnerTier('X', pairing)).toBeNull()
  })

  it('draws Day 1 groups as one pair of each kind', () => {
    const pairs = drawPairs(snap.players, pairing, [], lcg(9)).map((p, i) => ({ id: `x${i}`, kind: p.kind }))
    const groups = drawGroupsFromPairs(pairs, lcg(2))
    expect(groups).toHaveLength(3)
    for (const g of groups) {
      expect(g).toHaveLength(2)
      const kinds = g.map((id) => pairs.find((p) => p.id === id)!.kind).sort()
      expect(kinds).toEqual(['AD', 'BC'])
    }
  })
})

// ---------------------------------------------------------------------------
// Team draw
// ---------------------------------------------------------------------------

/** A field with one player per handicap, so a team's total is easy to read. */
function field(hcps: number[]): Player[] {
  return hcps.map((h, i) => ({
    id: `p${i + 1}`,
    fullName: `Jugador ${i + 1}`,
    displayName: `J${i + 1}`,
    tier: null,
    baseHcp: h,
    handicapSource: 'manual' as const,
    handicapIndex: null,
    estimateInputs: null,
    defaultTeeId: null,
    isHonoree: false,
    isAdmin: false,
    avatarUrl: null,
    formGuide: null,
    sortOrder: i,
  }))
}

describe('team draw', () => {
  it('snakes the field so every team gets one player from each band', () => {
    // 8 players, handicaps 1..8, teams of 2 → the snake deals
    // 1-2-3-4 then 8-7-6-5, so every team totals 9.
    const teams = drawTeams(field([1, 2, 3, 4, 5, 6, 7, 8]), 2, lcg(5))
    expect(teams).toHaveLength(4)
    expect(teams.map((t) => t.totalHcp).sort((a, b) => a - b)).toEqual([9, 9, 9, 9])
    expect(teams.flatMap((t) => t.playerIds).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'])
  })

  it('teams of four: 12 players, handicaps 1..12, every team totals 26', () => {
    // 1-2-3 / 6-5-4 / 7-8-9 / 12-11-10 → 1+6+7+12 = 26, 2+5+8+11 = 26, 3+4+9+10 = 26.
    const teams = drawTeams(field([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 4, lcg(11))
    expect(teams).toHaveLength(3)
    expect(teams.map((t) => t.totalHcp)).toEqual([26, 26, 26])
    expect(teams.every((t) => t.playerIds.length === 4)).toBe(true)
  })

  it('a field that does not divide leaves the last drafters short, not the first', () => {
    // 7 players, teams of 2 → 4 teams, and the fourth has one player.
    const teams = drawTeams(field([1, 2, 3, 4, 5, 6, 7]), 2, lcg(3))
    expect(teams).toHaveLength(4)
    expect(teams.map((t) => t.playerIds.length).sort()).toEqual([1, 2, 2, 2])
    expect(teams.flatMap((t) => t.playerIds)).toHaveLength(7)
  })

  it('is a draw, not a ranking: the same field comes out differently', () => {
    const f = field([5, 5, 5, 5, 10, 10, 10, 10])
    const a = drawTeams(f, 2, lcg(1)).map((t) => t.playerIds.join('+')).join(' ')
    const b = drawTeams(f, 2, lcg(99)).map((t) => t.playerIds.join('+')).join(' ')
    expect(a).not.toEqual(b)
    // Balanced either way: one 5 and one 10 on every team.
    for (const seed of [1, 99]) expect(drawTeams(f, 2, lcg(seed)).map((t) => t.totalHcp)).toEqual([15, 15, 15, 15])
  })

  it('refuses a size that cannot make a team', () => {
    expect(drawTeams(field([1, 2, 3]), 4, lcg(1))).toEqual([])
    expect(drawTeams(field([1, 2, 3, 4]), 1, lcg(1))).toEqual([])
  })

  it('groups keep whole teams together', () => {
    const pairs = [{ playerIds: ['a', 'b'] }, { playerIds: ['c', 'd'] }, { playerIds: ['e', 'f'] }]
    expect(groupsFromTeams(pairs)).toEqual([['a', 'b', 'c', 'd'], ['e', 'f']])
    const fours = [{ playerIds: ['a', 'b', 'c', 'd'] }, { playerIds: ['e', 'f', 'g', 'h'] }]
    expect(groupsFromTeams(fours)).toEqual([['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']])
    // A team of three and a pair do not fit in one group of four.
    expect(groupsFromTeams([{ playerIds: ['a', 'b', 'c'] }, { playerIds: ['d', 'e'] }])).toEqual([['a', 'b', 'c'], ['d', 'e']])
  })
})
