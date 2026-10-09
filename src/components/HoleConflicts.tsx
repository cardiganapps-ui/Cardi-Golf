/**
 * Holes someone else saved first (REL-05): the server kept their value and
 * this phone's did not overwrite it. Each line says whose value stands and
 * what this phone had, and the player chooses: send his again over theirs
 * (a new save, against the value he now sees) or keep theirs.
 */
import { useId } from 'react'
import { t } from '../i18n/es-MX'
import { keepTheirs, sendMineAgain, applyFields, baseRow, useOutbox, type ConflictItem } from '../data/outbox'
import { useTournament } from '../data/tournamentStore'
import { toast } from './ui'
import { humanError } from '../lib/humanError'
import styles from './RejectedWrites.module.css'

const S = t.card

export function HoleConflicts({ roundId, playerIds, myPlayerId }: { roundId: string; playerIds: string[]; myPlayerId: string | null }) {
  const all = useOutbox((s) => s.conflicts)
  const players = useTournament((s) => s.data?.snapshot.players)
  const titleId = useId()
  const items = all.filter((c) => c.round_id === roundId && playerIds.includes(c.player_id)).sort((a, b) => a.hole - b.hole)
  if (!items.length || !players) return null
  const name = (id: unknown) => players.find((p) => p.id === id)?.displayName ?? null
  const line = (c: ConflictItem) => {
    const puttsOnly = c.clash.every((f) => f === 'putts')
    const withPutts = !puttsOnly && c.clash.includes('putts')
    const mine = applyFields(baseRow(c.base), c.fields)
    const s = c.server
    const theirs = S.conflictValue((s?.strokes as number | null) ?? null, (s?.putts as number | null) ?? null, s?.picked_up === true, withPutts, puttsOnly)
    const player = name(c.player_id) ?? '?'
    const who = s ? name(s.entered_by) : null
    return S.conflictLine(c.hole, who, player, theirs, S.conflictValue(mine.strokes, mine.putts, mine.picked_up, withPutts, puttsOnly), !!s && s.entered_by === c.player_id)
  }
  const act = (fn: () => Promise<void>) => void fn().catch((e: unknown) => toast(humanError(e)))
  return (
    <section className={styles.box} aria-labelledby={titleId} aria-live="polite">
      <strong id={titleId} className={styles.title}>
        {S.conflictTitle}
      </strong>
      <div className={styles.rows}>
        {items.map((c) => (
          <div key={c.key} className={styles.row}>
            <span className={styles.text}>{line(c)}</span>
            <span className={styles.actions}>
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => act(() => sendMineAgain(c.key, myPlayerId))} aria-label={S.conflictAction(S.keepMine, c.hole, name(c.player_id) ?? '?')}>
                {S.keepMine}
              </button>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => act(() => keepTheirs(c.key))} aria-label={S.conflictAction(S.keepTheirs, c.hole, name(c.player_id) ?? '?')}>
                {S.keepTheirs}
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
