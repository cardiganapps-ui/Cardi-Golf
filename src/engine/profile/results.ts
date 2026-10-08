/**
 * What a finished tournament publishes to its players' profiles
 * (`publish_tournament_results`, migration 0015): the finish and points from
 * the individual game, what each person won, and their net. Round results
 * (gross, adjusted gross, differential) are computed by the database itself.
 *
 * The finish follows the format (STRAT-03): in a team format each member
 * publishes his team's place. Points are published only where the event
 * counts them: a stroke total is not points, and match play's half points
 * do not fit the column (`points integer`), which failed the whole publish.
 */
import type { TournamentState } from '../computeTournament'
import { mainScoring } from '../formats'
import type { IndividualRow } from '../modules/individual'
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
  // A row covers its entrant's players: one in an individual format, the team in a team format.
  const rows = new Map<Id, IndividualRow>()
  for (const r of state.modules.individual?.rows ?? []) for (const id of r.entrant.playerIds) rows.set(id, r)
  const points = mainScoring(state.settings) === 'points' && state.settings.modules.individual.format !== 'matchPlay'
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
      points: points ? (r?.total ?? null) : null,
      perRound: points ? (r?.perRound.map((f) => f.value) ?? []) : [],
      awards: [...new Set(awards)],
      net: money ? money.net : null,
    }
  })
}
