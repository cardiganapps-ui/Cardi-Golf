/**
 * Who signs a card, and whether a player's card is signed (UX-23, §9.3).
 *
 * A signature is a pair's (the tarjeta cruzada: each pair signs the other's)
 * or a player's (a marker: another player of his group signs his card). The
 * tournament's `cardSigning` setting says which one its phones offer; a
 * tournament stored before the setting existed has no key, and reads as it
 * always behaved: `pairs` while the pairs game is on, else no signing at all.
 * 0054's `card_signing_mode` reads the same settings the same way.
 *
 * A signature that exists locks its card whatever the setting says now, on
 * the server (`card_is_signed`) as on the phone: changing the setting never
 * unlocks a card someone signed. Only the Comité takes a signature off.
 */
import type { TournamentSettings } from '../settings/schema'
import type { CardSignature, Id, Pair } from '../types'

export type CardSigningMode = 'pairs' | 'marker' | 'none'
export const CARD_SIGNING_MODES: readonly CardSigningMode[] = ['pairs', 'marker', 'none']

/** The rule a tournament signs by. `pairs` needs the pairs game: without it, nobody signs (as before the setting). */
export function cardSigningMode(settings: Pick<TournamentSettings, 'modules' | 'cardSigning'>): CardSigningMode {
  const pairsOn = settings.modules.pairs.enabled
  const raw = settings.cardSigning
  if (raw === 'marker' || raw === 'none') return raw
  return pairsOn ? 'pairs' : 'none'
}

/**
 * The same rule on settings as stored (raw jsonb), as 0054's `card_signing_mode` reads them: the in-memory
 * server's copy of it. A stored value this build doesn't know reads as the default rule, as the schema does.
 */
export function cardSigningModeOf(raw: unknown): CardSigningMode {
  const s = raw && typeof raw === 'object' ? (raw as { cardSigning?: unknown; modules?: { pairs?: { enabled?: unknown } } }) : {}
  if (s.cardSigning === 'marker' || s.cardSigning === 'none') return s.cardSigning
  return s.modules?.pairs?.enabled === true ? 'pairs' : 'none'
}

/** What a new tournament is created with: the tarjeta cruzada with the pairs game, else a marker for each player. */
export function newTournamentCardSigning(settings: Pick<TournamentSettings, 'modules'>): CardSigningMode {
  return settings.modules.pairs.enabled ? 'pairs' : 'marker'
}

/** Whether one signature covers this player's card that day: his own, or his pair's. */
export function signatureCovers(sig: CardSignature, roundId: Id, playerId: Id, pairs: readonly Pair[]): boolean {
  if (sig.roundId !== roundId) return false
  if (sig.playerId) return sig.playerId === playerId
  const pair = sig.pairId ? pairs.find((p) => p.id === sig.pairId) : undefined
  return !!pair && (pair.player1Id === playerId || pair.player2Id === playerId)
}

/** Whether this player's card is signed that day, by any signature (as the server's `card_is_signed`). */
export function cardSignedFor(snapshot: { cardSignatures: readonly CardSignature[]; pairs: readonly Pair[] }, roundId: Id, playerId: Id): boolean {
  return snapshot.cardSignatures.some((s) => signatureCovers(s, roundId, playerId, snapshot.pairs))
}

/** The player's own signature that day (a marker's), if any. */
export function playerSignature(signatures: readonly CardSignature[], roundId: Id, playerId: Id): CardSignature | undefined {
  return signatures.find((s) => s.roundId === roundId && !!s.playerId && s.playerId === playerId)
}

/**
 * A signature's key within its day, as 0054's generated `card_id` holds it:
 * the pair's id, or the player's. The table's primary key is (round, card).
 */
export function signatureCard(sig: Pick<CardSignature, 'pairId' | 'playerId'>): Id {
  return sig.pairId ?? sig.playerId ?? ''
}
