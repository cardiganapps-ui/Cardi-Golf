/**
 * Tarjeta (§9.3): the whole group on one screen per hole, huge numerals,
 * par by default, save and move on; undo instead of confirmation. The grid
 * view is the classic card with pencil notation. Writes go through the
 * outbox, so it works without signal.
 *
 * This file is the composition (ARCH-14). The parts live in `./scorecard/`:
 * the hole's drafts (`useHoleDrafts`, decisions in `holeEntry`), the save and
 * its questions (`useHoleSave`, decisions in `saveDecision`, writes in
 * `writeHole`), where the card goes (`useHoleNav`), who may change what
 * (`cardRules`), and the pieces on screen (`PlayerRow`, `ScoreGrid`,
 * `SigningPanel`, the sheets).
 */
import { motion, useReducedMotion } from 'motion/react'
import { useId, useMemo, useRef, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { toast } from '../../components/toast'
import { Button, EmptyState } from '../../components/primitives'
import { IconSnake } from '../../components/icons'
import { enqueueSignature, useOutbox, type HoleFields } from '../../data/outbox'
import { RejectedWrites } from '../../components/RejectedWrites'
import { CaptureFromIcon } from '../../components/InstallGuide'
import { HoleConflicts } from '../../components/HoleConflicts'
import { useTournament, type TournamentData } from '../../data/tournamentStore'
import { playOrder } from '../../engine/core/playOrder'
import { netScoreName, stablefordPoints } from '../../engine/core/stableford'
import type { PlayerRound } from '../../engine/core/types'
import type { TournamentState } from '../../engine/computeTournament'
import { mainScoring } from '../../engine/formats'
import type { Group, Round } from '../../engine/types'
import { useTournamentCtx } from './tournamentContext'
import type { Draft } from './tarjetaDrafts'
import { useActiveRound, useMyGroup } from './useMyGroup'
import { cardRules, groupPairs, pairNameIn } from './scorecard/cardRules'
import { CorrectionReasonSheet } from './scorecard/CorrectionReasonSheet'
import { HoleContests } from './scorecard/HoleContests'
import { HoleHeader } from './scorecard/HoleHeader'
import { cardNameIn, isUntouched } from './scorecard/holeEntry'
import { PlayerRow } from './scorecard/PlayerRow'
import { RivalryLines } from './scorecard/RivalryLines'
import { SaveBar } from './scorecard/SaveBar'
import { DefaultsSheet, TiebreakSheet, UnusualSheet } from './scorecard/SaveSheets'
import { ScoreGrid } from './scorecard/ScoreGrid'
import { MarkerSigningPanel, SignSheet, SigningPanel } from './scorecard/SigningPanel'
import { cardSigningMode } from '../../engine/core/cardSigning'
import { useContestPicks } from './scorecard/useContestPicks'
import { useHoleDrafts } from './scorecard/useHoleDrafts'
import { useFollowHole, useHoleNav, useHoleSlide, useHoleSwipe } from './scorecard/useHoleNav'
import { useHoleSave } from './scorecard/useHoleSave'
import { useStableHandlers } from './scorecard/useStable'
import { useViewFocus } from '../../components/viewFocus'
import styles from './ScorecardScreen.module.css'

const S = t.card
/** A round the engine has nothing for yet. */
const NO_ROUND: Record<string, PlayerRound> = {}

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
        <HoleConflicts roundId={null} myPlayerId={me.playerId} />
        <RejectedWrites canResend={me.isComite} playerId={me.playerId} />
      </div>
    )
  }
  if (round.status !== 'live' && !me.isComite) {
    return (
      <div className={styles.screen}>
        <h1>{t.nav.card}</h1>
        <EmptyState title={round.status === 'scheduled' ? S.roundNotLive(round.number) : S.roundFinished(round.number)} body="" />
        {/* A question about a hole another phone saved first outlives the day: «Guardar el mío» then goes to the Comité (REL-08). */}
        <HoleConflicts roundId={round.id} myPlayerId={me.playerId} />
        {/* Holes this phone couldn't send before the day closed: the only place a player sees them (REL-08). */}
        <RejectedWrites canResend={false} playerId={me.playerId} />
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
            {(me.isComite || !me.playerId) && (
              <div className={styles.groupList}>
                {groups.map((g) => (
                  <button key={g.id} type="button" className={styles.groupBtn} onClick={() => setGroupId(g.id)}>
                    <strong>
                      {S.group} {g.number}
                    </strong>
                    <span className="help">{t.common.andList(g.playerIds.map(nameOf))}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <HoleConflicts roundId={round.id} myPlayerId={me.playerId} />
        <RejectedWrites canResend={me.isComite} playerId={me.playerId} />
      </div>
    )
  }
  return <GroupCard key={`${round.id}:${group.id}`} data={data} round={round} group={group} tournamentId={tournamentId} />
}

function GroupCard({ data, round, group, tournamentId }: { data: TournamentData; round: Round; group: Group; tournamentId: string }) {
  const { me } = useTournamentCtx()
  const queueRead = useOutbox((s) => s.queueRead)
  const reduce = useReducedMotion()
  const { snapshot, state, settings } = data
  // A player the boards don't hold (deleted meanwhile) is left out, and a group with nobody left shows an empty card.
  const players = useMemo(
    () =>
      group.playerIds.flatMap((id) => {
        const p = snapshot.players.find((x) => x.id === id)
        return p ? [p] : []
      }),
    [group.playerIds, snapshot.players],
  )
  const playerIds = useMemo(() => players.map((p) => p.id), [players])
  const cardName = useMemo(() => cardNameIn(players), [players])
  const named = useMemo(() => players.map((p) => ({ id: p.id, name: cardName(p) })), [players, cardName])
  const order = useMemo(() => playOrder(group.startHole, round.holes), [group.startHole, round.holes])
  const roundState = state.core.rounds[round.id] ?? NO_ROUND
  const playedOn = (pid: string, h: number) => !!roundState[pid]?.holes[h - 1]?.played
  const threshold = settings.modules.snake.enabled ? settings.modules.snake.puttsThreshold : Infinity
  /** Who carries the snake in this group today, marked on his row (MOT-07). */
  const holderOf = (st: TournamentState) => (settings.modules.snake.enabled ? (st.modules.snake?.groups.find((g) => g.roundId === round.id && g.groupId === group.id)?.holderId ?? null) : null)
  const snakeHolder = holderOf(state)
  const scoring = mainScoring(settings)
  /** Whether anything this tournament plays counts Stableford points (STRAT-03). */
  const pointsCount = scoring === 'points' || settings.modules.bestRound.enabled || settings.modules.pairs.enabled
  const net = scoring !== 'gross'
  const firstOpen = order.find((h) => playerIds.some((id) => !playedOn(id, h))) ?? order[order.length - 1] ?? 1
  const nav = useHoleNav(order, firstOpen)
  const { hole, idx, view } = nav
  /** The card about to be signed: a pair's (its id) or, under a marker's rule, one player's. */
  const [signing, setSigning] = useState<{ pairId: string } | { playerId: string } | null>(null)
  /** One polite live region for the whole card: whose score changed and what it is worth, or the new hole (A11Y-01). */
  const [said, setSaid] = useState('')
  /** «Hoyo 12 guardado», said with the next hole in one message instead of two at once. */
  const savedSaid = useRef('')
  const uid = useId()
  const titleRef = useRef<HTMLSpanElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const holeInfo = (pid: string) => roundState[pid]?.holes[hole - 1]
  /** The row the boards hold for one player on a hole (`{}`: none), as a save names what it saw. */
  const rowOf = (pid: string, h = hole): HoleFields => {
    const s = snapshot.scores.find((x) => x.roundId === round.id && x.playerId === pid && x.hole === h)
    return s ? { strokes: s.strokes, putts: s.putts, picked_up: s.pickedUp } : {}
  }
  const lead = playerIds[0] ? holeInfo(playerIds[0]) : undefined
  const par = lead?.par ?? 4
  const holeSpoken = S.holeSpoken(hole, par, lead?.strokeIndex, lead?.yards)
  /**
   * The badge's words for a draft, shared by the badge and the announcement. Points where something counts them
   * (Stableford, or a points game beside the main event); otherwise the hole on the score the event counts:
   * «birdie neto», «par», «levantó» (STRAT-03). `good`: worth the highlight.
   */
  const ptsText = (h: { par: number; strokesReceived: number }, d: Draft) => {
    const pts = stablefordPoints(h.par, h.strokesReceived, d.pickedUp ? null : d.strokes, d.pickedUp)
    if (pointsCount) return { pts, good: pts >= 3, text: S.ptsLine(pts, d.pickedUp ? null : pts > 0 ? netScoreName(pts) : null) }
    const toPar = d.pickedUp ? null : (net ? d.strokes - h.strokesReceived : d.strokes) - h.par
    return { pts, good: toPar != null && toPar <= -1, text: t.feed.scoreName(toPar, net) }
  }
  const signingMode = cardSigningMode(settings)
  const rules = cardRules({ snapshot, round, playerIds, isComite: me.isComite, perPlayer: signingMode === 'marker' })
  const holeKey = `${round.id}|${group.id}|${hole}`
  const entry = useHoleDrafts({ holeKey, playerIds, holeInfo, holeSpoken, editableFor: rules.editableFor, rowOf, say: setSaid, sayWithNextHole: savedSaid })
  const contests = useContestPicks({ settings, state, holeAwards: snapshot.holeAwards, roundId: round.id, groupId: group.id, hole, players })
  useHoleSlide(hole, reduce, nav.slide, [titleRef, bodyRef])
  const saver = useHoleSave({
    nav,
    order,
    holeKey,
    named,
    holeInfo,
    playedOn,
    par,
    myPlayerId: me.playerId,
    canEdit: rules.canEdit,
    needsReason: rules.needsReason,
    correctsOnServer: rules.correctsOnServer,
    writer: { tournamentId, roundId: round.id, groupId: group.id, playerIds, groupPlayerIds: group.playerIds, myPlayerId: me.playerId, viaServer: rules.correctsOnServer, rowOf, parOf: (pid, h) => roundState[pid]?.holes[h - 1]?.par ?? par, holeOnScreen: hole, awards: contests.awards },
    threshold,
    snakeLabel: settings.modules.snake.label,
    answered: snapshot.snakeTiebreaks.some((tb) => tb.roundId === round.id && tb.groupId === group.id && tb.hole === hole),
    entry,
    say: setSaid,
    sayWithNextHole: savedSaid,
    snakeHolder,
    holderNow: () => {
      const now = useTournament.getState().data
      return now ? holderOf(now.state) : null
    },
  })
  const sheetOpen = saver.asking || !!signing
  useFollowHole({ nav, order, firstOpen, queueRead, touched: entry.touched, sheetOpen, busy: saver.busy })
  const swipe = useHoleSwipe({ active: view === 'hole' && !sheetOpen, idx, count: order.length, goto: nav.goto, reduce })
  // The hole and the grid swap in place, and an arrow goes disabled under the finger at the first or last hole.
  // When focus went with them (A11Y-12): from a dead arrow to the other one (the new hole is said already), else to
  // the new view's heading, the hole's sentence or the grid's name.
  const cardRef = useRef<HTMLDivElement>(null)
  useViewFocus(`${view}:${hole}`, () => {
    const root = cardRef.current
    const dead = document.activeElement
    if (root && dead instanceof HTMLButtonElement && dead.disabled && root.contains(dead)) {
      const other = dead.parentElement?.querySelector<HTMLButtonElement>(':scope > button:not([disabled])')
      if (other) return other
    }
    return root?.querySelector('[data-view-heading]')
  })

  async function sign(card: { pairId: string } | { playerId: string }) {
    setSigning(null)
    await enqueueSignature(tournamentId, 'pairId' in card ? { round_id: round.id, pair_id: card.pairId, signed_by: me.playerId } : { round_id: round.id, player_id: card.playerId, signed_by: me.playerId })
    toast(S.signed)
  }
  const on = useStableHandlers({
    draft: (pid: string, patch: Partial<Draft>) => {
      entry.change(pid, patch)
      const h = holeInfo(pid)
      const p = players.find((x) => x.id === pid)
      const d = entry.drafts[pid]
      if (h && p && d) {
        const next = { ...d, ...patch }
        setSaid(S.said(cardName(p), next.strokes, next.putts, next.pickedUp, `${ptsText(h, next).text}${h.par !== par ? `, ${S.parHere(h.par)}` : ''}`))
      }
    },
    prev: () => nav.goto(idx - 1),
    next: () => nav.goto(idx + 1),
    save: () => void saver.save(),
    undo: () => saver.undoLast(),
    openHole: (h: number) => nav.openFromGrid(h),
    answer: (lastHoled: string | undefined) => void saver.commit(lastHoled, saver.tiebreak?.confirmedPar),
    closeTiebreak: () => saver.setTiebreak(null),
    backFromDefaults: () => saver.setConfirmDefaults(false),
    allPar: () => void saver.save(true, true),
    fixUnusual: () => saver.setConfirmWeird(null),
    saveUnusual: () => void saver.save(true),
    closeReason: () => saver.setAskReason(false),
    saveWithReason: () => void saver.save(true),
    closeSign: () => setSigning(null),
    signPair: (pairId: string) => setSigning({ pairId }),
    signPlayer: (playerId: string) => setSigning({ playerId }),
    sign: () => {
      if (signing) void sign(signing)
    },
  })

  const initial = entry.initial()
  const pairsOn = settings.modules.pairs.enabled
  const { myPair, rivalPair } = groupPairs(snapshot.pairs, group.playerIds, me.playerId)
  const pairName = pairNameIn(snapshot.players)
  const signingPair = signing && 'pairId' in signing ? snapshot.pairs.find((p) => p.id === signing.pairId) : undefined
  const signingName = signing && 'playerId' in signing ? named.find((x) => x.id === signing.playerId)?.name : undefined
  const complete = players.every((p) => roundState[p.id]?.complete)
  // Under a marker's rule each card is signed as soon as it is complete (UX-23): a player who stops early never holds the rest back.
  const completeNamed = useMemo(() => named.filter((x) => roundState[x.id]?.complete), [named, roundState])
  const locked = rules.canEdit ? null : rules.anySigned ? S.lockedSigned : round.status === 'scheduled' ? S.roundNotLive(round.number) : S.roundFinished(round.number)

  return (
    <div ref={cardRef} className={styles.screen} {...swipe.handlers}>
      <div className={styles.top}>
        <div className={styles.topText}>
          <span className={styles.topMain}>{S.groupLine(round.number, group.number)}</span>
          {pairsOn && rivalPair && <span>{S.keeping(pairName(rivalPair))}</span>}
          <RivalryLines tournamentId={tournamentId} group={group} />
        </div>
        <Button variant="ghost" size="sm" onClick={() => nav.setView(view === 'hole' ? 'grid' : 'hole')}>
          {view === 'hole' ? S.grid : S.holeView}
        </Button>
      </div>

      {view === 'grid' ? (
        <>
          <ScoreGrid named={named} roundState={roundState} order={order} hole={hole} pointsCount={pointsCount} net={net} onOpen={on.openHole} savedNote={saver.savedNote} onUndo={on.undo} />
          <HoleConflicts roundId={round.id} myPlayerId={me.playerId} />
          <RejectedWrites canResend={me.isComite} playerId={me.playerId} />
          {signingMode === 'pairs' && pairsOn && complete && (
            <SigningPanel roundId={round.id} groupPlayerIds={group.playerIds} pairs={snapshot.pairs} signatures={snapshot.cardSignatures} players={snapshot.players} myPairId={myPair?.id ?? null} isComite={me.isComite} onSign={on.signPair} />
          )}
          {signingMode === 'marker' && (
            <MarkerSigningPanel
              roundId={round.id}
              players={completeNamed}
              signatures={snapshot.cardSignatures}
              pairs={snapshot.pairs}
              myPlayerId={me.playerId}
              inGroup={!!me.playerId && group.playerIds.includes(me.playerId)}
              isComite={me.isComite}
              onSign={on.signPlayer}
            />
          )}
        </>
      ) : (
        <>
          <HoleHeader hole={hole} par={par} strokeIndex={lead?.strokeIndex} yards={lead?.yards} spoken={holeSpoken} canPrev={idx > 0} canNext={idx < order.length - 1} onPrev={on.prev} onNext={on.next} dragX={swipe.dragX} titleRef={titleRef} />
          {/* The snake changed hands with this save (MOT-07); the screen reader hears it with the saved hole. */}
          {saver.snakeNote && (
            <p className={styles.snakeNote} aria-hidden="true">
              <IconSnake size={18} />
              {S.snakePasses(saver.snakeNote, settings.modules.snake.label)}
            </p>
          )}
          {entry.restoredCount > 0 && <p className={styles.restoredNote}>{S.restoredDraft}</p>}
          <HoleConflicts roundId={round.id} myPlayerId={me.playerId} />
          <motion.div className={styles.swipeArea} style={{ x: swipe.dragX }}>
            <div ref={bodyRef} className={styles.players}>
              {/* Which number is which, over the steppers' own columns (COPY-18); each stepper keeps its full name for a screen reader. */}
              <div className={`${styles.controls} ${styles.colHeads}`} aria-hidden="true">
                <span>{S.strokes}</span>
                <span>{S.putts}</span>
                <span className={`${styles.pickup} ${styles.colHeadPad}`}>{S.pickedUp}</span>
              </div>
              {named.map(({ id, name }) => {
                const d = entry.drafts[id]
                const h = holeInfo(id)
                if (!d || !h) return null
                const { good, text } = ptsText(h, d)
                // Nobody has changed him on a hole he hasn't played: the default is no score of his, so the badge
                // names none. It said «3 pts, birdie neto» for anyone with a stroke on the hole (COPY-10).
                const untouched = isUntouched(h, initial[id], d)
                return (
                  <PlayerRow
                    key={id}
                    id={id}
                    name={name}
                    labelId={`${uid}-${id}`}
                    draft={d}
                    hole={h}
                    parOnScreen={par}
                    locked={rules.lockedFor(id)}
                    untouched={untouched}
                    ptsLine={untouched ? S.notCaptured : text}
                    good={!untouched && good}
                    holdsSnake={snakeHolder === id}
                    snakeLabel={settings.modules.snake.label}
                    snakeLayoutId={`tarjeta-snake-${group.id}`}
                    onDraft={on.draft}
                  />
                )
              })}
            </div>
          </motion.div>
          {contests.contests.length > 0 && <HoleContests contests={contests.contests} pickOf={contests.pickOf} picks={contests.picks} canEdit={rules.canEdit} nameOf={cardName} onToggle={contests.togglePick} />}
          <SaveBar
            label={idx === order.length - 1 ? S.saveLast : S.save}
            busy={saver.busy}
            disabled={saver.busy || !rules.canEdit || !queueRead}
            justSaved={saver.justSaved}
            onSave={on.save}
            locked={locked}
            savedNote={saver.savedNote}
            onUndo={on.undo}
          />
          {/* An iPhone's browser keeps its own holes, apart from the installed app's (PWA-09). */}
          <CaptureFromIcon />
          <RejectedWrites canResend={me.isComite} playerId={me.playerId} />
        </>
      )}

      <TiebreakSheet candidates={saver.tiebreak?.candidates ?? null} named={named} threshold={threshold} game={settings.modules.snake.label} busy={saver.busy} onAnswer={on.answer} onClose={on.closeTiebreak} />
      <DefaultsSheet open={saver.confirmDefaults} hole={hole} onBack={on.backFromDefaults} onConfirm={on.allPar} />
      <UnusualSheet lines={saver.confirmWeird} onFix={on.fixUnusual} onConfirm={on.saveUnusual} />
      <CorrectionReasonSheet open={saver.askReason} reason={saver.reason} onReason={saver.setReason} busy={saver.busy} onClose={on.closeReason} onSave={on.saveWithReason} />
      <SignSheet
        open={!!signing}
        title={signingPair ? S.signTitle(pairName(signingPair)) : signingName ? S.signPlayer(signingName) : undefined}
        confirm={signingName ? S.signPlayerConfirm : undefined}
        onClose={on.closeSign}
        onSign={on.sign}
      />

      {/* Last in the card, so reading it from the top meets the group before the last announcement. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </p>
    </div>
  )
}
