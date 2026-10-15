/**
 * The phones that hold each player's PIN (0050 `player_phones`, TRUST-24):
 * what kind each is, since when, and its number among the phones that ever
 * held him, the number Historial names («teléfono 2 de 2»). The Comité only.
 * A phone here is an anonymous user, so Safari and the app on the home screen
 * of one iPhone are two: two phones are often one person.
 */
import { supabase } from '../lib/supabase'
import { ApiError } from './api'

export type PhoneKind = 'ios' | 'android' | 'desktop' | 'other'

export interface PinPhone {
  /** The claim's id: what «Sacar» sends. Never an account id. */
  id: number
  playerId: string
  kind: PhoneKind
  /** When this phone took the player. */
  since: string
  /** Its number among every phone that ever held the player in this tournament, and how many there were. */
  n: number
  of: number
}

/** A database without 0050 answers these: the list is «no disponible», never an error. */
const MISSING = new Set(['PGRST202', '42883'])

/** The phones holding each player now, or null on a database without them. */
export async function playerPhones(tournamentId: string): Promise<PinPhone[] | null> {
  const { data, error } = await supabase().rpc('player_phones', { p_tournament_id: tournamentId })
  if (error) {
    if (MISSING.has(error.code ?? '')) return null
    throw ApiError.from(error)
  }
  return Array.isArray(data) ? (data as PinPhone[]) : []
}

/** The Comité takes a phone off its player, with a reason: that phone has to type the PIN again. */
export async function releasePhone(id: number, reason: string): Promise<void> {
  const { error } = await supabase().rpc('release_pin_claim', { p_claim_id: id, p_reason: reason })
  if (error) throw ApiError.from(error)
}

/** A player's PIN locked for new phones (0056, SEC-04): how many wrong PINs, and until when. */
export interface PinLock {
  playerId: string
  failed: number
  lockedUntil: string
}

/** The players whose PIN is locked for new phones now, or null on a database without 0056. */
export async function pinLocks(tournamentId: string): Promise<PinLock[] | null> {
  const { data, error } = await supabase().rpc('pin_locks', { p_tournament_id: tournamentId })
  if (error) {
    if (MISSING.has(error.code ?? '')) return null
    throw ApiError.from(error)
  }
  return Array.isArray(data) ? (data as PinLock[]) : []
}

/** The Comité opens a locked PIN to new phones again; the PIN stays the same. */
export async function unlockPin(playerId: string): Promise<void> {
  const { error } = await supabase().rpc('unlock_player_pin', { p_player_id: playerId })
  if (error) throw ApiError.from(error)
}

/** The phones of one player, by their number. */
export function phonesOf(phones: PinPhone[] | null, playerId: string): PinPhone[] {
  return (phones ?? []).filter((p) => p.playerId === playerId).sort((a, b) => a.n - b.n)
}
