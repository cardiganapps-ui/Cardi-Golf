/**
 * Writes this device tried to save and the server refused for good (signed
 * card, round no longer live, permission). The list lives only on this
 * device, so it shows wherever the device can act on it: the Tarjeta, even
 * once the day is closed (REL-08: a player's phone that was out of signal
 * when the Comité finished the round had nowhere to see its holes), and
 * Comité › Tarjetas.
 *
 * A Comité device sends them again. A player's phone can't, so it hands them
 * to the Comité: «Mandar al Comité» shares the values as text (WhatsApp),
 * the Comité captures them from Comité › Tarjetas, and the player discards.
 * When the day is back in play and the card unsigned, anyone can resend.
 */
import { useId } from 'react'
import { t } from '../i18n/es-MX'
import { discardRejected, retryRejected, useOutbox, type AwardPayload, type RejectedItem, type ScorePayload, type SignaturePayload, type TiebreakPayload } from '../data/outbox'
import { useTournament } from '../data/tournamentStore'
import type { Snapshot } from '../engine/types'
import { toast } from './ui'
import styles from './RejectedWrites.module.css'

const IB = t.admin.inbox


export function RejectedWrites({ canResend, playerId = null }: { canResend: boolean; playerId?: string | null }) {
  const rejected = useOutbox((s) => s.rejected)
  const data = useTournament((s) => s.data)
  const titleId = useId()
  if (!rejected.length || !data) return null
  const { snapshot } = data
  const name = (id: string | null) => snapshot.players.find((p) => p.id === id)?.displayName ?? '?'
  const roundOf = (r: RejectedItem) => snapshot.rounds.find((x) => x.id === r.payload.round_id)
  const describe = (r: RejectedItem): string => {
    const day = roundOf(r)?.number ?? 0
    if (r.kind === 'score') {
      const p = r.payload as ScorePayload
      return IB.rejectedScore(name(p.player_id), day, p.hole, IB.scoreValue(p.strokes, p.putts, p.picked_up))
    }
    if (r.kind === 'tiebreak') {
      const p = r.payload as TiebreakPayload
      return IB.rejectedTiebreak(day, snapshot.groups.find((g) => g.id === p.group_id)?.number ?? 0, p.hole, name(p.last_holed_player_id))
    }
    if (r.kind === 'award') {
      const p = r.payload as AwardPayload
      const label = data.settings.games.find((g) => g.id === p.game_id)?.label ?? p.game_id
      return IB.rejectedAward(label, day, p.hole, t.common.andList(p.player_ids.map(name)) || t.card.contest.nobody)
    }
    const pair = snapshot.pairs.find((x) => x.id === (r.payload as SignaturePayload).pair_id)
    return IB.rejectedSignature(pair?.name ?? (pair ? t.common.andList([name(pair.player1Id), name(pair.player2Id)]) : '?'), day)
  }
  /** Why, from the tournament as it stands: the server's own message names neither. */
  const reason = (r: RejectedItem): string => {
    const round = roundOf(r)
    if (round && round.status !== 'live') return IB.reasonClosed(round.number)
    if (round && signedFor(snapshot, r)) return IB.reasonSigned
    // eslint-disable-next-line no-restricted-syntax -- a RejectedItem's message is copy outbox.ts already made (describeSyncError), not an error's text
    return r.message
  }
  /** A Comité device always can; anyone, once the day is back in play and the card unsigned. */
  const resendable = (r: RejectedItem) => {
    const round = roundOf(r)
    return canResend || (round?.status === 'live' && !signedFor(snapshot, r))
  }
  const text = [IB.sendHeader(snapshot.tournament.name, playerId ? name(playerId) : null), ...rejected.map(describe)].join('\n')

  return (
    <section className={styles.box} aria-labelledby={titleId}>
      <strong id={titleId} className={styles.title}>
        {IB.rejectedTitle}
      </strong>
      <span className={styles.hint}>{canResend ? IB.rejectedHint : IB.rejectedHintPlayer}</span>
      {!canResend && (
        <button className={`btn btn--secondary btn--sm ${styles.send}`} type="button" onClick={() => void sendToComite(text)}>
          {IB.sendToComite}
        </button>
      )}
      <div className={styles.rows}>
        {rejected.map((r) => (
          <div key={r.key} className={styles.row}>
            <span className={styles.text}>
              <span>{describe(r)}</span>
              <span className={styles.reason}>{reason(r)}</span>
            </span>
            <span className={styles.actions}>
              {resendable(r) && (
                <button className="btn btn--secondary btn--sm" type="button" onClick={() => void retryRejected(r.key)} aria-label={`${IB.resend}: ${describe(r)}`}>
                  {IB.resend}
                </button>
              )}
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => void discardRejected(r.key)} aria-label={`${IB.discard}: ${describe(r)}`}>
                {IB.discard}
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** The card a refused write belongs to was signed: a score's player's pair, or the signature's own pair, on that day. */
function signedFor(snapshot: Snapshot, r: RejectedItem): boolean {
  const player = r.kind === 'score' ? (r.payload as ScorePayload).player_id : null
  const pairId = r.kind === 'signature' ? (r.payload as SignaturePayload).pair_id : snapshot.pairs.find((p) => player && (p.player1Id === player || p.player2Id === player))?.id
  return !!pairId && snapshot.cardSignatures.some((s) => s.roundId === r.payload.round_id && s.pairId === pairId)
}

/** The values as text, for the Comité's chat: the phone's share sheet, else the clipboard. */
async function sendToComite(text: string) {
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
    toast(text)
  }
}
