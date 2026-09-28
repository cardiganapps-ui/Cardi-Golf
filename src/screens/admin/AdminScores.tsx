/**
 * Tarjetas (§13): first the inbox, every flag the engine raises across all
 * rounds (snake tiebreaks, discrepancies, unsigned cards, unfinished cards);
 * then any player's card, hole by hole, editable with a reason once signed.
 */
import { useMemo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar, Field, Sheet, toast } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { RejectedWrites } from '../../components/RejectedWrites'
import { adminSaveScore, answerTiebreak, resolveDispute, unsignCard } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from '../tournament/TournamentGate'
import styles from './AdminScores.module.css'
import a from './Admin.module.css'

const SC = t.admin.scores
const IB = t.admin.inbox

export function AdminScores() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const { me } = useTournamentCtx()
  const { snapshot, state } = data
  const rounds = snapshot.rounds.filter((r) => r.status !== 'cancelled')
  const [roundId, setRoundId] = useState<string>(snapshot.tournament.currentRoundId ?? rounds[0]?.id ?? '')
  const [playerId, setPlayerId] = useState<string>(snapshot.players[0]?.id ?? '')
  const [edit, setEdit] = useState<{ hole: number; strokes: number; putts: number; pickedUp: boolean; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [askUnsign, setAskUnsign] = useState(false)
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const dayOf = (rid: string) => t.round.day(snapshot.rounds.find((r) => r.id === rid)?.number ?? 0)
  const pr = state.core.rounds[roundId]?.[playerId]
  const pair = snapshot.pairs.find((p) => p.player1Id === playerId || p.player2Id === playerId)
  const signed = pair ? snapshot.cardSignatures.find((s) => s.roundId === roundId && s.pairId === pair.id) : undefined
  const { pendingSnakeTiebreaks: pending, discrepancies: disputes, unsignedCards, incompleteRounds } = state.flags
  const inboxCount = pending.length + disputes.length + unsignedCards.length + incompleteRounds.length

  // Players grouped by their group in the selected round, unassigned last.
  const groupedPlayers = useMemo(() => {
    const groups = snapshot.groups.filter((g) => g.roundId === roundId).sort((x, y) => x.number - y.number)
    const seen = new Set<string>()
    const out = groups.map((g) => ({ label: SC.groupOf(g.number), players: g.playerIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p) }))
    for (const g of out) for (const p of g.players) seen.add(p.id)
    const rest = snapshot.players.filter((p) => !seen.has(p.id))
    if (rest.length) out.push({ label: groups.length ? SC.noGroup : SC.player, players: rest })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.groups, snapshot.players, roundId])

  /** Same rails as the Tarjeta (§9.3): strokes 1–15, putts 0–strokes. */
  const editError = (() => {
    if (!edit) return null
    if (!edit.pickedUp && (!Number.isInteger(edit.strokes) || edit.strokes < 1 || edit.strokes > 15)) return SC.invalidStrokes
    if (!Number.isInteger(edit.putts) || edit.putts < 0 || edit.putts > 15 || (!edit.pickedUp && edit.putts > edit.strokes)) return SC.invalidPutts
    if (signed && edit.reason.trim().length < 3) return SC.reasonHint
    return null
  })()

  async function save() {
    if (!edit || editError) return
    setBusy(true)
    try {
      await adminSaveScore(
        { round_id: roundId, player_id: playerId, hole: edit.hole, strokes: edit.pickedUp ? null : edit.strokes, putts: edit.putts, picked_up: edit.pickedUp },
        edit.reason.trim() || null,
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
    setBusy(true)
    try {
      await answerTiebreak({ round_id: q.roundId, group_id: q.groupId, hole: q.hole, last_holed_player_id: pid, decided_by: me.playerId })
      await reload()
      toast(t.common.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function resolve(d: (typeof disputes)[number], keepCurrent: boolean) {
    setBusy(true)
    try {
      await resolveDispute(d.roundId, d.playerId, d.hole, keepCurrent)
      await reload()
      toast(t.common.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function doUnsign() {
    if (!pair) return
    setBusy(true)
    try {
      await unsignCard(roundId, pair.id)
      await reload()
      setAskUnsign(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const show = (rid: string, pid?: string) => {
    setRoundId(rid)
    if (pid) setPlayerId(pid)
    document.getElementById('admin-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={a.screen}>
      <h2>{t.admin.sections.scores}</h2>

      <section className={a.section}>
        <div className={a.sectionTitle}>
          <strong>{IB.title}</strong>
          <span className={a.count}>{inboxCount}</span>
        </div>
        {inboxCount === 0 && <span className={a.help}>{IB.none}</span>}
        {inboxCount > 0 && (
          <div className={a.inbox}>
            {pending.map((q) => (
              <div key={`t${q.groupId}${q.hole}`} className={a.inboxRow}>
                <span className={a.inboxText}>
                  <span className={a.inboxTitle}>
                    <span className={`${a.inboxMark} ${a.inboxMarkHot}`} aria-hidden="true" />
                    {IB.tiebreak(snapshot.groups.find((g) => g.id === q.groupId)?.number ?? 0, q.hole)}
                  </span>
                  <span className={a.inboxSub}>
                    {dayOf(q.roundId)}. {t.card.whoHoledLast}
                  </span>
                </span>
                <span className={a.inboxActions}>
                  {q.candidates.map((pid) => (
                    <button key={pid} className="btn btn--secondary btn--sm" type="button" disabled={busy} onClick={() => void answer(q, pid)}>
                      {name(pid)}
                    </button>
                  ))}
                </span>
              </div>
            ))}
            {disputes.map((d) => {
              const s = snapshot.scores.find((x) => x.roundId === d.roundId && x.playerId === d.playerId && x.hole === d.hole)!
              const fmt = (strokes: number | null | undefined, putts: number | null | undefined, picked: boolean | null | undefined) => `${picked ? 'L' : (strokes ?? '–')}/${putts ?? '–'}`
              return (
                <div key={`d${d.roundId}${d.playerId}${d.hole}`} className={a.inboxRow}>
                  <span className={a.inboxText}>
                    <span className={a.inboxTitle}>
                      <span className={`${a.inboxMark} ${a.inboxMarkHot}`} aria-hidden="true" />
                      {IB.dispute(name(d.playerId), d.hole)}
                    </span>
                    <span className={a.inboxSub}>
                      {dayOf(d.roundId)}. {SC.now} {fmt(s.strokes, s.putts, s.pickedUp)} ({name(s.enteredBy ?? '')}), {SC.before} {fmt(s.previous?.strokes, s.previous?.putts, s.previous?.picked_up)} ({name(s.previous?.entered_by ?? '')})
                    </span>
                  </span>
                  <span className={a.inboxActions}>
                    <button className="btn btn--secondary btn--sm" type="button" disabled={busy} onClick={() => void resolve(d, true)}>
                      {SC.keepCurrent}
                    </button>
                    <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => void resolve(d, false)}>
                      {SC.restorePrevious}
                    </button>
                  </span>
                </div>
              )
            })}
            {unsignedCards.map((u) => {
              const pr2 = snapshot.pairs.find((p) => p.id === u.pairId)
              const label = pr2 ? (pr2.name ?? `${name(pr2.player1Id)} & ${name(pr2.player2Id)}`) : '?'
              return (
                <div key={`u${u.roundId}${u.pairId}`} className={a.inboxRow}>
                  <span className={a.inboxText}>
                    <span className={a.inboxTitle}>
                      <span className={a.inboxMark} aria-hidden="true" />
                      {IB.unsigned(label)}
                    </span>
                    <span className={a.inboxSub}>{dayOf(u.roundId)}</span>
                  </span>
                  <span className={a.inboxActions}>
                    <button className="btn btn--ghost btn--sm" type="button" onClick={() => show(u.roundId, pr2?.player1Id)}>
                      {IB.view}
                    </button>
                  </span>
                </div>
              )
            })}
            {incompleteRounds.map((r) => (
              <div key={`i${r.roundId}`} className={a.inboxRow}>
                <span className={a.inboxText}>
                  <span className={a.inboxTitle}>
                    <span className={a.inboxMark} aria-hidden="true" />
                    {IB.incomplete(r.players.length)}
                  </span>
                  <span className={a.inboxSub}>
                    {dayOf(r.roundId)}. {r.players.map(name).join(', ')}
                  </span>
                </span>
                <span className={a.inboxActions}>
                  <button className="btn btn--ghost btn--sm" type="button" onClick={() => show(r.roundId, r.players[0])}>
                    {IB.view}
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <RejectedWrites canResend />

      <section className={a.section} id="admin-card">
        {rounds.length === 0 && <EmptyState title={t.admin.sections.scores} body={SC.noRounds} />}
        {rounds.length > 0 && snapshot.players.length === 0 && <EmptyState title={t.admin.sections.scores} body={SC.noPlayers} />}
        {rounds.length > 0 && snapshot.players.length > 0 && (
          <>
            <div className="segmented" role="tablist">
              {rounds.map((r) => (
                <button key={r.id} type="button" role="tab" aria-selected={r.id === roundId} onClick={() => setRoundId(r.id)}>
                  {t.round.day(r.number)}
                </button>
              ))}
            </div>
            <select className="select" value={playerId} onChange={(e) => setPlayerId(e.target.value)} aria-label={SC.player}>
              {groupedPlayers.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {!pr && <span className={a.help}>{SC.noCard}</span>}
            {pr && (
              <>
                <div className={styles.summary}>
                  <span className={styles.summaryText}>
                    <Avatar name={name(playerId)} url={byId.get(playerId)?.avatarUrl} />
                    <span className={a.rowText}>
                      <span className={a.rowTitle}>
                        {pr.points} pts
                      </span>
                      <span className={a.rowSub}>
                        {t.live.thru} {pr.thru}, {t.live.playingHcp} {pr.playingHcp}
                        {signed ? `, ${SC.signedLine}` : `, ${t.card.cardUnsigned.toLowerCase()}`}
                      </span>
                    </span>
                  </span>
                  {signed && (
                    <button className="btn btn--ghost btn--sm" type="button" onClick={() => setAskUnsign(true)} disabled={busy}>
                      {SC.unsign}
                    </button>
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
                      <span className={styles.holeNum}>{h.hole}</span>
                      <span className={styles.holeGross}>{h.played ? (h.pickedUp ? 'L' : h.gross) : '·'}</span>
                      <span className={styles.holeSub}>{h.played ? `${h.points} pts, ${h.putts ?? '–'} p` : `${t.player.par} ${h.par}`}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit ? `${name(playerId)}, ${t.round.hole(edit.hole)}` : ''}>
        {edit && (
          <div className="stack">
            <div className={styles.editGrid}>
              <Field label={t.card.strokes}>
                <input className="input input--num" type="number" min={1} max={15} value={edit.strokes} disabled={edit.pickedUp} onChange={(e) => setEdit({ ...edit, strokes: Number(e.target.value) })} />
              </Field>
              <Field label={t.card.putts}>
                <input className="input input--num" type="number" min={0} max={15} value={edit.putts} onChange={(e) => setEdit({ ...edit, putts: Number(e.target.value) })} />
              </Field>
            </div>
            <label className="toggle">
              <span>{t.card.pickedUp}</span>
              <input type="checkbox" checked={edit.pickedUp} onChange={(e) => setEdit({ ...edit, pickedUp: e.target.checked })} />
            </label>
            {signed && (
              <Field label={SC.reason} hint={SC.reasonHint}>
                <input className="input" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} autoFocus />
              </Field>
            )}
            {editError && editError !== SC.reasonHint && <span className={a.error}>{editError}</span>}
            <button className="btn btn--primary" type="button" disabled={busy || !!editError} onClick={() => void save()}>
              {busy ? t.common.saving : t.common.save}
            </button>
          </div>
        )}
      </Sheet>

      <ConfirmSheet open={askUnsign} title={SC.unsign} body={SC.unsignConfirm} busy={busy} confirmLabel={SC.unsign} onConfirm={() => void doUnsign()} onClose={() => setAskUnsign(false)} />
    </div>
  )
}
