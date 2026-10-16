/**
 * Who may change what on the Tarjeta (§7, §9.3), as pure functions of the boards (ARCH-14): a signed card
 * locks its pair (or, signed by a marker, its player) for a player, a closed day locks the card, and the Comité's changes there are corrections
 * on the server, with a reason once a card is signed.
 */
import { t } from '../../../i18n/es-MX'
import type { Pair, Round, Snapshot } from '../../../engine/types'

export function cardRules(o: {
  snapshot: Pick<Snapshot, 'pairs' | 'cardSignatures'>
  round: Pick<Round, 'id' | 'status'>
  playerIds: readonly string[]
  isComite: boolean
  /**
   * A marker signs each player's card (UX-23): a signature locks that player's row only, so the rest of the group
   * still finishes its own holes. Under the pairs' rule a signature locks the whole card, as it always did.
   */
  perPlayer?: boolean
}) {
  const { snapshot, round, isComite } = o
  const pairSigned = (pairId: string) => snapshot.cardSignatures.some((s) => s.roundId === round.id && s.pairId === pairId)
  /** Whether this player's card is signed today: his pair's signature, or his own (a marker's, 0054). */
  const signed = (pid: string) => {
    const pair = snapshot.pairs.find((p) => p.player1Id === pid || p.player2Id === pid)
    return (!!pair && pairSigned(pair.id)) || snapshot.cardSignatures.some((s) => s.roundId === round.id && !!s.playerId && s.playerId === pid)
  }
  const anySigned = o.playerIds.some(signed)
  const locksCard = o.perPlayer ? o.playerIds.length > 0 && o.playerIds.every(signed) : anySigned
  const canEdit = isComite || (round.status === 'live' && !locksCard)
  return {
    signed,
    pairSigned,
    anySigned,
    canEdit,
    /** Whether this phone may change this player's hole now (a kept draft is restored only then). */
    editableFor: (pid: string) => canEdit && !(signed(pid) && !isComite),
    /** A player's row is locked on a signed card, except for the Comité. */
    lockedFor: (pid: string) => signed(pid) && !isComite,
    /** A Comité correction on a signed card needs a reason (§7); it is written through the server RPC, not the outbox. */
    needsReason: isComite && anySigned,
    /**
     * Whether writing these players is a Comité correction on the server: a phone's write would be refused (a day
     * no longer live, a signed card, 0026). Then the whole hole goes in one call, every player or none (REL-22).
     */
    correctsOnServer: (ids: readonly string[]) => isComite && ids.some((id) => round.status !== 'live' || signed(id)),
  }
}

/** A pair's name, or its two players' short names when it has none. */
export function pairNameIn(players: ReadonlyArray<{ id: string; displayName: string }>) {
  return (p: Pick<Pair, 'name' | 'player1Id' | 'player2Id'>) => p.name ?? t.common.andList([p.player1Id, p.player2Id].map((id) => players.find((x) => x.id === id)?.displayName ?? '?'))
}

/** This phone's pair, and the pair of the group whose card it keeps (tarjeta cruzada, §5.5). */
export function groupPairs(pairs: readonly Pair[], groupPlayerIds: readonly string[], myPlayerId: string | null) {
  const inGroup = pairs.filter((p) => [p.player1Id, p.player2Id].every((id) => groupPlayerIds.includes(id)))
  const myPair = myPlayerId ? (pairs.find((p) => p.player1Id === myPlayerId || p.player2Id === myPlayerId) ?? null) : null
  const rivalPair = myPair ? (pairs.find((p) => p.id !== myPair.id && [p.player1Id, p.player2Id].every((id) => groupPlayerIds.includes(id))) ?? null) : null
  return { inGroup, myPair, rivalPair }
}
