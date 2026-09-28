/**
 * Publishing a finished tournament to its players' profiles: the finish,
 * points, awards and each person's private net, from the engine state the
 * Comité is looking at. Round results need no publishing (the database
 * computes them when a round finishes).
 */
import { buildTournamentResults } from '../engine/profile/results'
import { publishTournamentResults } from './profiles'
import { useTournament } from './tournamentStore'

export async function publishFromStore(tournamentId: string): Promise<{ players: number; field: number }> {
  const d = useTournament.getState().data
  if (!d || d.snapshot.tournament.id !== tournamentId) throw new Error('El torneo no está cargado')
  return publishTournamentResults(tournamentId, buildTournamentResults(d.state, d.snapshot.players), d.settings.currency)
}
