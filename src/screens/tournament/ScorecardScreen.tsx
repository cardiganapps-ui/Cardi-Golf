/**
 * Tarjeta (§9.3): the whole group on one screen per hole, huge numerals,
 * par by default, save and move on; undo instead of confirmation. The grid
 * view is the classic card with pencil notation. Writes go through the
 * outbox, so it works without signal.
 */
import confetti from 'canvas-confetti'
import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Sheet, toast } from '../../components/ui'
import { EmptyState, ScoreMark, Stepper, markFor } from '../../components/primitives'
import { IconAlert, IconChevronLeft, IconChevronRight, IconLock } from '../../components/icons'
import { useOnline } from '../../components/OfflineBanner'
import { enqueueScore, enqueueSignature, enqueueTiebreak, useOutbox } from '../../data/outbox'
import { RejectedWrites } from '../../components/RejectedWrites'
import { useTournament } from '../../data/tournamentStore'
import { playOrder } from '../../engine/core/playOrder'
import { netScoreName, stablefordPoints } from '../../engine/core/stableford'
import type { Group, Round } from '../../engine/types'
import { celebrationColors } from '../../lib/tokens'
import { useTournamentCtx } from './TournamentGate'
import { useActiveRound, useMyGroup } from './useMyGroup'
import styles from './ScorecardScreen.module.css'

const S = t.card

interface Draft {
  strokes: number
  putts: number
  pickedUp: boolean
}

/** The engine names net scores in golf English ("eagle"); the UI shows the Spanish word. Display only. */
const scoreNameEs = (pts: number) => netScoreName(pts).replace('eagle', 'águila')

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
      <div className={styles.screen}>
        <h1>{t.nav.card}</h1>
        <EmptyState title={t.live.noRounds} body="" />
      </div>
    )
  }
  if (round.status !== 'live' && !me.isAdmin) {
    return (
      <div className={styles.screen}>
        <h1>{t.nav.card}</h1>
        <EmptyState title={S.roundNotLive(round.number)} body="" />
      </div>
    )
  }
  if (!group) {
    const nameOf = (id: string) => data.snapshot.players.find((p) => p.id === id)?.displayName ?? '?'
    return (
      <div className={styles.screen}>
        <h1>{t.nav.card}</h1>
        {groups.length === 0 ? (
          <EmptyState title={S.noGroups} body="" />
        ) : (
          <>
            <p className="help">{me.playerId ? S.notInGroup : S.pickGroup}</p>
            {(me.isAdmin || !me.playerId) && (
              <div className={styles.groupList}>
                {groups.map((g) => (
                  <button key={g.id} type="button" className={styles.groupBtn} onClick={() => setGroupId(g.id)}>
                    <strong>
                      {S.group} {g.number}
                    </strong>
                    <span className="help">{g.playerIds.map(nameOf).join(', ')}</span>
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
  const lastError = useOutbox((s) => s.lastError)
  const rejected = useOutbox((s) => s.rejected)
  const online = useOnline()
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
  const [signing, setSigning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const holeInfo = (pid: string) => roundState[pid]?.holes[hole - 1]
  const lead = holeInfo(players[0]!.id)
  const par = lead?.par ?? 4

  // (Re)initialize drafts when the hole changes: saved values or defaults (par, 2 putts).
  useEffect(() => {
    const next: Record<string, Draft> = {}
    for (const p of players) {
      const h = holeInfo(p.id)
      next[p.id] = h?.played ? { strokes: h.gross ?? h.par, putts: h.putts ?? 2, pickedUp: h.pickedUp } : { strokes: h?.par ?? 4, putts: 2, pickedUp: false }
    }
    setDrafts(next)
    initialDrafts.current = JSON.stringify(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole, round.id, group.id])
  // An unsaved hole defers the "new version" reload offer (main.tsx).
  const initialDrafts = useRef('')
  useEffect(() => {
    useOutbox.setState({ editing: JSON.stringify(drafts) !== initialDrafts.current })
  }, [drafts])
  useEffect(() => () => useOutbox.setState({ editing: false }), [])

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
      if (d.strokes >= 10) weird.push(`${p.displayName}: ${d.strokes} ${S.strokes.toLowerCase()}`)
      if (d.putts >= 5) weird.push(`${p.displayName}: ${d.putts} ${S.putts.toLowerCase()}`)
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
    const candidates = players.filter((p) => drafts[p.id]!.putts >= threshold).map((p) => p.id)
    const answered = snapshot.snakeTiebreaks.some((tb) => tb.roundId === round.id && tb.groupId === group.id && tb.hole === hole)
    if (candidates.length >= 2 && !answered && !tiebreak) {
      setTiebreak({ candidates })
      return
    }
    await commit()
  }

  async function commit(lastHoled?: string) {
    setBusy(true)
    const savedHole = hole
    const savedIdx = idx
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
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: celebrationColors() })
      }
      // Move on, and offer the way back instead of asking first.
      toast(S.savedHole(savedHole), {
        label: t.common.undo,
        onClick: () => {
          setView('hole')
          goto(savedIdx)
        },
      })
      if (savedIdx < order.length - 1) goto(savedIdx + 1)
      else setView('grid')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function sign(pairId: string) {
    setSigning(null)
    await enqueueSignature(tournamentId, { round_id: round.id, pair_id: pairId, signed_by: me.playerId })
    toast(S.signed)
  }

  const complete = players.every((p) => roundState[p.id]?.complete)
  const missing = (pid: string) => order.filter((h) => !roundState[pid]?.holes[h - 1]?.played)
  const syncText = !online ? t.sync.offlineShort : rejected.length ? t.sync.rejected(rejected.length) : lastError ? lastError : pending > 0 ? t.sync.pending(pending) : t.sync.synced
  const syncWarn = !online || !!lastError || pending > 0 || rejected.length > 0

  const front = order.filter((h) => h <= 9).sort((a, b) => a - b)
  const back = order.filter((h) => h > 9).sort((a, b) => a - b)
  const sumPts = (pid: string, holes: number[]) => holes.reduce((a, h) => a + (roundState[pid]?.holes[h - 1]?.played ? roundState[pid]!.holes[h - 1]!.points : 0), 0)
  const sumGross = (pid: string, holes: number[]) => {
    const hs = holes.map((h) => roundState[pid]?.holes[h - 1]).filter((h) => h?.played && !h.pickedUp && h.gross != null)
    return hs.length === holes.length ? hs.reduce((a, h) => a + h!.gross!, 0) : null
  }
  const gridRow = (h: number) => (
    <tr key={h}>
      <td>
        <button
          type="button"
          className={`${styles.holeBtn} ${h === hole ? styles.holeCurrent : ''}`}
          onClick={() => {
            setHole(h)
            setView('hole')
          }}
        >
          {h}
        </button>
      </td>
      <td className={styles.gridMeta}>{lead ? (roundState[players[0]!.id]?.holes[h - 1]?.par ?? '') : ''}</td>
      <td className={styles.gridMeta}>{roundState[players[0]!.id]?.holes[h - 1]?.strokeIndex ?? ''}</td>
      {players.map((p) => {
        const hi = roundState[p.id]?.holes[h - 1]
        if (!hi?.played) {
          return (
            <td key={p.id} className={styles.missing}>
              –
            </td>
          )
        }
        return (
          <td key={p.id}>
            <span className={styles.cell}>
              <ScoreMark value={hi.pickedUp ? 'L' : hi.gross!} kind={markFor(hi.gross, hi.par, hi.pickedUp)} />
              <span className={styles.cellPts}>
                {hi.points}
                {hi.disputed && (
                  <span className={styles.disputedMark} aria-label={S.disputed}>
                    <IconAlert size={12} />
                  </span>
                )}
              </span>
            </span>
          </td>
        )
      })}
    </tr>
  )
  const subtotalRow = (label: string, holes: number[], total = false) => (
    <tr className={total ? styles.total : styles.subtotal}>
      <td>{label}</td>
      <td className={styles.gridMeta}>{holes.reduce((a, h) => a + (roundState[players[0]!.id]?.holes[h - 1]?.par ?? 0), 0) || ''}</td>
      <td />
      {players.map((p) => {
        const g = sumGross(p.id, holes)
        return (
          <td key={p.id}>
            <span className={styles.cell}>
              <span>{sumPts(p.id, holes)}</span>
              <span className={styles.cellPts}>{g ?? ''}</span>
            </span>
          </td>
        )
      })}
    </tr>
  )

  return (
    <div
      className={styles.screen}
      onTouchStart={(e) => (touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
      onTouchEnd={(e) => {
        if (!touch.current || view !== 'hole') return
        const dx = e.changedTouches[0]!.clientX - touch.current.x
        const dy = e.changedTouches[0]!.clientY - touch.current.y
        touch.current = null
        if (Math.abs(dx) > 70 && Math.abs(dy) < 50) goto(dx < 0 ? idx + 1 : idx - 1)
      }}
    >
      <div className={styles.top}>
        <div className={styles.topText}>
          <span className={styles.topMain}>{S.groupLine(round.number, group.number)}</span>
          {pairsOn && rivalPair && <span>{S.keeping(pairName(rivalPair))}</span>}
        </div>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => setView(view === 'hole' ? 'grid' : 'hole')}>
          {view === 'hole' ? S.grid : S.holeView}
        </button>
      </div>

      {view === 'grid' ? (
        <>
          <div className={styles.gridWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th>{t.player.hole}</th>
                  <th className={styles.gridMeta}>{t.player.par}</th>
                  <th className={styles.gridMeta}>{t.player.si}</th>
                  {players.map((p) => (
                    <th key={p.id}>{p.displayName}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {front.map(gridRow)}
                {back.length > 0 && subtotalRow(S.front, front)}
                {back.map(gridRow)}
                {back.length > 0 && subtotalRow(S.back, back)}
                {subtotalRow(t.common.total, order, true)}
              </tbody>
            </table>
          </div>
          <div className={styles.gridNotes}>
            <span className={`${styles.saveStatus} ${syncWarn ? styles.saveStatusWarn : ''}`}>{syncText}</span>
            {players.some((p) => missing(p.id).length > 0) && <span className="help">{S.missingHoles}</span>}
            {players.some((p) => roundState[p.id]?.holes.some((h) => h.disputed)) && <span className="help">{S.disputedHint}</span>}
          </div>
          <RejectedWrites canResend={me.isAdmin} />
          {pairsOn && complete && (
            <div>
              {snapshot.pairs
                .filter((p) => [p.player1Id, p.player2Id].every((id) => group.playerIds.includes(id)))
                .map((p) => {
                  const isSigned = snapshot.cardSignatures.some((s) => s.roundId === round.id && s.pairId === p.id)
                  const mine = myPair?.id === p.id
                  return (
                    <div key={p.id} className={styles.signRow}>
                      <span className={styles.signText}>
                        <strong>{pairName(p)}</strong>
                        <span className={`${styles.signState} ${isSigned ? styles.signLocked : ''}`}>
                          {isSigned && <IconLock size={14} />}
                          {isSigned ? S.cardSigned : S.cardUnsigned}
                        </span>
                      </span>
                      {!isSigned && (!mine || me.isAdmin) && (
                        <button className="btn btn--primary btn--sm" type="button" onClick={() => setSigning(p.id)}>
                          {S.sign}
                        </button>
                      )}
                    </div>
                  )
                })}
            </div>
          )}
        </>
      ) : (
        <>
          <header className={styles.holeHead}>
            <button className={styles.holeNav} type="button" onClick={() => goto(idx - 1)} disabled={idx === 0} aria-label={S.prev}>
              <IconChevronLeft />
            </button>
            <div className={styles.holeTitle}>
              <span className={styles.holeNum}>{hole}</span>
              <span className={styles.holeMeta}>
                {t.player.par} {par}, {t.player.si} {lead?.strokeIndex ?? '–'}
                {lead?.yards ? `, ${t.player.yards(lead.yards)}` : ''}
              </span>
            </div>
            <button className={styles.holeNav} type="button" onClick={() => goto(idx + 1)} disabled={idx === order.length - 1} aria-label={S.next}>
              <IconChevronRight />
            </button>
          </header>

          <div className={styles.players}>
            {players.map((p) => {
              const d = drafts[p.id]
              const h = holeInfo(p.id)
              if (!d || !h) return null
              const pts = stablefordPoints(h.par, h.strokesReceived, d.pickedUp ? null : d.strokes, d.pickedUp)
              const locked = signed(p.id) && !me.isAdmin
              return (
                <div key={p.id} className={`${styles.player} ${locked ? styles.locked : ''}`}>
                  <div className={styles.playerLine}>
                    <span className={styles.playerName}>
                      <span className={styles.playerNameText}>{p.displayName}</span>
                      {h.strokesReceived > 0 && (
                        <span className={styles.dots} aria-label={t.admin.players.strokesOn(h.strokesReceived)}>
                          {'•'.repeat(h.strokesReceived)}
                        </span>
                      )}
                    </span>
                    <span className={`${styles.pts} ${pts >= 3 ? styles.ptsHigh : ''}`}>
                      {S.ptsLine(pts, d.pickedUp ? null : pts > 0 ? scoreNameEs(pts) : null)}
                      {h.par !== par ? `, ${S.parHere(h.par)}` : ''}
                    </span>
                  </div>
                  <div className={styles.controls}>
                    <Stepper label={S.strokes} value={d.strokes} par={h.par} min={1} max={15} disabled={locked || d.pickedUp} onChange={(v) => setDraft(p.id, { strokes: v, putts: Math.min(d.putts, v) })} />
                    <Stepper label={S.putts} value={d.putts} min={0} max={d.pickedUp ? 15 : d.strokes} disabled={locked} onChange={(v) => setDraft(p.id, { putts: v })} />
                    <button type="button" className={styles.pickup} disabled={locked} onClick={() => setDraft(p.id, { pickedUp: !d.pickedUp })} aria-pressed={d.pickedUp}>
                      {S.pickedUp}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className={styles.saveBar}>
            <button className="btn btn--primary btn--block" type="button" disabled={busy || !canEdit} onClick={() => void save()}>
              {busy ? t.common.saving : idx === order.length - 1 ? S.saveLast : S.save}
            </button>
            {canEdit ? (
              <span className={`${styles.saveStatus} ${syncWarn ? styles.saveStatusWarn : ''}`}>{syncText}</span>
            ) : (
              <span className={`${styles.saveStatus} ${styles.saveStatusWarn}`}>{anySigned ? S.lockedSigned : S.roundNotLive(round.number)}</span>
            )}
          </div>
          <RejectedWrites canResend={me.isAdmin} />
        </>
      )}

      <Sheet open={!!tiebreak} onClose={() => setTiebreak(null)} title={S.whoHoledLast}>
        <div className="stack">
          <p className="help">{S.whoHoledLastHint}</p>
          {tiebreak?.candidates.map((id) => {
            const p = players.find((x) => x.id === id)!
            return (
              <button key={id} type="button" className="btn btn--secondary btn--block" onClick={() => void commit(id)}>
                {p.displayName}
              </button>
            )
          })}
        </div>
      </Sheet>

      <Sheet open={!!confirmWeird} onClose={() => setConfirmWeird(null)} title={S.weirdTitle}>
        <div className="stack">
          <ul className="small">
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

      <Sheet open={!!signing} onClose={() => setSigning(null)} title={signing ? S.signTitle(pairName(snapshot.pairs.find((p) => p.id === signing)!)) : undefined}>
        <div className="stack">
          <p className="help">{S.signConfirm}</p>
          <div className="row">
            <button className="btn btn--secondary" type="button" onClick={() => setSigning(null)}>
              {t.common.cancel}
            </button>
            <button className="btn btn--primary grow" type="button" onClick={() => signing && void sign(signing)}>
              {S.sign}
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
