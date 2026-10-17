/**
 * A person's own data (0070, TRUST-09): «Descargar mis datos» downloads
 * everything Polo keeps about him as one JSON file, and «Borrar mi cuenta»
 * deletes the account the way the Admin de Polo would (anonymize_person),
 * once he types its email. Not while this phone holds writes nobody else
 * can send (like signing out), and signed out after. Also the age checks
 * of a tournament (TRUST-13) and a player's «Pedir corrección» (TRUST-16).
 */
import { supabase } from '../lib/supabase'
import { t } from '../i18n/es-MX'
import { ApiError } from './apiError'
import { downloadText } from './backup'
import { signOut } from './auth'
import { forgetSignedOut, unsentReason } from './account'
import { isMissingFunction, rpc } from './rpc'

/** «polo-mis-datos-2026-10-16.json», today in the phone's own calendar. */
export function exportFileName(at = new Date()): string {
  const day = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  return t.profile.myData.file(day)
}

/** Everything Polo keeps about me, downloaded as one file. */
export async function downloadMyData(): Promise<void> {
  const data = await rpc('my_data_export').as<Record<string, unknown>>()
  downloadText(exportFileName(), `${JSON.stringify(data, null, 2)}\n`)
}

export interface DeletePreview {
  /** Tournaments whose whole Comité is me: they stay, with no Comité. */
  orphaned: Array<{ id: string; name: string }>
  /** My players that become «Jugador borrado», and in which tournaments. */
  anonymizedPlayers: number
  anonymizedIn: string[]
  /** Crews I created: handed to their longest member, or gone with me. */
  crewsHanded: string[]
  crewsDeleted: string[]
}

export const myDeletePreview = () => rpc('my_delete_preview').as<DeletePreview>()

/**
 * Deletes my account, its email typed as the confirmation. Refused, in words, while this phone holds writes
 * (they would wait for someone who no longer exists). Then signs this phone out and forgets me here.
 */
export async function deleteMyAccount(email: string): Promise<{ done: true } | { done: false; reason: string }> {
  const unsent = await unsentReason('delete')
  if (unsent) return { done: false, reason: unsent }
  await rpc('delete_my_account', { p_confirm: email })
  // The account is gone on the server; what this phone kept of it goes too. auth-js drops the session it can no longer end.
  await signOut()
  await forgetSignedOut()
  return { done: true }
}

/** The Comité says every player of its tournament is an adult, or takes it back (TRUST-13). */
export const confirmAdults = (tournamentId: string, on: boolean) =>
  rpc('confirm_adults', { p_tournament_id: tournamentId, p_on: on }).as<string | null>()

/** When the Comité said so, or null; undefined on a database without 0070 (the card says nothing then). */
export async function adultsConfirmedAt(tournamentId: string): Promise<string | null | undefined> {
  const { data, error } = await supabase()
    .from('tournaments')
    .select('adults_confirmed_at')
    .eq('id', tournamentId)
    .maybeSingle()
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') return undefined
    throw ApiError.from(error)
  }
  return (data as { adults_confirmed_at?: string | null } | null)?.adults_confirmed_at ?? null
}

export interface CorrectionRequest {
  id: number
  playerId: string
  /** What the player wrote. */
  text: string
  at: string
  doneAt: string | null
}

/** A player asks the Comité to fix what it saved about him (TRUST-16). */
export const requestCorrection = (tournamentId: string, message: string) =>
  rpc('request_player_correction', { p_tournament_id: tournamentId, p_message: message })
/** The Comité's list, open ones first; null on a database without 0070. */
export async function correctionRequests(tournamentId: string): Promise<CorrectionRequest[] | null> {
  try {
    return (await rpc('player_corrections', { p_tournament_id: tournamentId }).as<CorrectionRequest[] | null>()) ?? []
  } catch (e) {
    if (isMissingFunction(e)) return null
    throw e
  }
}
export const resolveCorrection = (id: number) => rpc('resolve_player_correction', { p_id: id })
