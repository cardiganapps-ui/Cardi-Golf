/**
 * Tarjeta (§9.3): enter strokes and putts for the whole group, one hole at a
 * time, in seconds, offline-capable through the outbox.
 */
import confetti from 'canvas-confetti'
import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar, Sheet, toast } from '../../components/ui'
import { enqueueScore, enqueueSignature, enqueueTiebreak, useOutbox } from '../../data/outbox'
import { useTournament } from '../../data/tournamentStore'
import { playOrder } from '../../engine/core/playOrder'
import { netScoreName, stablefordPoints } from '../../engine/core/stableford'
import type { Group, Round } from '../../engine/types'
import { useTournamentCtx } from './TournamentGate'
import { useActiveRound, useMyGroup } from './useMyGroup'
import styles from './ScorecardScreen.module.css'

const S = t.card

interface Draft {
  strokes: number
  putts: number
  pickedUp: boolean
}

export function ScorecardScreen() {
  const data = useTournament((s) => s.data)
  const { me, tournamentId } = useTournamentCtx()
  const round = useActiveRound()
  const myGroup = useMyGroup(round)
  const [groupId, setGroupId] = useState<string | null>(null)
  const groups = useMemo(() => (data && round ? data.snapshot.groups.filter((g) => g.roundId === round.id) : []), [data, round])
  const group = myGroup ?? groups.find((g) => g.id === groupId) ?? null

  if (!data) return null
  if (!round) {
    return (
      <div className="screen">
        <h1>{t.nav.card}</h1>
        <p className="muted">{t.live.noRounds}</p>
      </div>
    )
  }
  if (round.status !== 'live' && !me.isAdmin) {
    return (
      <div className="screen">
        <h1>{t.nav.card}</h1>
        <p className="muted">{S.roundNotLive(round.number)}</p>
      </div>
    )
  }
  if (!group) {
    return (
      <div className="screen">
        <h1>{t.nav.card}</h1>
        {groups.length === 0 ? (
          <p className="muted">{S.noGroups}</p>
        ) : (
          <>
            <p className="muted">{me.playerId ? S.notInGroup : S.pickGroup}</p>
            {(me.isAdmin || !me.playerId) && (
              <div className="list">
                {groups.map((g) => (
                  <button key={g.id} type="button" className="listItem" onClick={() => setGroupId(g.id)}>
                    <span className="grow">
                      <strong>
                        {S.group} {g.number}
                      </strong>
                      <span className="help" style={{ display: 'block' }}>
                        {g.playerIds.map((id) => data.snapshot.players.find((p) => p.id === id)?.displayName ?? '?').join(' · ')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )
  }
  return <GroupCard key={`${round.id}:${group.id}`} round={round} group={group} tournamentId={tournamentId} />
}

function GroupCard({ round, group, tournamentId }: { round: Round; group: Group; tournamentId: string }) {
  const data = useTournament((s) => s.data)!
  const { me } = useTournamentCtx()
  const pending = useOutbox((s) => s.pending)
  const { snapshot, state, settings } = data
  const players = group.playerIds.map((id) => snapshot.players.find((p) => p.id === id)!).filter(Boolean)
  const order = useMemo(() => playOrder(group.startHole, round.holes), [group.startHole, round.holes])
  const roundState = state.core.rounds[round.id] ?? {}
  const threshold = settings.modules.snake.enabled ? settings.modules.snake.puttsThreshold : Infinity

  // Start on the first hole the group has not completed.
  const firstOpen = order.find((h) => players.some((p) => !roundState[p.id]?.holes[h - 1]?.played)) ?? order[order.length - 1]!
  const [hole, setHole] = useState<number>(firstOpen)
  const [view, setView] = useState<'hole' | 'grid'>('hole')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [tiebreak, setTiebreak] = useState<{ candidates: string[] } | null>(null)
  const [confirmWeird, setConfirmWeird] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const holeInfo = (pid: string) => roundState[pid]?.holes[hole - 1]
  const par = holeInfo(players[0]!.id)?.par ?? 4

  // (Re)initialize drafts when the hole changes: saved values or defaults (par, 2 putts).
  useEffect(() => {
    const next: Record<string, Draft> = {}
    for (const p of players) {
      const h = holeInfo(p.id)
      next[p.id] = h?.played
        ? { strokes: h.gross ?? h.par, putts: h.putts ?? 2, pickedUp: h.pickedUp }
        : { strokes: h?.par ?? 4, putts: 2, pickedUp: false }
    }
    setDrafts(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole, round.id, group.id])

  const setDraft = (pid: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [pid]: { ...d[pid]!, ...patch } }))

  const idx = order.indexOf(hole)
  const goto = (i: number) => {
    if (i < 0 || i >= order.length) return
    setHole(order[i]!)
  }

  const pairsOn = settings.modules.pairs.enabled
  const myPair = me.playerId ? snapshot.pairs.find((p) => p.player1Id === me.playerId || p.player2Id === me.playerId) : null
  const rivalPair = myPair ? snapshot.pairs.find((p) => p.id !== myPair.id && [p.player1Id, p.player2Id].every((id) => group.playerIds.includes(id))) : null
  const pairName = (p: { name: string | null; player1Id: string; player2Id: string }) =>
    p.name ?? `${snapshot.players.find((x) => x.id === p.player1Id)?.displayName} & ${snapshot.players.find((x) => x.id === p.player2Id)?.displayName}`

  const signed = (pid: string) => {
    const pair = snapshot.pairs.find((p) => p.player1Id === pid || p.player2Id === pid)
    return !!pair && snapshot.cardSignatures.some((s) => s.roundId === round.id && s.pairId === pair.id)
  }
  const anySigned = players.some((p) => signed(p.id))
  const canEdit = me.isAdmin || (round.status === 'live' && !anySigned)

  function validate(): string[] {
    const weird: string[] = []
    for (const p of players) {
      const d = drafts[p.id]!
      if (d.pickedUp) continue
      if (d.strokes >= 10) weird.push(`${p.displayName}: ${d.strokes} golpes`)
      if (d.putts >= 5) weird.push(`${p.displayName}: ${d.putts} putts`)
    }
    return weird
  }

  async function save(force = false) {
    if (!canEdit) return
    if (!force) {
      const weird = validate()
      if (weird.length) {
        setConfirmWeird(weird)
        return
      }
    }
    setConfirmWeird(null)
    // Snake tiebreak: 2+ players at the threshold on this hole and no answer yet.
    const candidates = players.filter((p) => !drafts[p.id]!.pickedUp || drafts[p.id]!.putts >= threshold).filter((p) => drafts[p.id]!.putts >= threshold).map((p) => p.id)
    const answered = snapshot.snakeTiebreaks.some((tb) => tb.roundId === round.id && tb.groupId === group.id && tb.hole === hole)
    if (candidates.length >= 2 && !answered && !tiebreak) {
      setTiebreak({ candidates })
      return
    }
    await commit()
  }

  async function commit(lastHoled?: string) {
    setBusy(true)
    try {
      let celebrate = false
      for (const p of players) {
        const d = drafts[p.id]!
        const h = holeInfo(p.id)
        const sr = h?.strokesReceived ?? 0
        const pts = stablefordPoints(h?.par ?? par, sr, d.pickedUp ? null : d.strokes, d.pickedUp)
        if (!d.pickedUp && pts >= 3 && p.id === me.playerId) celebrate = true
        await enqueueScore(tournamentId, {
          round_id: round.id,
          player_id: p.id,
          hole,
          strokes: d.pickedUp ? null : d.strokes,
          putts: d.putts,
          picked_up: d.pickedUp,
          entered_by: me.playerId,
          client_ts: new Date().toISOString(),
        })
      }
      if (lastHoled) {
        await enqueueTiebreak(tournamentId, { round_id: round.id, group_id: group.id, hole, last_holed_player_id: lastHoled, decided_by: me.playerId })
      }
      setTiebreak(null)
      if (celebrate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: ['#0F6E77', '#F2B63F', '#B04327', '#A9DCD8'] })
      }
      if (idx < order.length - 1) goto(idx + 1)
      else setView('grid')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function sign(pairId: string) {
    if (!confirm(S.signConfirm)) return
    await enqueueSignature(tournamentId, { round_id: round.id, pair_id: pairId, signed_by: me.playerId })
    toast(S.signed)
  }

  const complete = players.every((p) => roundState[p.id]?.complete)
  const missing = (pid: string) => order.filter((h) => !roundState[pid]?.holes[h - 1]?.played)

  return (
    <div
      className={`screen ${styles.wrap}`}
      onTouchStart={(e) => (touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
      onTouchEnd={(e) => {
        if (!touch.current || view !== 'hole') return
        const dx = e.changedTouches[0]!.clientX - touch.current.x
        const dy = e.changedTouches[0]!.clientY - touch.current.y
        touch.current = null
        if (Math.abs(dx) > 70 && Math.abs(dy) < 50) goto(dx < 0 ? idx + 1 : idx - 1)
      }}
    >
      <div className="row row--between">
        <div>
          <span className="label">
            {t.round.day(round.number)} · {S.group} {group.number}
          </span>
          {pairsOn && rivalPair && <p className="help">{S.keeping(pairName(rivalPair))}</p>}
        </div>
        <div className="row">
          <span className={`chip ${pending ? 'chip--sun' : 'chip--teal'}`}>{pending ? t.sync.pending(pending) : t.sync.synced}</span>
          <button className="btn btn--secondary btn--sm" type="button" onClick={() => setView(view === 'hole' ? 'grid' : 'hole')}>
            {view === 'hole' ? S.grid : S.holeView}
          </button>
        </div>
      </div>

      {view === 'grid' ? (
        <div className={styles.gridWrap}>
          <table className={`table ${styles.grid}`}>
            <thead>
              <tr>
                <th>#</th>
                {players.map((p) => (
                  <th key={p.id}>{p.displayName.slice(0, 6)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.map((h) => (
                <tr key={h}>
                  <td>
                    <button type="button" className={styles.holeBtn} onClick={() => { setHole(h); setView('hole') }}>
                      {h}
                    </button>
                  </td>
                  {players.map((p) => {
                    const hi = roundState[p.id]?.holes[h - 1]
                    return (
                      <td key={p.id} className={`num ${hi?.played ? '' : styles.missing} ${hi?.disputed ? styles.disputed : ''}`} title={hi?.disputed ? S.disputed : undefined}>
                        {hi?.played ? (hi.pickedUp ? 'L' : hi.points) : '·'}
                        {hi?.disputed && <span className={styles.disputedMark} aria-label={S.disputed}>!</span>}
                        {hi?.played && !hi.pickedUp && <span className={styles.grossMini}>{hi.gross}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Σ</strong>
                </td>
                {players.map((p) => (
                  <td key={p.id} className="num">
                    <strong>{roundState[p.id]?.points ?? 0}</strong>
                    <span className={styles.grossMini}>{roundState[p.id]?.thru ?? 0}/{round.holes}</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          {players.some((p) => missing(p.id).length) && <p className="help coral">{S.missingHoles}</p>}
          {players.some((p) => roundState[p.id]?.holes.some((h) => h.disputed)) && <p className="help" style={{ color: '#8a5a00' }}>{S.disputedHint}</p>}
          {pairsOn && complete && (
            <div className="stack" style={{ marginTop: 12 }}>
              {snapshot.pairs
                .filter((p) => [p.player1Id, p.player2Id].every((id) => group.playerIds.includes(id)))
                .map((p) => {
                  const isSigned = snapshot.cardSignatures.some((s) => s.roundId === round.id && s.pairId === p.id)
                  const mine = myPair?.id === p.id
                  return (
                    <div key={p.id} className="card card--cell row row--between" style={{ padding: 12 }}>
                      <span>
                        <strong>{pairName(p)}</strong>
                        <span className="help" style={{ display: 'block' }}>
                          {isSigned ? S.cardSigned : S.cardUnsigned}
                        </span>
                      </span>
                      {!isSigned && (!mine || me.isAdmin) && (
                        <button className="btn btn--primary btn--sm" type="button" onClick={() => void sign(p.id)}>
                          {S.sign}
                        </button>
                      )}
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      ) : (
        <>
          <header className={styles.holeHeader}>
            <button className="btn btn--ghost" type="button" onClick={() => goto(idx - 1)} disabled={idx === 0} aria-label={S.prev}>
              ‹
            </button>
            <div className={styles.holeTitle}>
              <span className="label">{t.round.hole(hole)}</span>
              <span className={styles.holeMeta}>
                <span className="num">Par {par}</span>
                <span>· SI {holeInfo(players[0]!.id)?.strokeIndex ?? '–'}</span>
                {holeInfo(players[0]!.id)?.yards ? <span>· {holeInfo(players[0]!.id)!.yards} y</span> : null}
              </span>
            </div>
            <button className="btn btn--ghost" type="button" onClick={() => goto(idx + 1)} disabled={idx === order.length - 1} aria-label={S.next}>
              ›
            </button>
          </header>

          <div className="stack">
            {players.map((p) => {
              const d = drafts[p.id]
              const h = holeInfo(p.id)
              if (!d || !h) return null
              const pts = stablefordPoints(h.par, h.strokesReceived, d.pickedUp ? null : d.strokes, d.pickedUp)
              const locked = signed(p.id) && !me.isAdmin
              return (
                <div key={p.id} className={`card ${styles.playerCard} ${locked ? styles.locked : ''}`}>
                  <div className="row">
                    <Avatar name={p.displayName} url={p.avatarUrl} honoree={p.isHonoree} />
                    <div className="grow">
                      <strong>{p.displayName}</strong>
                      <span className="help" style={{ display: 'block' }}>
                        {h.strokesReceived > 0 ? <span className={styles.dots}>{'•'.repeat(h.strokesReceived)}</span> : S.noStrokes}
                        {h.par !== par ? ` · Par ${h.par}` : ''}
                      </span>
                    </div>
                    <span className={`chip ${pts >= 3 ? 'chip--sun' : pts === 0 ? 'chip--coral' : 'chip--teal'}`}>
                      {pts} pts{!d.pickedUp && pts > 0 ? ` · ${netScoreName(pts)}` : ''}
                    </span>
                  </div>
                  <div className={styles.steppers}>
                    <Stepper label={S.strokes} value={d.pickedUp ? null : d.strokes} min={1} max={15} disabled={locked || d.pickedUp} onChange={(v) => setDraft(p.id, { strokes: v, putts: Math.min(d.putts, v) })} />
                    <Stepper label={S.putts} value={d.putts} min={0} max={d.pickedUp ? 15 : d.strokes} disabled={locked} onChange={(v) => setDraft(p.id, { putts: v })} />
                    <button type="button" className={`${styles.pickup} ${d.pickedUp ? styles.pickupOn : ''}`} disabled={locked} onClick={() => setDraft(p.id, { pickedUp: !d.pickedUp })} aria-pressed={d.pickedUp}>
                      {S.pickedUp}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className={styles.saveBar}>
            <button className="btn btn--primary btn--block" type="button" disabled={busy || !canEdit} onClick={() => void save()}>
              {idx === order.length - 1 ? S.saveLast : S.save}
            </button>
            {!canEdit && <p className="help coral">{anySigned ? S.lockedSigned : S.roundNotLive(round.number)}</p>}
          </div>
        </>
      )}

      <Sheet open={!!tiebreak} onClose={() => setTiebreak(null)} title={S.whoHoledLast}>
        <div className="stack">
          <p className="help">{S.whoHoledLastHint}</p>
          {tiebreak?.candidates.map((id) => {
            const p = players.find((x) => x.id === id)!
            return (
              <button key={id} type="button" className="listItem" onClick={() => void commit(id)}>
                <Avatar name={p.displayName} url={p.avatarUrl} />
                <strong>{p.displayName}</strong>
              </button>
            )
          })}
        </div>
      </Sheet>

      <Sheet open={!!confirmWeird} onClose={() => setConfirmWeird(null)} title={S.weirdTitle}>
        <div className="stack">
          <ul>
            {confirmWeird?.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <div className="row">
            <button className="btn btn--secondary" type="button" onClick={() => setConfirmWeird(null)}>
              {S.weirdFix}
            </button>
            <button className="btn btn--primary grow" type="button" onClick={() => void save(true)}>
              {S.weirdConfirm}
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}

function Stepper({ label, value, min, max, disabled, onChange }: { label: string; value: number | null; min: number; max: number; disabled?: boolean; onChange: (v: number) => void }) {
  const v = value ?? min
  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <span className="label">{label}</span>
      <div className={styles.stepperRow}>
        <button type="button" className={styles.stepBtn} disabled={disabled || v <= min} onClick={() => onChange(v - 1)} aria-label={`${label} −1`}>
          −
        </button>
        <span className={`num ${styles.stepValue}`} aria-live="polite">
          {value == null ? '–' : v}
        </span>
        <button type="button" className={styles.stepBtn} disabled={disabled || v >= max} onClick={() => onChange(v + 1)} aria-label={`${label} +1`}>
          +
        </button>
      </div>
    </div>
  )
}
