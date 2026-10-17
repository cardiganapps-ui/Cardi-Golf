/**
 * Holes played without putts (MONEY-18): strokes entered, not picked up, and
 * no putts. The Tarjeta and the Comité always send putts with strokes; a
 * restore of an older export, a fix by hand or an older build's direct write
 * may not. A game that pays on putts never reads one of these as 0 putts:
 * Menos putts leaves the hole out, so the player can't take its prize until
 * the putts are there, and the Comité is told which holes to fill (Tarjetas)
 * before the tournament can close.
 */
import type { TournamentSettings } from '../settings/schema'
import type { Id } from '../types'
import type { CoreState, HoleResult } from './types'

export function puttsMissing(h: Pick<HoleResult, 'played' | 'pickedUp' | 'putts'>): boolean {
  return h.played && !h.pickedUp && h.putts == null
}

/** The games that pay on putts: the snake, Menos putts, and a fine per three-putt. Empty when none is on. */
export function puttingGames(settings: TournamentSettings): string[] {
  const out: string[] = []
  if (settings.modules.snake.enabled) out.push(settings.modules.snake.label)
  if (settings.modules.fewestPutts.enabled) out.push(settings.modules.fewestPutts.label)
  for (const g of settings.games)
    if (g.enabled && g.type === 'eventPot' && g.options.event === 'threePutt') out.push(g.label)
  return out
}

export interface MissingPutts {
  roundId: Id
  roundNumber: number
  playerId: Id
  holes: number[]
}

/** Per round and player, the holes played without putts: only while a game pays on putts. */
export function missingPutts(core: CoreState, settings: TournamentSettings): MissingPutts[] {
  if (!puttingGames(settings).length) return []
  const out: MissingPutts[] = []
  for (const rid of core.roundIds) {
    for (const pr of Object.values(core.rounds[rid] ?? {})) {
      const holes = pr.holes.filter(puttsMissing).map((h) => h.hole)
      if (holes.length) out.push({ roundId: rid, roundNumber: pr.roundNumber, playerId: pr.playerId, holes })
    }
  }
  return out
}
