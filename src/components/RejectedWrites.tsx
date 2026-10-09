/**
 * Writes this device tried to save and the server refused for good (signed
 * card, round no longer live, permission). The list lives only on this
 * device, so it shows wherever the device can act on it: every state of the
 * Tarjeta, a closed day included (REL-08: a player's phone that was out of
 * signal when the Comité finished the round had nowhere to see its holes),
 * and Comité › Tarjetas.
 *
 * A Comité device sends them again. A player's phone can't, so it hands them
 * to the Comité: «Mandar al Comité» shares the values as text (WhatsApp),
 * the Comité captures them from Comité › Tarjetas, and the player discards
 * once it is confirmed. A player's phone may resend only what it could write
 * now (the day live, the card unsigned, and its player in that group that
 * day), against what the card holds now; the hint says which lines go where.
 * A hole save_hole refused is on the server too (0026): when a person typed
 * it, its line says it went to the Comité's «Pendientes de revisar», naming
 * whose hole it is (0028).
 */
import { useId, useState } from 'react'
import { t } from '../i18n/es-MX'
import { discardRejected, retryRejected, useOutbox, type AwardPayload, type RejectedItem, type ScorePayload, type SignaturePayload, type TiebreakPayload } from '../data/outbox'
import { useTournament } from '../data/tournamentStore'
import type { Snapshot } from '../engine/types'
import { ConfirmSheet } from './ConfirmSheet'
import { Sheet, toast } from './ui'
import styles from './RejectedWrites.module.css'

const IB = t.admin.inbox

export function RejectedWrites({ canResend, playerId = null }: { canResend: boolean; playerId?: string | null }) {
  const rejected = useOutbox((s) => s.rejected)
  const data = useTournament((s) => s.data)
  const titleId = useId()
  /** The capture waiting for «Descartar» to be confirmed. */
  const [discarding, setDiscarding] = useState<RejectedItem | null>(null)
  /** The text to send, shown when the phone could neither share it nor copy it. */
  const [manual, setManual] = useState<string | null>(null)
  if (!rejected.length || !data) return null
  const { snapshot } = data
  /** The short name, or the full one when another player of the tournament shares it (the first tournament has two «Diego»s). */
  const name = (id: string | null) => {
    const p = snapshot.players.find((x) => x.id === id)
    if (!p) return '?'
    return snapshot.players.some((o) => o.id !== p.id && o.displayName === p.displayName) ? p.fullName : p.displayName
  }
  const roundOf = (r: RejectedItem) => snapshot.rounds.find((x) => x.id === r.payload.round_id)
  const describe = (r: RejectedItem): string => {
    const day = roundOf(r)?.number ?? null
    if (r.kind === 'score') {
      const p = r.payload as ScorePayload
      return IB.rejectedScore(name(p.player_id), IB.dayHole(day, p.hole), IB.scoreValue(p.strokes, p.putts, p.picked_up))
    }
    if (r.kind === 'tiebreak') {
      const p = r.payload as TiebreakPayload
      return IB.rejectedTiebreak(snapshot.groups.find((g) => g.id === p.group_id)?.number ?? 0, IB.dayHole(day, p.hole), name(p.last_holed_player_id))
    }
    if (r.kind === 'award') {
      const p = r.payload as AwardPayload
      const label = data.settings.games.find((g) => g.id === p.game_id)?.label ?? p.game_id
      return IB.rejectedAward(label, IB.dayHole(day, p.hole), t.common.andList(p.player_ids.map(name)) || t.card.contest.nobody)
    }
    const pair = snapshot.pairs.find((x) => x.id === (r.payload as SignaturePayload).pair_id)
    return IB.rejectedSignature(pair?.name ?? (pair ? t.common.andList([name(pair.player1Id), name(pair.player2Id)]) : '?'), day)
  }
  /**
   * What stands in the way now, said as it is now: a player's score or
   * signature meets a closed day or a signed card. The server never refuses
   * a Comité device, a tiebreak or a contest for those, so their own
   * message stays.
   */
  const reason = (r: RejectedItem): string => {
    const round = roundOf(r)
    if (!canResend && round && (r.kind === 'score' || r.kind === 'signature')) {
      if (round.status !== 'live') return IB.reasonClosed(round.number)
      if (signedFor(snapshot, r)) return IB.reasonSigned
      if (!writable(r)) return IB.reasonNotInGroup(round.number)
    }
    // eslint-disable-next-line no-restricted-syntax -- a RejectedItem's message is copy outbox.ts already made (describeSyncError), not an error's text
    return r.message
  }
  /**
   * This phone's player could write it now, as the server would let him: the
   * day live, the card unsigned, and he in that group that day with whoever
   * the capture is about (a signature is of the other pair of his group).
   * Moved to another group, he could not, and a resend would be refused again.
   */
  const writable = (r: RejectedItem): boolean => {
    const round = roundOf(r)
    if (!playerId || !round || round.status !== 'live' || signedFor(snapshot, r)) return false
    const groups = snapshot.groups.filter((g) => g.roundId === round.id && g.playerIds.includes(playerId))
    const together = (...ids: string[]) => groups.some((g) => ids.every((id) => g.playerIds.includes(id)))
    if (r.kind === 'score') return together((r.payload as ScorePayload).player_id)
    if (r.kind === 'signature') {
      const pair = snapshot.pairs.find((x) => x.id === (r.payload as SignaturePayload).pair_id)
      return !!pair && pair.player1Id !== playerId && pair.player2Id !== playerId && together(pair.player1Id, pair.player2Id)
    }
    const p = r.payload as TiebreakPayload | AwardPayload
    const group = groups.find((g) => g.id === p.group_id)
    const named = 'player_ids' in p ? p.player_ids : [p.last_holed_player_id]
    return !!group && named.every((id) => group.playerIds.includes(id))
  }
  /** Whose hole went to the Comité: usually another player's (the phone keeps the other pair's card), else this phone's own. */
  const leftForComite = (p: ScorePayload) => IB.leftForComite(p.hole, p.player_id === playerId ? null : name(p.player_id))
  /** A Comité device always can; a player's phone, what it could write now. */
  const resendable = (r: RejectedItem) => canResend || writable(r)
  /** What the card holds now for a refused hole, when it differs: a resend would replace it. */
  const onCard = (r: RejectedItem): string | null => {
    if (r.kind !== 'score') return null
    const p = r.payload as ScorePayload
    const now = snapshot.scores.find((s) => s.roundId === p.round_id && s.playerId === p.player_id && s.hole === p.hole)
    if (!now || (now.strokes === p.strokes && now.putts === p.putts && now.pickedUp === p.picked_up)) return null
    return IB.nowOnCard(IB.scoreValue(now.strokes, now.putts, now.pickedUp))
  }
  const text = [IB.sendHeader(snapshot.tournament.name, playerId ? name(playerId) : null), ...rejected.map(describe)].join('\n')
  // Per state: a list where some lines can go again and some can't says both, so neither instruction is lost.
  const again = rejected.filter(resendable).length
  const hint = canResend ? IB.rejectedHint : again === rejected.length ? IB.rejectedHintResend : again ? IB.rejectedHintMixed : IB.rejectedHintPlayer

  return (
    <section className={styles.box} aria-labelledby={titleId}>
      <strong id={titleId} className={styles.title}>
        {IB.rejectedTitle}
      </strong>
      <span className={styles.hint}>{hint}</span>
      {!canResend && (
        <button className={`btn btn--secondary btn--sm ${styles.send}`} type="button" onClick={() => void sendToComite(text, setManual)}>
          {IB.sendToComite}
        </button>
      )}
      <div className={styles.rows}>
        {rejected.map((r) => (
          <div key={r.key} className={styles.row}>
            <span className={styles.text}>
              <span>{describe(r)}</span>
              <span className={styles.reason}>{reason(r)}</span>
              {!canResend && r.atServer && <span className={styles.reason}>{leftForComite(r.payload as ScorePayload)}</span>}
              {resendable(r) && onCard(r) && <span className={styles.reason}>{onCard(r)}</span>}
            </span>
            <span className={styles.actions}>
              {resendable(r) && (
                <button className="btn btn--secondary btn--sm" type="button" onClick={() => void retryRejected(r.key)} aria-label={`${IB.resend}: ${describe(r)}`}>
                  {IB.resend}
                </button>
              )}
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => setDiscarding(r)} aria-label={`${IB.discard}: ${describe(r)}`}>
                {IB.discard}
              </button>
            </span>
          </div>
        ))}
      </div>
      <ConfirmSheet
        open={!!discarding}
        title={IB.discardTitle}
        body={discarding ? `${describe(discarding)}. ${IB.discardBody}` : ''}
        confirmLabel={IB.discard}
        danger
        onConfirm={() => {
          if (discarding) void discardRejected(discarding.key)
          setDiscarding(null)
        }}
        onClose={() => setDiscarding(null)}
      />
      <Sheet open={manual !== null} onClose={() => setManual(null)} title={IB.sendToComite}>
        <p className="help">{IB.sendManual}</p>
        <pre className={styles.manual}>{manual}</pre>
      </Sheet>
    </section>
  )
}

/** The card a refused write belongs to was signed: a score's player's pair, or the signature's own pair, on that day. */
function signedFor(snapshot: Snapshot, r: RejectedItem): boolean {
  const player = r.kind === 'score' ? (r.payload as ScorePayload).player_id : null
  const pairId = r.kind === 'signature' ? (r.payload as SignaturePayload).pair_id : snapshot.pairs.find((p) => player && (p.player1Id === player || p.player2Id === player))?.id
  return !!pairId && snapshot.cardSignatures.some((s) => s.roundId === r.payload.round_id && s.pairId === pairId)
}

/** The values as text, for the Comité's chat: the phone's share sheet, else the clipboard, else on screen to copy by hand. */
async function sendToComite(text: string, show: (text: string) => void) {
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return
    } catch (e) {
      // Closing the share sheet is a choice, not a failure.
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    toast(IB.sendCopied)
  } catch {
    show(text)
  }
}
