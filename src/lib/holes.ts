/**
 * Hole helpers that respect the order a group actually plays (start hole 10
 * → 10..18, 1..9), so "the last hole played" and "the hole they are on" are
 * right for a shotgun-style start.
 */
import { playOrder } from '../engine/core/playOrder'

interface PlayedHole {
  hole: number
  played: boolean
}

/** The hole most recently played in play order, or null before the first. */
export function lastPlayedHole<T extends PlayedHole>(holes: T[], startHole: number, count = 18): T | null {
  const order = playOrder(startHole, count)
  for (let i = order.length - 1; i >= 0; i--) {
    const h = holes.find((x) => x.hole === order[i])
    if (h?.played) return h
  }
  return null
}

/** The hole a player (or group) is on: the first unplayed hole in play order, or the last one once the round is complete. */
export function currentHole(holes: PlayedHole[], startHole: number, count = 18): number {
  const order = playOrder(startHole, count)
  for (const n of order) {
    const h = holes.find((x) => x.hole === n)
    if (!h?.played) return n
  }
  return order[order.length - 1] ?? startHole
}
