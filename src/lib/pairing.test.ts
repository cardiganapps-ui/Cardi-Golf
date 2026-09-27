import { describe, expect, it } from 'vitest'
import { makeFirstTournament } from '../engine/testing/fixtures'
import { drawGroupsFromPairs, drawPairs, partnerTier, shuffle } from './pairing'

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
