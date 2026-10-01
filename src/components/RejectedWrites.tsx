/**
 * Writes this device tried to save and the server refused for good (signed
 * card, round no longer live, permission). Shown wherever the device could
 * act on them: the Tarjeta (discard, tell the Comité) and Comité › Tarjetas
 * (resend from an admin device, or discard).
 */
import { t } from '../i18n/es-MX'
import { discardRejected, retryRejected, useOutbox, type RejectedItem } from '../data/outbox'
import { useTournament } from '../data/tournamentStore'
import styles from './RejectedWrites.module.css'

const IB = t.admin.inbox

export function RejectedWrites({ canResend }: { canResend: boolean }) {
  const rejected = useOutbox((s) => s.rejected)
  const data = useTournament((s) => s.data)
  if (!rejected.length || !data) return null
  const { snapshot } = data
  const name = (id: string | null) => snapshot.players.find((p) => p.id === id)?.displayName ?? '?'
  const describe = (r: RejectedItem): string => {
    if (r.kind === 'score') {
      const p = r.payload as { player_id: string; hole: number; strokes: number | null; putts: number | null; picked_up: boolean }
      return IB.rejectedScore(name(p.player_id), p.hole, `${p.picked_up ? 'L' : (p.strokes ?? '–')}/${p.putts ?? '–'}`)
    }
    if (r.kind === 'tiebreak') {
      const p = r.payload as { group_id: string; hole: number; last_holed_player_id: string }
      return IB.rejectedTiebreak(snapshot.groups.find((g) => g.id === p.group_id)?.number ?? 0, p.hole, name(p.last_holed_player_id))
    }
    if (r.kind === 'award') {
      const p = r.payload as { game_id: string; hole: number; player_ids: string[] }
      const label = data.settings.games.find((g) => g.id === p.game_id)?.label ?? p.game_id
      return IB.rejectedAward(label, p.hole, t.common.andList(p.player_ids.map(name)) || t.card.contest.nobody)
    }
    const p = r.payload as { pair_id: string }
    const pair = snapshot.pairs.find((x) => x.id === p.pair_id)
    return IB.rejectedSignature(pair?.name ?? (pair ? t.common.andList([name(pair.player1Id), name(pair.player2Id)]) : '?'))
  }
  return (
    <section className={styles.box}>
      <strong className={styles.title}>{IB.rejectedTitle}</strong>
      <span className={styles.hint}>{IB.rejectedHint}</span>
      <div className={styles.rows}>
        {rejected.map((r) => (
          <div key={r.key} className={styles.row}>
            <span className={styles.text}>
              <span>{describe(r)}</span>
              {/* eslint-disable-next-line no-restricted-syntax -- a RejectedItem's message is copy outbox.ts already made (describeSyncError), not an error's text */}
              <span className={styles.reason}>{r.message}</span>
            </span>
            <span className={styles.actions}>
              {canResend && (
                <button className="btn btn--secondary btn--sm" type="button" onClick={() => void retryRejected(r.key)}>
                  {IB.resend}
                </button>
              )}
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => void discardRejected(r.key)}>
                {IB.discard}
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
