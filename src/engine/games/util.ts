/** Small helpers shared by the instance games. */
import { flattenRanks, rankField } from '../core/ranking'
import type { HoleResult } from '../core/types'
import type { Id } from '../types'
import type { GameContext } from './game'

export function namer(ctx: GameContext): (id: Id) => string {
  const m = new Map(ctx.snapshot.players.map((p) => [p.id, p.displayName]))
  return (id) => m.get(id) ?? id
}

export function roundNumberOf(ctx: GameContext, roundId: Id): number {
  return ctx.snapshot.rounds.find((r) => r.id === roundId)?.number ?? 0
}

export function roundHoles(ctx: GameContext, roundId: Id): number {
  return ctx.snapshot.rounds.find((r) => r.id === roundId)?.holes ?? 18
}

/** Gross or net on a hole; null when not played or picked up (no score to compare). */
export function holeScore(h: HoleResult | undefined, basis: 'gross' | 'net'): number | null {
  if (!h || !h.played || h.pickedUp || h.gross == null) return null
  return basis === 'gross' ? h.gross : h.gross - h.strokesReceived
}

export function holeOf(ctx: GameContext, roundId: Id, playerId: Id, hole: number): HoleResult | undefined {
  return ctx.core.rounds[roundId]?.[playerId]?.holes.find((x) => x.hole === hole)
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** A count per player (skins, birdies, holes won) ranked by the shared rule: most first, ties share («T2»). */
export function rankedUnits(entries: Array<[Id, number]>): Array<{ id: Id; units: number; label: string }> {
  return flattenRanks(rankField(entries, { keys: [([, u]) => u], ties: 'share' })).map((r) => ({ id: r.item[0], units: r.item[1], label: r.label }))
}

export function moneyByPlayer(prizes: Array<{ playerId: Id; amount: number; payerId?: Id }>): Map<Id, number> {
  const m = new Map<Id, number>()
  for (const p of prizes) {
    m.set(p.playerId, (m.get(p.playerId) ?? 0) + p.amount)
    if (p.payerId) m.set(p.payerId, (m.get(p.payerId) ?? 0) - p.amount)
  }
  return m
}
