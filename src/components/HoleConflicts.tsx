/**
 * Holes someone else saved first (REL-05): the server kept their value and
 * this phone's did not overwrite it. Each line says whose value stands and
 * what this phone had, and the player chooses: send his again over theirs
 * (a new save, against the value he now sees) or keep theirs.
 *
 * Every one this phone holds for the tournament, whatever day or group it
 * is on, in every state of the Tarjeta (the live card, a closed day, no
 * group, no day): the question is only on this phone, and the Comité's list
 * never shows a conflict, so a question hidden here was a typed value lost
 * from everyone's sight (REL-08). A day that is no longer live says where
 * «Guardar el mío» goes then: the server refuses it, and the refusal of a
 * typed value reaches «Pendientes de revisar».
 */
import { useId } from 'react'
import { t } from '../i18n/es-MX'
import { keepTheirs, sendMineAgain, applyFields, baseRow, useOutbox, type ConflictItem } from '../data/outbox'
import { useTournament } from '../data/tournamentStore'
import { toast } from './ui'
import { humanError } from '../lib/humanError'
import styles from './RejectedWrites.module.css'

const S = t.card

/** `roundId`: the day on screen (its lines say only the hole); any other day's lines name the day. */
export function HoleConflicts({ roundId, myPlayerId }: { roundId: string | null; myPlayerId: string | null }) {
  const items = useOutbox((s) => s.conflicts)
  const players = useTournament((s) => s.data?.snapshot.players)
  const rounds = useTournament((s) => s.data?.snapshot.rounds)
  const titleId = useId()
  if (!items.length || !players) return null
  const round = (id: string) => rounds?.find((r) => r.id === id)
  const day = (c: ConflictItem) => (c.round_id === roundId ? null : (round(c.round_id)?.number ?? null))
  const sorted = [...items].sort((a, b) => (round(a.round_id)?.number ?? 0) - (round(b.round_id)?.number ?? 0) || a.hole - b.hole || a.player_id.localeCompare(b.player_id))
  const closed = sorted.some((c) => round(c.round_id)?.status !== 'live')
  const name = (id: unknown) => players.find((p) => p.id === id)?.displayName ?? null
  const line = (c: ConflictItem) => {
    const puttsOnly = c.clash.every((f) => f === 'putts')
    const withPutts = !puttsOnly && c.clash.includes('putts')
    const mine = applyFields(baseRow(c.base), c.fields)
    const s = c.server
    const theirs = S.conflictValue((s?.strokes as number | null) ?? null, (s?.putts as number | null) ?? null, s?.picked_up === true, withPutts, puttsOnly)
    const player = name(c.player_id) ?? '?'
    const who = s ? name(s.entered_by) : null
    return S.conflictLine(c.hole, who, player, theirs, S.conflictValue(mine.strokes, mine.putts, mine.picked_up, withPutts, puttsOnly), !!s && s.entered_by === c.player_id, day(c))
  }
  const act = (fn: () => Promise<void>) => void fn().catch((e: unknown) => toast(humanError(e)))
  return (
    <section className={styles.box} aria-labelledby={titleId} aria-live="polite">
      <strong id={titleId} className={styles.title}>
        {S.conflictTitle}
      </strong>
      {closed && <span className={styles.hint}>{S.conflictClosedHint}</span>}
      <div className={styles.rows}>
        {sorted.map((c) => (
          <div key={c.key} className={styles.row}>
            <span className={styles.text}>{line(c)}</span>
            <span className={styles.actions}>
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => act(() => sendMineAgain(c.key, myPlayerId))} aria-label={S.conflictAction(S.keepMine, c.hole, name(c.player_id) ?? '?', day(c))}>
                {S.keepMine}
              </button>
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => act(() => keepTheirs(c.key))} aria-label={S.conflictAction(S.keepTheirs, c.hole, name(c.player_id) ?? '?', day(c))}>
                {S.keepTheirs}
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
