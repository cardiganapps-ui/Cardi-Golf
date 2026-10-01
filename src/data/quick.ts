/**
 * Ronda rápida (migration 0017): one call creates a live one-round
 * tournament; closing it finishes the round and the tournament and publishes
 * the results. Also the rivalry strokes for the Tarjeta.
 */
import { supabase } from '../lib/supabase'
import { t } from '../i18n/es-MX'
import { UserError } from '../lib/humanError'
import type { TournamentSettings } from '../engine/settings/schema'
import { ApiError, setRoundStatus, updateTournament } from './api'
import { publishFromStore } from './publish'
import { setTournamentCrew } from './crews'
import { useTournament } from './tournamentStore'

export type QuickPlayer = { kind: 'me'; index?: number | null } | { kind: 'friend'; handle: string; index?: number | null } | { kind: 'guest'; name: string; index?: number | null }

export interface QuickRoundInput {
  name: string
  settings: TournamentSettings
  courseId: string
  teeId: string
  date: string
  players: QuickPlayer[]
  /** The crew the outing counts for (0018), if any. */
  crewId?: string | null
}

export async function createQuickRound({ crewId, ...input }: QuickRoundInput): Promise<{ id: string; slug: string }> {
  const { data, error } = await supabase().rpc('create_quick_round', { p: input })
  if (error) throw ApiError.from(error)
  const created = data as { id: string; slug: string }
  if (crewId) await setTournamentCrew(created.id, crewId)
  return created
}

export interface RoundRivalry {
  myPlayerId: string
  theirPlayerId: string
  /** Strokes I receive (negative: I give). */
  myStrokes: number
}

export async function roundRivalries(tournamentId: string): Promise<RoundRivalry[]> {
  const { data, error } = await supabase().rpc('round_rivalries', { tid: tournamentId })
  if (error) throw ApiError.from(error)
  return (data ?? []) as RoundRivalry[]
}

/** "Terminar y publicar": every live round finished, the tournament finished, results on the profiles. */
export async function finishQuickRound(tournamentId: string): Promise<{ players: number }> {
  const store = useTournament.getState()
  const snap = store.data?.snapshot
  if (!snap || snap.tournament.id !== tournamentId) throw new UserError(t.errors.notLoaded)
  for (const r of snap.rounds.filter((x) => x.status === 'live')) await setRoundStatus(r.id, 'finished')
  await updateTournament(tournamentId, { status: 'finished' })
  await store.reload()
  return publishFromStore(tournamentId)
}
