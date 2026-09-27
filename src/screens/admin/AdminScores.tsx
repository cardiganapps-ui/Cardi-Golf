/**
 * Scores (§13): edit any hole (a signed card requires a reason), resolve
 * discrepancies, answer pending snake tiebreaks, unsign a card.
 */
import { useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar, Field, Sheet, toast } from '../../components/ui'
import { adminSaveScore, resolveDispute, unsignCard } from '../../data/api'
import { enqueueTiebreak } from '../../data/outbox'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from '../tournament/TournamentGate'
import styles from './AdminScores.module.css'

const SC = t.admin.scores

export function AdminScores() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const { me, tournamentId } = useTournamentCtx()
  const { snapshot, state } = data
  const rounds = snapshot.rounds.filter((r) => r.status !== 'cancelled')
  const [roundId, setRoundId] = useState<string>(snapshot.tournament.currentRoundId ?? rounds[0]?.id ?? '')
  const [playerId, setPlayerId] = useState<string>(snapshot.players[0]?.id ?? '')
  const [edit, setEdit] = useState<{ hole: number; strokes: number; putts: number; pickedUp: boolean; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const pr = state.core.rounds[roundId]?.[playerId]
  const pair = snapshot.pairs.find((p) => p.player1Id === playerId || p.player2Id === playerId)
  const signed = pair ? snapshot.cardSignatures.find((s) => s.roundId === roundId && s.pairId === pair.id) : undefined
  const pending = state.flags.pendingSnakeTiebreaks.filter((q) => q.roundId === roundId)
  const disputes = state.flags.discrepancies.filter((d) => d.roundId === roundId)

  async function save() {
    if (!edit) return
    if (signed && edit.reason.trim().length < 3) return
    setBusy(true)
    try {
      await adminSaveScore(
        { round_id: roundId, player_id: playerId, hole: edit.hole, strokes: edit.pickedUp ? null : edit.strokes, putts: edit.putts, picked_up: edit.pickedUp, entered_by: me.playerId },
        signed ? edit.reason.trim() : null,
      )
      await reload()
      setEdit(null)
      toast(t.common.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function answer(q: (typeof pending)[number], pid: string) {
    await enqueueTiebreak(tournamentId, { round_id: q.roundId, group_id: q.groupId, hole: q.hole, last_holed_player_id: pid, decided_by: me.playerId })
    toast(t.common.saved)
  }

  async function keep(d: (typeof disputes)[number]) {
    setBusy(true)
    try {
      await resolveDispute(d.roundId, d.playerId, d.hole)
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function doUnsign() {
    if (!pair || !confirm(SC.unsignConfirm)) return
    setBusy(true)
    try {
      await unsignCard(roundId, pair.id)
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <h2>{t.admin.sections.scores}</h2>

      {pending.length > 0 && (
        <section className="card stack" style={{ borderLeft: '4px solid var(--coral)', padding: 12 }}>
          <strong>{SC.pendingTitle}</strong>
          {pending.map((q) => (
            <div key={`${q.groupId}${q.hole}`} className="stack">
              <span className="help">
                {t.card.group} {snapshot.groups.find((g) => g.id === q.groupId)?.number} · {t.round.hole(q.hole)} · {t.card.whoHoledLast}
              </span>
              <div className="row row--wrap">
                {q.candidates.map((pid) => (
                  <button key={pid} className="btn btn--secondary btn--sm" type="button" onClick={() => void answer(q, pid)}>
                    {name(pid)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {disputes.length > 0 && (
        <section className="card stack" style={{ borderLeft: '4px solid var(--sun)', padding: 12 }}>
          <strong>{SC.disputesTitle}</strong>
          <p className="help">{SC.disputesHint}</p>
          {disputes.map((d) => {
            const s = snapshot.scores.find((x) => x.roundId === d.roundId && x.playerId === d.playerId && x.hole === d.hole)!
            return (
              <div key={`${d.playerId}${d.hole}`} className="row row--between row--wrap">
                <span className="small">
                  <strong>{name(d.playerId)}</strong> · {t.round.hole(d.hole)}: {SC.now} {s.pickedUp ? 'L' : s.strokes}/{s.putts ?? '–'} ({name(s.enteredBy ?? '')}) · {SC.before} {s.previous?.picked_up ? 'L' : s.previous?.strokes}/{s.previous?.putts ?? '–'} ({name(s.previous?.entered_by ?? '')})
                </span>
                <div className="row">
                  <button className="btn btn--secondary btn--sm" type="button" disabled={busy} onClick={() => void keep(d)}>
                    {SC.keepCurrent}
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    type="button"
                    onClick={() => {
                      setPlayerId(d.playerId)
                      setEdit({ hole: d.hole, strokes: s.previous?.strokes ?? 4, putts: s.previous?.putts ?? 2, pickedUp: !!s.previous?.picked_up, reason: SC.restoreReason })
                    }}
                  >
                    {SC.restorePrevious}
                  </button>
                </div>
              </div>
            )
          })}
        </section>
      )}

      <div className="segmented" role="tablist">
        {rounds.map((r) => (
          <button key={r.id} type="button" role="tab" aria-selected={r.id === roundId} onClick={() => setRoundId(r.id)}>
            {t.round.day(r.number)}
          </button>
        ))}
      </div>
      <select className="select" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
        {snapshot.players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.fullName}
          </option>
        ))}
      </select>
      {pr && (
        <>
          <div className="row row--between">
            <span className="row">
              <Avatar name={name(playerId)} url={byId.get(playerId)?.avatarUrl} />
              <span>
                <strong>{pr.points} pts</strong> · {t.live.thru} {pr.thru} · {t.live.playingHcp} {pr.playingHcp}
              </span>
            </span>
            {signed ? (
              <button className="btn btn--ghost btn--sm coral" type="button" onClick={() => void doUnsign()} disabled={busy}>
                {SC.unsign}
              </button>
            ) : (
              <span className="chip chip--outline">{t.card.cardUnsigned}</span>
            )}
          </div>
          <div className={styles.holes}>
            {pr.holes.map((h) => (
              <button
                key={h.hole}
                type="button"
                className={`${styles.hole} ${!h.played ? styles.empty : ''} ${h.disputed ? styles.disputed : ''}`}
                onClick={() => setEdit({ hole: h.hole, strokes: h.gross ?? h.par, putts: h.putts ?? 2, pickedUp: h.pickedUp, reason: '' })}
              >
                <span className="label">{h.hole}</span>
                <span className="num">{h.played ? (h.pickedUp ? 'L' : h.gross) : '·'}</span>
                <span className="help">{h.played ? `${h.points} pts · ${h.putts ?? '–'}p` : `par ${h.par}`}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit ? `${name(playerId)} · ${t.round.hole(edit.hole)}` : ''}>
        {edit && (
          <div className="stack">
            <div className="grid3">
              <Field label={t.card.strokes}>
                <input className="input input--num" type="number" min={1} max={15} value={edit.strokes} disabled={edit.pickedUp} onChange={(e) => setEdit({ ...edit, strokes: Number(e.target.value) })} />
              </Field>
              <Field label={t.card.putts}>
                <input className="input input--num" type="number" min={0} max={15} value={edit.putts} onChange={(e) => setEdit({ ...edit, putts: Number(e.target.value) })} />
              </Field>
              <label className="toggle" style={{ alignSelf: 'end' }}>
                <span>{t.card.pickedUp}</span>
                <input type="checkbox" checked={edit.pickedUp} onChange={(e) => setEdit({ ...edit, pickedUp: e.target.checked })} />
              </label>
            </div>
            {signed && (
              <Field label={SC.reason} hint={SC.reasonHint}>
                <input className="input" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} autoFocus />
              </Field>
            )}
            <button className="btn btn--primary" type="button" disabled={busy || (!!signed && edit.reason.trim().length < 3)} onClick={() => void save()}>
              {t.common.save}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
