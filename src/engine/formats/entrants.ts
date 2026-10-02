/**
 * Who competes in the main standings. An individual format enters every
 * player; a team format enters the teams the Comité drew.
 */
import { t } from '../../i18n/es-MX'
import type { CountbackInput } from '../core/ranking'
import type { PlayerRound } from '../core/types'
import type { Id } from '../types'
import type { Entrant, FormatContext } from './format'

/** One entrant per player, in the roster's own order. */
export function playerEntrants(ctx: FormatContext): Entrant[] {
  return [...ctx.snapshot.players]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({ id: p.id, playerIds: [p.id], name: p.displayName, isTeam: false }))
}

/**
 * One entrant per team.
 *
 * A team format uses `teams`, which holds any size, and falls back to the
 * pairs the Comité's Matrimonios draw writes when there are none — so a
 * tournament that drew pairs and then switched to best ball keeps its teams
 * instead of showing an empty board.
 */
export function teamEntrants(ctx: FormatContext): Entrant[] {
  const name = (id: Id) => ctx.snapshot.players.find((p) => p.id === id)?.displayName ?? id
  const order = new Map(ctx.snapshot.players.map((p) => [p.id, p.sortOrder]))
  if (ctx.snapshot.teams.length) {
    return [...ctx.snapshot.teams]
      .sort((a, b) => a.number - b.number)
      .map((team) => ({
        id: team.id,
        playerIds: team.playerIds,
        name: team.name?.trim() || `Equipo ${team.number}`,
        isTeam: true,
      }))
  }
  return [...ctx.snapshot.pairs]
    .map((pair) => ({
      id: pair.id,
      playerIds: [pair.player1Id, pair.player2Id],
      name: pair.name?.trim() || t.common.andList([name(pair.player1Id), name(pair.player2Id)]),
      isTeam: true,
    }))
    .sort((a, b) => Math.min(...a.playerIds.map((p) => order.get(p) ?? 0)) - Math.min(...b.playerIds.map((p) => order.get(p) ?? 0)))
}

/** The rounds that count, in order. */
export function roundIds(ctx: FormatContext): Id[] {
  return ctx.core.roundIds
}

/** A player's round, or undefined when they have no card that day. */
export function playerRound(ctx: FormatContext, roundId: Id, playerId: Id): PlayerRound | undefined {
  return ctx.core.rounds[roundId]?.[playerId]
}

/** How many holes an entrant has completed in a round (the least of its members). */
export function entrantThru(ctx: FormatContext, roundId: Id, e: Entrant): number {
  const each = e.playerIds.map((id) => playerRound(ctx, roundId, id)?.thru ?? 0)
  return each.length ? Math.min(...each) : 0
}

/** An empty countback, for an entrant with no last round. */
export function emptyCountback(holes = 18): CountbackInput {
  return { pointsByHole: new Map(), holes }
}

/**
 * Build the countback map for the last round from per-hole values, always
 * oriented so more is better — `countback` sums and compares, and does not
 * know whether the format counts up or down.
 */
export function countbackFrom(values: Array<{ hole: number; value: number }>, holes: number, higherIsBetter: boolean): CountbackInput {
  const pointsByHole = new Map<number, number>()
  for (const v of values) pointsByHole.set(v.hole, higherIsBetter ? v.value : -v.value)
  return { pointsByHole, holes }
}
