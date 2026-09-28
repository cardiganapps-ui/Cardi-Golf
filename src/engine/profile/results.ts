/**
 * What a finished tournament publishes to its players' profiles
 * (`publish_tournament_results`, migration 0015): the finish and points from
 * the individual game, what each person won, and their net. Round results
 * (gross, adjusted gross, differential) are computed by the database itself.
 */
import type { TournamentState } from '../computeTournament'
import type { Id, Player } from '../types'

export interface PublishRow {
  playerId: Id
  rank: number | null
  rankLabel: string | null
  points: number | null
  perRound: number[]
  /** `award:<AwardId>` for the fun awards, `prize:<label>` for what paid. */
  awards: string[]
  net: number | null
}

export function buildTournamentResults(state: TournamentState, players: Player[]): PublishRow[] {
  const rows = new Map((state.modules.individual?.rows ?? []).map((r) => [r.playerId, r]))
  return players.map((p) => {
    const r = rows.get(p.id)
    const money = state.money.people[p.id]
    const awards = [
      ...state.stats.awards.filter((a) => a.playerIds.includes(p.id)).map((a) => `award:${a.id}`),
      ...Object.entries(money?.prizes ?? {})
        .filter(([, amount]) => amount > 0)
        .map(([label]) => `prize:${label}`),
    ]
    return {
      playerId: p.id,
      rank: r?.position ?? null,
      rankLabel: r?.label ?? null,
      points: r?.total ?? null,
      perRound: r?.perRound ?? [],
      awards: [...new Set(awards)],
      net: money ? money.net : null,
    }
  })
}
