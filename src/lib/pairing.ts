/**
 * Pair and group drawing (§5.5, §10): generic over the tournament's pairing
 * rules. Pure functions; randomness is injected so tests are deterministic.
 */
import type { Pair, Player } from '../engine/types'

export type Rng = () => number

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

export interface DrawnPair {
  player1Id: string
  player2Id: string
  kind: string
  pickedByHonoree: boolean
}

/**
 * Draw pairs by the pairing rules ([["A","D"],["B","C"]]): for each rule,
 * shuffle both tiers and zip them. `fixed` pairs (the honoree's pick) are
 * kept and their players removed from the hat. Players in tiers not covered
 * by any rule are paired among themselves as a fallback (kind "?").
 */
export function drawPairs(players: Player[], pairing: Array<[string, string]>, fixed: DrawnPair[] = [], rng: Rng = Math.random): DrawnPair[] {
  const taken = new Set(fixed.flatMap((p) => [p.player1Id, p.player2Id]))
  const pool = players.filter((p) => !taken.has(p.id))
  const out: DrawnPair[] = [...fixed]
  const used = new Set<string>()
  for (const [a, b] of pairing) {
    const as = shuffle(pool.filter((p) => p.tier === a), rng)
    const bs = shuffle(pool.filter((p) => p.tier === b), rng)
    const n = Math.min(as.length, bs.length)
    for (let i = 0; i < n; i++) {
      out.push({ player1Id: as[i]!.id, player2Id: bs[i]!.id, kind: `${a}${b}`, pickedByHonoree: false })
      used.add(as[i]!.id)
      used.add(bs[i]!.id)
    }
  }
  const rest = shuffle(pool.filter((p) => !used.has(p.id)), rng)
  for (let i = 0; i + 1 < rest.length; i += 2) {
    out.push({ player1Id: rest[i]!.id, player2Id: rest[i + 1]!.id, kind: '?', pickedByHonoree: false })
  }
  return out
}

/** The tier the honoree's partner must come from, per the pairing rules. */
export function partnerTier(honoreeTier: string | null, pairing: Array<[string, string]>): string | null {
  if (!honoreeTier) return null
  for (const [a, b] of pairing) {
    if (a === honoreeTier) return b
    if (b === honoreeTier) return a
  }
  return null
}

/**
 * Day 1 groups (§5.5): one pair of each kind per group, drawn at random.
 * With kinds AD and BC → groups of [AD, BC]. Leftover pairs form smaller groups.
 */
export function drawGroupsFromPairs(pairs: Array<Pick<Pair, 'id' | 'kind'>>, rng: Rng = Math.random): string[][] {
  const byKind = new Map<string, string[]>()
  for (const p of pairs) byKind.set(p.kind ?? '?', [...(byKind.get(p.kind ?? '?') ?? []), p.id])
  const lists = [...byKind.values()].map((l) => shuffle(l, rng))
  const n = Math.max(0, ...lists.map((l) => l.length))
  const groups: string[][] = []
  for (let i = 0; i < n; i++) groups.push(lists.flatMap((l) => (l[i] ? [l[i]!] : [])))
  return groups
}
