/**
 * Tarjetas (§13): first the inbox, every flag the engine raises across all
 * rounds (snake tiebreaks, discrepancies, holes without putts, unsigned
 * cards, unfinished cards);
 * then the holes the server kept for the Comité («Pendientes de revisar»,
 * REL-08); then any player's card, hole by hole, editable with a reason once
 * signed.
 */
import { useMemo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar, Field, Sheet, toast } from '../../components/ui'
import { EmptyState, Segmented } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { RejectedWrites } from '../../components/RejectedWrites'
import { RejectedInbox } from './RejectedInbox'
import { adminSaveScore, answerTiebreak, resolveDispute, unsignCard, unsignPlayerCard } from '../../data/api'
import { playerSignature } from '../../engine/core/cardSigning'
import { useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { mainScoring } from '../../engine/formats'
import { puttingGames, puttsMissing } from '../../engine/core/putts'
import { ownDayText } from '../../lib/figureText'
import styles from './AdminScores.module.css'
import a from './Admin.module.css'
import { NumberField } from '../../components/NumberField'
import { humanError } from '../../lib/humanError'

const SC = t.admin.scores
const IB = t.admin.inbox

export function AdminScores() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const { me } = useTournamentCtx()
  const { snapshot, state, settings } = data
  // The card in the event's own figure (STRAT-03): points only where something counts them.
  const scoring = mainScoring(settings)
  const showPoints = scoring === 'points' || settings.modules.bestRound.enabled || settings.modules.pairs.enabled
  // A hole with strokes and no putts is marked only where a game pays on putts (MONEY-18).
  const puttsCount = puttingGames(settings).length > 0
  const rounds = snapshot.rounds.filter((r) => r.status !== 'cancelled')
  const [roundId, setRoundId] = useState<string>(snapshot.tournament.currentRoundId ?? rounds[0]?.id ?? '')
  const [playerId, setPlayerId] = useState<string>(snapshot.players[0]?.id ?? '')
  const [edit, setEdit] = useState<{ hole: number; strokes: number; putts: number; pickedUp: boolean; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [askUnsign, setAskUnsign] = useState(false)
  const byId = useMemo(() => new Map(snapshot.players.map((p) => [p.id, p])), [snapshot.players])
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const dayOf = (rid: string) => t.round.day(snapshot.rounds.find((r) => r.id === rid)?.number ?? 0)
  const pr = state.core.rounds[roundId]?.[playerId]
  const pair = snapshot.pairs.find((p) => p.player1Id === playerId || p.player2Id === playerId)
  // His pair's signature, or his own (a marker's, 0054): either locks his card.
  const ownSignature = playerSignature(snapshot.cardSignatures, roundId, playerId)
  const signed = ownSignature ?? (pair ? snapshot.cardSignatures.find((s) => s.roundId === roundId && s.pairId === pair.id) : undefined)
  const { pendingSnakeTiebreaks: pending, discrepancies: disputes, unsignedCards, incompleteRounds, missingPutts } = state.flags
  const inboxCount = pending.length + disputes.length + missingPutts.length + unsignedCards.length + incompleteRounds.length

  // Players grouped by their group in the selected round, unassigned last.
  const groupedPlayers = useMemo(() => {
    const groups = snapshot.groups.filter((g) => g.roundId === roundId).sort((x, y) => x.number - y.number)
    const seen = new Set<string>()
    const out = groups.map((g) => ({ label: SC.groupOf(g.number), players: g.playerIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p) }))
    for (const g of out) for (const p of g.players) seen.add(p.id)
    const rest = snapshot.players.filter((p) => !seen.has(p.id))
    if (rest.length) out.push({ label: groups.length ? SC.noGroup : SC.player, players: rest })
    return out
  }, [snapshot.groups, snapshot.players, roundId, byId])

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
      toast(humanError(e))
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
      toast(humanError(e))
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
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  async function doUnsign() {
    if (!ownSignature && !pair) return
    setBusy(true)
    try {
      if (ownSignature) await unsignPlayerCard(roundId, playerId)
      else if (pair) await unsignCard(roundId, pair.id)
      await reload()
      setAskUnsign(false)
    } catch (e) {
      toast(humanError(e))
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
              const who = (id: string | null | undefined) => (id ? name(id) : null)
              return (
                <div key={`d${d.roundId}${d.playerId}${d.hole}`} className={a.inboxRow}>
                  <span className={a.inboxText}>
                    <span className={a.inboxTitle}>
                      <span className={`${a.inboxMark} ${a.inboxMarkHot}`} aria-hidden="true" />
                      {IB.dispute(name(d.playerId), d.hole)}
                    </span>
                    <span className={a.inboxSub}>
                      {dayOf(d.roundId)}. {SC.disputeNow(IB.scoreValue(s.strokes, s.putts, s.pickedUp), who(s.enteredBy))}{' '}
                      {SC.disputeBefore(IB.scoreValue(s.previous?.strokes ?? null, s.previous?.putts ?? null, s.previous?.picked_up ?? false), who(s.previous?.entered_by))}
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
            {missingPutts.map((m) => (
              <div key={`p${m.roundId}${m.playerId}`} className={a.inboxRow}>
                <span className={a.inboxText}>
                  <span className={a.inboxTitle}>
                    <span className={`${a.inboxMark} ${a.inboxMarkHot}`} aria-hidden="true" />
                    {IB.missingPutts(name(m.playerId), m.holes)}
                  </span>
                  <span className={a.inboxSub}>
                    {dayOf(m.roundId)}. {IB.missingPuttsWhy(puttingGames(settings))}
                  </span>
                </span>
                <span className={a.inboxActions}>
                  <button className="btn btn--ghost btn--sm" type="button" onClick={() => show(m.roundId, m.playerId)}>
                    {IB.view}
                  </button>
                </span>
              </div>
            ))}
            {unsignedCards.map((u) => {
              // A marker's rule lists each player's card (UX-23); the pairs' rule, each pair's.
              const pr2 = 'pairId' in u ? snapshot.pairs.find((p) => p.id === u.pairId) : undefined
              const label = 'playerId' in u ? name(u.playerId) : pr2 ? (pr2.name ?? t.common.andList([name(pr2.player1Id), name(pr2.player2Id)])) : '?'
              const who = 'playerId' in u ? u.playerId : pr2?.player1Id
              return (
                <div key={`u${u.roundId}${'pairId' in u ? u.pairId : u.playerId}`} className={a.inboxRow}>
                  <span className={a.inboxText}>
                    <span className={a.inboxTitle}>
                      <span className={a.inboxMark} aria-hidden="true" />
                      {IB.unsigned(label)}
                    </span>
                    <span className={a.inboxSub}>{dayOf(u.roundId)}</span>
                  </span>
                  <span className={a.inboxActions}>
                    <button className="btn btn--ghost btn--sm" type="button" onClick={() => show(u.roundId, who)}>
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
                    {dayOf(r.roundId)}. {t.common.andList(r.players.map(name))}
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

      <RejectedInbox />

      <RejectedWrites canResend />

      <TiebreakAnswers />

      <section className={a.section} id="admin-card">
        {rounds.length === 0 && <EmptyState title={t.admin.sections.scores} body={SC.noRounds} />}
        {rounds.length > 0 && snapshot.players.length === 0 && <EmptyState title={t.admin.sections.scores} body={SC.noPlayers} />}
        {rounds.length > 0 && snapshot.players.length > 0 && (
          <>
            <Segmented value={roundId} options={rounds.map((r) => ({ value: r.id, label: t.round.day(r.number) }))} onChange={setRoundId} label={t.common.whichDay} />
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
                      <span className={a.rowTitle}>{ownDayText(pr, scoring) ?? '—'}</span>
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
                      className={`${styles.hole} ${!h.played ? styles.empty : ''} ${h.disputed || (puttsCount && puttsMissing(h)) ? styles.disputed : ''}`}
                      onClick={() => setEdit({ hole: h.hole, strokes: h.gross ?? h.par, putts: h.putts ?? 2, pickedUp: h.pickedUp, reason: '' })}
                    >
                      <span className={styles.holeNum}>{h.hole}</span>
                      <span className={styles.holeGross}>{h.played ? (h.pickedUp ? 'L' : h.gross) : '–'}</span>
                      {/* Points and putts on two lines: «putts», never «p», does not fit one line six tiles across. */}
                      <span className={styles.holeSub}>{h.played && showPoints ? t.games.pointsFigure(h.points) : `${t.player.par} ${h.par}`}</span>
                      {h.played && h.putts != null && <span className={styles.holeSub}>{t.games.puttsFigure(h.putts)}</span>}
                      {puttsCount && puttsMissing(h) && <span className={styles.holeSub}>{SC.noPutts}</span>}
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
                <NumberField min={1} max={15} value={edit.strokes} disabled={edit.pickedUp} onChange={(v) => setEdit({ ...edit, strokes: v })} />
              </Field>
              <Field label={t.card.putts}>
                <NumberField min={0} max={15} value={edit.putts} onChange={(v) => setEdit({ ...edit, putts: v })} />
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

/**
 * The snake's answered tiebreaks, each with who holed out last and who said
 * so, and «Cambiar»: a thumb that landed on the wrong name decided who carried
 * the snake from that hole, and nobody could fix it (UX-22). The change is an
 * upsert of the same row, audited like the first answer.
 */
function TiebreakAnswers() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const { me } = useTournamentCtx()
  const { snapshot, settings } = data
  const [changing, setChanging] = useState<{ roundId: string; groupId: string; hole: number } | null>(null)
  const [busy, setBusy] = useState(false)
  if (!settings.modules.snake.enabled || snapshot.snakeTiebreaks.length === 0) return null
  const name = (id: string | null | undefined) => (id ? (snapshot.players.find((p) => p.id === id)?.displayName ?? '?') : null)
  const round = (id: string) => snapshot.rounds.find((r) => r.id === id)
  const group = (id: string) => snapshot.groups.find((g) => g.id === id)
  const answers = [...snapshot.snakeTiebreaks]
    .filter((tb) => round(tb.roundId) && group(tb.groupId))
    .sort((x, y) => round(x.roundId)!.number - round(y.roundId)!.number || group(x.groupId)!.number - group(y.groupId)!.number || x.hole - y.hole)
  if (answers.length === 0) return null
  const threshold = settings.modules.snake.puttsThreshold
  /** Who could have holed out last: the group's players at the threshold on that hole (all of the group if putts were changed since). */
  const candidates = (q: { roundId: string; groupId: string; hole: number }) => {
    const members = group(q.groupId)?.playerIds ?? []
    const at = members.filter((pid) => (snapshot.scores.find((x) => x.roundId === q.roundId && x.playerId === pid && x.hole === q.hole)?.putts ?? 0) >= threshold)
    return at.length >= 2 ? at : members
  }
  const current = changing ? snapshot.snakeTiebreaks.find((tb) => tb.roundId === changing.roundId && tb.groupId === changing.groupId && tb.hole === changing.hole) : undefined

  async function pick(pid: string) {
    if (!changing) return
    if (current?.lastHoledPlayerId === pid) {
      setChanging(null)
      return
    }
    setBusy(true)
    try {
      await answerTiebreak({ round_id: changing.roundId, group_id: changing.groupId, hole: changing.hole, last_holed_player_id: pid, decided_by: me.playerId })
      await reload()
      toast(t.common.saved)
      setChanging(null)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={a.section}>
      <div className={a.sectionTitle}>
        <strong>{IB.answeredTitle}</strong>
        <span className={a.count}>{answers.length}</span>
      </div>
      <span className={a.help}>{IB.answeredHint}</span>
      <div className={a.inbox}>
        {answers.map((tb) => (
          <div key={`${tb.roundId}${tb.groupId}${tb.hole}`} className={a.inboxRow}>
            <span className={a.inboxText}>
              <span className={a.inboxTitle}>{IB.tiebreak(group(tb.groupId)!.number, tb.hole)}</span>
              <span className={a.inboxSub}>{IB.answeredSub(t.round.day(round(tb.roundId)!.number), name(tb.lastHoledPlayerId) ?? '?', name(tb.decidedBy))}</span>
            </span>
            <span className={a.inboxActions}>
              <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setChanging({ roundId: tb.roundId, groupId: tb.groupId, hole: tb.hole })}>
                {IB.change}
              </button>
            </span>
          </div>
        ))}
      </div>
      <Sheet open={!!changing && !!current} onClose={() => setChanging(null)} title={changing ? IB.changeTitle(group(changing.groupId)?.number ?? 0, changing.hole) : ''}>
        {changing && (
          <div className="stack">
            <p className="help">{IB.changeHint}</p>
            {candidates(changing).map((pid) => (
              <button key={pid} type="button" className="btn btn--secondary btn--block" aria-pressed={current?.lastHoledPlayerId === pid} disabled={busy} onClick={() => void pick(pid)}>
                {name(pid)}
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </section>
  )
}
