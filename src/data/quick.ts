/**
 * Ronda rápida (migration 0017): one call creates a live one-round
 * tournament; closing it finishes the round and the tournament and publishes
 * the results. Also the rivalry strokes for the Tarjeta.
 */
import { rpc } from './rpc'
import { step } from '../lib/telemetry'
import { acceptLegal } from './legal'
import { t } from '../i18n/es-MX'
import { UserError } from '../lib/humanError'
import type { TournamentSettings } from '../engine/settings/schema'
import { setRoundStatus, updateTournament } from './api'
import { publishFromStore } from './publish'
import { setTournamentCrew } from './crews'
import { confirmAdults } from './myData'
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
  /** With money, the creator said every player is 18 or older (TRUST-13): recorded on the tournament. */
  adults?: boolean
}

export async function createQuickRound({ crewId, adults, ...input }: QuickRoundInput): Promise<{ id: string; slug: string }> {
  const created = await rpc('create_quick_round', { p: input }).as<{ id: string; slug: string }>()
  step('quick_round_created')
  // Created under the consent line (TRUST-05).
  void acceptLegal('quick')
  if (crewId) await setTournamentCrew(created.id, crewId)
  // Said above «Empezar» when it plays for money (TRUST-13); a server without 0070 has nowhere to keep it.
  if (adults) await confirmAdults(created.id, true).catch(() => undefined)
  return created
}

export interface RoundRivalry {
  myPlayerId: string
  theirPlayerId: string
  /** Strokes I receive (negative: I give). */
  myStrokes: number
}

export async function roundRivalries(tournamentId: string): Promise<RoundRivalry[]> {
  return (await rpc('round_rivalries', { tid: tournamentId }).as<RoundRivalry[] | null>()) ?? []
}

/** Only the live rounds finished: what is «por asignar» then shows in Dinero, for the Comité to decide before publishing (MONEY-05). */
export async function finishQuickRounds(tournamentId: string): Promise<void> {
  const store = useTournament.getState()
  const snap = store.data?.snapshot
  if (!snap || snap.tournament.id !== tournamentId) throw new UserError(t.errors.notLoaded)
  for (const r of snap.rounds.filter((x) => x.status === 'live')) await setRoundStatus(r.id, 'finished')
  await store.reload()
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
