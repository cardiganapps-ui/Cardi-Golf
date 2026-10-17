/**
 * The phones that hold each player's PIN (0050 `player_phones`, TRUST-24):
 * what kind each is, since when, and its number among the phones that ever
 * held him, the number Historial names («teléfono 2 de 2»). The Comité only.
 * A phone here is an anonymous user, so Safari and the app on the home screen
 * of one iPhone are two: two phones are often one person.
 */
import { isMissingFunction, rpc } from './rpc'

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


/** The phones holding each player now, or null on a database without them. */
export async function playerPhones(tournamentId: string): Promise<PinPhone[] | null> {
  try {
    const data = await rpc('player_phones', { p_tournament_id: tournamentId }).as<PinPhone[] | null>()
    return Array.isArray(data) ? data : []
  } catch (e) {
    if (isMissingFunction(e)) return null
    throw e
  }
}

/** The Comité takes a phone off its player, with a reason: that phone has to type the PIN again. */
export async function releasePhone(id: number, reason: string): Promise<void> {
  await rpc('release_pin_claim', { p_claim_id: id, p_reason: reason })
}

/** A player's PIN locked for new phones (0056, SEC-04): how many wrong PINs, and until when. */
export interface PinLock {
  playerId: string
  failed: number
  lockedUntil: string
}

/** The players whose PIN is locked for new phones now, or null on a database without 0056. */
export async function pinLocks(tournamentId: string): Promise<PinLock[] | null> {
  try {
    const data = await rpc('pin_locks', { p_tournament_id: tournamentId }).as<PinLock[] | null>()
    return Array.isArray(data) ? data : []
  } catch (e) {
    if (isMissingFunction(e)) return null
    throw e
  }
}

/** The Comité opens a locked PIN to new phones again; the PIN stays the same. */
export async function unlockPin(playerId: string): Promise<void> {
  await rpc('unlock_player_pin', { p_player_id: playerId })
}

/** The phones of one player, by their number. */
export function phonesOf(phones: PinPhone[] | null, playerId: string): PinPhone[] {
  return (phones ?? []).filter((p) => p.playerId === playerId).sort((a, b) => a.n - b.n)
}
