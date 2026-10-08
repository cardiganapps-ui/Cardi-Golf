/**
 * Tarjeta (§9.3): the whole group on one screen per hole, huge numerals,
 * par by default, save and move on; undo instead of confirmation. The grid
 * view is the classic card with pencil notation. Writes go through the
 * outbox, so it works without signal.
 */
import confetti from 'canvas-confetti'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { t } from '../../i18n/es-MX'
import { Sheet, toast } from '../../components/ui'
import { EmptyState, ScoreMark, Stepper, markFor } from '../../components/primitives'
import { IconAlert, IconChevronLeft, IconChevronRight, IconLock } from '../../components/icons'
import { useOnline } from '../../components/OfflineBanner'
import { adminSaveScore } from '../../data/api'
import { hasStoredSession, useAuth } from '../../data/auth'
import { roundRivalries, type RoundRivalry } from '../../data/quick'
import { enqueueAward, enqueueScore, enqueueSignature, enqueueTiebreak, useOutbox } from '../../data/outbox'
import { CONTEST_SINGLE, type ContestState } from '../../engine/games/contest'
import { RejectedWrites } from '../../components/RejectedWrites'
import { useTournament } from '../../data/tournamentStore'
import { playOrder } from '../../engine/core/playOrder'
import { netScoreName, stablefordPoints } from '../../engine/core/stableford'
import type { Group, Round } from '../../engine/types'
import { motion } from 'motion/react'
import { easeSlow } from '../../design/motion'
import { celebrationColors } from '../../lib/tokens'
import { humanError } from '../../lib/humanError'
import { useTournamentCtx } from './TournamentGate'
import { readKept, sweepKept, writeKept, type Draft, type KeptDraft } from './tarjetaDrafts'
import { useActiveRound, useMyGroup } from './useMyGroup'
import styles from './ScorecardScreen.module.css'

const S = t.card

/** Taps on «Guardar hoyo» this soon after the hole changed are ignored: a double tap must not save the next hole (UX-02). */
const SETTLE_MS = 700
/** A save of untouched defaults this soon after the last save asks first. */
const DOUBLE_SAVE_MS = 3000
/** How long the last save stays in the save bar with its «Corregir». */
const SAVED_NOTE_MS = 6000

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
        <RejectedWrites canResend={me.isAdmin} playerId={me.playerId} />
      </div>
    )
  }
  if (round.status !== 'live' && !me.isAdmin) {
    return (
      <div className={styles.screen}>
        <h1>{t.nav.card}</h1>
        <EmptyState title={round.status === 'scheduled' ? S.roundNotLive(round.number) : S.roundFinished(round.number)} body="" />
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
            {(me.isAdmin || !me.playerId) && (
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
        <RejectedWrites canResend={me.isAdmin} playerId={me.playerId} />
      </div>
    )
  }
  return <GroupCard key={`${round.id}:${group.id}`} round={round} group={group} tournamentId={tournamentId} />
}

/** My sliding-stroke rivalries with others in this group (0016), one line each. Accounts only. */
function RivalryLines({ tournamentId, group }: { tournamentId: string; group: Group }) {
  const { me } = useTournamentCtx()
  const players = useTournament((s) => s.data?.snapshot.players)
  const [list, setList] = useState<RoundRivalry[]>([])
  const eligible = me.via === 'profile' && !tournamentId.startsWith('fixture:')
  useEffect(() => {
    if (!eligible) return
    let live = true
    roundRivalries(tournamentId)
      .then((r) => live && setList(r))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [eligible, tournamentId])
  const shown = list.filter((r) => group.playerIds.includes(r.myPlayerId) && group.playerIds.includes(r.theirPlayerId))
  if (!shown.length) return null
  return (
    <>
      {shown.map((r) => (
        <span key={r.theirPlayerId}>{t.quick.rivalryLine(players?.find((p) => p.id === r.theirPlayerId)?.displayName ?? '', r.myStrokes)}</span>
      ))}
    </>
  )
}

function GroupCard({ round, group, tournamentId }: { round: Round; group: Group; tournamentId: string }) {
  const data = useTournament((s) => s.data)!
  const { me } = useTournamentCtx()
  const pending = useOutbox((s) => s.pending)
  const pendingHoles = useOutbox((s) => s.pendingHoles)
  const heldHoles = useOutbox((s) => s.heldHoles)
  const lastError = useOutbox((s) => s.lastError)
  const rejected = useOutbox((s) => s.rejected)
  const signedOut = useAuth((s) => !s.user)
  const online = useOnline()
  const { snapshot, state, settings } = data
  const players = group.playerIds.map((id) => snapshot.players.find((p) => p.id === id)!).filter(Boolean)
  /** The name the card uses: the short one, or the full one when two in the group share it (two «Diego»s would be four identical controls again). */
  const cardName = (p: { id: string; displayName: string; fullName: string }) => (players.some((o) => o.id !== p.id && o.displayName === p.displayName) ? p.fullName : p.displayName)
  const order = useMemo(() => playOrder(group.startHole, round.holes), [group.startHole, round.holes])
  const roundState = state.core.rounds[round.id] ?? {}
  const threshold = settings.modules.snake.enabled ? settings.modules.snake.puttsThreshold : Infinity

  // Start on the first hole the group has not completed — or on the one the
  // En vivo shortcut asked for, so that tap lands where it said it would.
  const firstOpen = order.find((h) => players.some((p) => !roundState[p.id]?.holes[h - 1]?.played)) ?? order[order.length - 1]!
  const asked = Number(new URLSearchParams(window.location.search).get('hoyo'))
  const [hole, setHole] = useState<number>(order.includes(asked) ? asked : firstOpen)
  const [view, setView] = useState<'hole' | 'grid'>('hole')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [tiebreak, setTiebreak] = useState<{ candidates: string[] } | null>(null)
  const [confirmWeird, setConfirmWeird] = useState<string[] | null>(null)
  const [signing, setSigning] = useState<string | null>(null)
  const [askReason, setAskReason] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDefaults, setConfirmDefaults] = useState(false)
  const touch = useRef<{ x: number; y: number } | null>(null)
  /** The saved values of the hole before the last save, for a real undo. */
  const undo = useRef<{ hole: number; drafts: Record<string, Draft>; wasPlayed: Record<string, boolean> } | null>(null)
  /** Players whose steppers were changed on this hole: only they, and players the server has nothing for, are written (REL-05). */
  const touched = useRef<Set<string>>(new Set())
  /** When the hole on screen last changed, and when the last save went out: a second tap must not save the next hole (UX-02). */
  const settledAt = useRef(0)
  const lastSaveAt = useRef(-Infinity)
  /** The last save, shown in the save bar instead of a toast over «Guardar hoyo» (PWA-01). */
  const [savedNote, setSavedNote] = useState<{ hole: number; idx: number; canUndo: boolean; restored?: boolean } | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(savedTimer.current), [])
  const showSaved = (note: NonNullable<typeof savedNote>) => {
    clearTimeout(savedTimer.current)
    setSavedNote(note)
    savedTimer.current = setTimeout(() => setSavedNote(null), SAVED_NOTE_MS)
  }
  const sheetOpen = !!tiebreak || !!confirmWeird || !!signing || askReason || confirmDefaults
  /** One polite live region for the whole card: whose score changed and what it is worth, or the new hole (A11Y-01). */
  const [said, setSaid] = useState('')
  /** «Hoyo 12 guardado», said with the next hole in one message instead of two at once. */
  const savedSaid = useRef('')
  const uid = useId()

  const holeInfo = (pid: string) => roundState[pid]?.holes[hole - 1]
  const lead = holeInfo(players[0]!.id)
  const par = lead?.par ?? 4
  const holeSpoken = S.holeSpoken(hole, par, lead?.strokeIndex, lead?.yards)
  /** The points badge's words for a draft, shared by the badge and the announcement. */
  const ptsText = (h: { par: number; strokesReceived: number }, d: Draft) => {
    const pts = stablefordPoints(h.par, h.strokesReceived, d.pickedUp ? null : d.strokes, d.pickedUp)
    return { pts, text: S.ptsLine(pts, d.pickedUp ? null : pts > 0 ? netScoreName(pts) : null) }
  }

  // Latest players, hole data and drafts for the effect below: it runs when the hole
  // changes or the server's values for it do, never on a keystroke.
  const latest = useRef({ players, holeInfo, drafts, holeSpoken, editableFor })
  useEffect(() => {
    latest.current = { players, holeInfo, drafts, holeSpoken, editableFor }
  })
  /** What the server had for each player when he was first touched or restored on this hole: the kept draft's baseline. */
  const baselines = useRef(new Map<string, string>())
  /** Players whose kept draft was restored and not touched since: newer server values replace it. */
  const restored = useRef(new Set<string>())
  /** Players whose restored value is on screen, touched or not: «falta guardarlo» shows until the hole is saved. */
  const restoredShown = useRef(new Set<string>())
  const [restoredCount, setRestoredCount] = useState(0)
  useEffect(sweepKept, [])
  /** What the server has for one player on the open hole. */
  const serverOf = (pid: string) => {
    const h = holeInfo(pid)
    return h?.played ? `${h.gross}:${h.putts}:${h.pickedUp}` : '-'
  }
  /** What the server has for each player on the open hole; changes when a save lands, from this phone or another. */
  const serverKey = players.map((p) => `${p.id}:${serverOf(p.id)}`).join('|')
  const holeKey = `${round.id}|${group.id}|${hole}`
  const shownHole = useRef('')
  useEffect(() => {
    const { players, holeInfo, drafts: current, holeSpoken, editableFor } = latest.current
    const serverNow = (pid: string) => {
      const h = holeInfo(pid)
      return h?.played ? `${h.gross}:${h.putts}:${h.pickedUp}` : '-'
    }
    const saved = (p: { id: string }): Draft | null => {
      const h = holeInfo(p.id)
      return h?.played ? { strokes: h.gross ?? h.par, putts: h.putts ?? 2, pickedUp: h.pickedUp } : null
    }
    if (shownHole.current !== holeKey) {
      // A new hole: saved values or defaults (par, 2 putts), nothing touched yet.
      // A screen reader hears where it landed; the first hole is the page itself.
      if (shownHole.current) setSaid([savedSaid.current, holeSpoken].filter(Boolean).join('. '))
      savedSaid.current = ''
      shownHole.current = holeKey
      touched.current = new Set()
      baselines.current = new Map()
      restored.current = new Set()
      restoredShown.current = new Set()
      settledAt.current = performance.now()
      const next: Record<string, Draft> = {}
      for (const p of players) next[p.id] = saved(p) ?? { strokes: holeInfo(p.id)?.par ?? 4, putts: 2, pickedUp: false }
      initialDrafts.current = JSON.stringify(next)
      // What was typed here and not saved yet comes back, unless the server has moved on for that player or the card can't be edited.
      const kept = readKept(holeKey)
      for (const p of players) {
        const k = kept?.players[p.id]
        if (!k || k.server !== serverNow(p.id) || !editableFor(p.id)) continue
        next[p.id] = k.draft
        touched.current.add(p.id)
        baselines.current.set(p.id, k.server)
        restored.current.add(p.id)
        restoredShown.current.add(p.id)
      }
      setRestoredCount(restoredShown.current.size)
      setDrafts(next)
      return
    }
    // Same hole, new values on the server: the other phone saved. Take them into
    // every player nobody here has touched, so a save from this phone never
    // writes a default over them (REL-05). What was typed here stays.
    let next: Record<string, Draft> | null = null
    const baseline = (JSON.parse(initialDrafts.current || '{}') as Record<string, Draft>) ?? {}
    // A restored draft nobody has touched since gives way to a newer save (a stale snapshot at open, then the fresh one).
    for (const pid of [...restored.current]) {
      if (serverNow(pid) === baselines.current.get(pid)) continue
      restored.current.delete(pid)
      restoredShown.current.delete(pid)
      touched.current.delete(pid)
      baselines.current.delete(pid)
    }
    setRestoredCount(restoredShown.current.size)
    for (const p of players) {
      const v = saved(p)
      const d = current[p.id]
      if (!v || touched.current.has(p.id) || (d && d.strokes === v.strokes && d.putts === v.putts && d.pickedUp === v.pickedUp)) continue
      next = { ...(next ?? current), [p.id]: v }
      baseline[p.id] = v
    }
    if (next) {
      setDrafts(next)
      initialDrafts.current = JSON.stringify(baseline)
    }
  }, [holeKey, serverKey])
  // Keep what was typed on this hole, for the players touched here (PWA-05).
  useEffect(() => {
    if (!shownHole.current) return
    const keep: KeptDraft['players'] = {}
    for (const pid of touched.current) if (drafts[pid]) keep[pid] = { draft: drafts[pid]!, server: baselines.current.get(pid) ?? serverOf(pid) }
    writeKept(shownHole.current, keep)
  }, [drafts]) // eslint-disable-line react-hooks/exhaustive-deps -- written when the drafts change, with the server values of that moment
  // An unsaved hole defers the "new version" reload offer (main.tsx).
  const initialDrafts = useRef('')
  useEffect(() => {
    useOutbox.setState({ editing: JSON.stringify(drafts) !== initialDrafts.current })
  }, [drafts])
  useEffect(() => () => useOutbox.setState({ editing: false }), [])

  // Hole contests on this hole (closest to the pin, greenies...): the group's pick, saved with the hole.
  const contests = useMemo(
    () =>
      settings.games.flatMap((g) => {
        if (g.type !== 'contest' || !g.enabled) return []
        const gs = state.games[g.id]
        const onHole = (gs?.state as ContestState | undefined)?.holes.some((h) => h.roundId === round.id && h.hole === hole)
        if (!gs || !onHole) return []
        const eligible = players.filter((p) => gs.entrants.includes(p.id))
        return eligible.length ? [{ id: g.id, label: g.label, kind: g.options.kind, single: CONTEST_SINGLE[g.options.kind], eligible }] : []
      }),
    [settings.games, state.games, round.id, hole, players],
  )
  const savedPicks = (gameId: string) => snapshot.holeAwards.filter((a) => a.roundId === round.id && a.gameId === gameId && a.hole === hole && a.groupId === group.id).map((a) => a.playerId)
  const [picks, setPicks] = useState<Record<string, string[] | undefined>>({})
  useEffect(() => setPicks({}), [hole, round.id, group.id])
  const pickOf = (gameId: string) => picks[gameId] ?? savedPicks(gameId)
  const togglePick = (c: (typeof contests)[number], pid: string | null) =>
    setPicks((cur) => {
      const now = cur[c.id] ?? savedPicks(c.id)
      const next = pid === null ? [] : c.single ? (now.includes(pid) ? [] : [pid]) : now.includes(pid) ? now.filter((x) => x !== pid) : [...now, pid]
      return { ...cur, [c.id]: next }
    })

  const setDraft = (pid: string, patch: Partial<Draft>) => {
    // Its baseline is what the server has now, the first time; a restored draft touched again is a live edit.
    if (!baselines.current.has(pid)) baselines.current.set(pid, serverOf(pid))
    // Touched again, it is a live edit; the note stays until the hole is saved.
    restored.current.delete(pid)
    touched.current.add(pid)
    setDrafts((d) => ({ ...d, [pid]: { ...d[pid]!, ...patch } }))
    const h = holeInfo(pid)
    const p = players.find((x) => x.id === pid)
    if (h && p && drafts[pid]) {
      const next = { ...drafts[pid], ...patch }
      setSaid(S.said(cardName(p), next.strokes, next.putts, next.pickedUp, `${ptsText(h, next).text}${h.par !== par ? `, ${S.parHere(h.par)}` : ''}`))
    }
  }

  const idx = order.indexOf(hole)
  const goto = (i: number) => {
    if (i < 0 || i >= order.length) return
    setHole(order[i]!)
  }

  const pairsOn = settings.modules.pairs.enabled
  const myPair = me.playerId ? snapshot.pairs.find((p) => p.player1Id === me.playerId || p.player2Id === me.playerId) : null
  const rivalPair = myPair ? snapshot.pairs.find((p) => p.id !== myPair.id && [p.player1Id, p.player2Id].every((id) => group.playerIds.includes(id))) : null
  const pairName = (p: { name: string | null; player1Id: string; player2Id: string }) =>
    p.name ?? t.common.andList([p.player1Id, p.player2Id].map((id) => snapshot.players.find((x) => x.id === id)?.displayName ?? '?'))

  const signed = (pid: string) => {
    const pair = snapshot.pairs.find((p) => p.player1Id === pid || p.player2Id === pid)
    return !!pair && snapshot.cardSignatures.some((s) => s.roundId === round.id && s.pairId === pair.id)
  }
  const anySigned = players.some((p) => signed(p.id))
  const canEdit = me.isAdmin || (round.status === 'live' && !anySigned)
  /** Whether this phone may change this player's hole now (a kept draft is restored only then). */
  function editableFor(pid: string) {
    return canEdit && !(signed(pid) && !me.isAdmin)
  }
  /** A Comité correction on a signed card needs a reason (§7); it is written through the server RPC, not the outbox. */
  const needsReason = me.isAdmin && anySigned
  /** Untouched defaults on an unplayed hole: the points badge stays quiet (P2). */
  const initialDraft = (pid: string): Draft | null => {
    try {
      return (JSON.parse(initialDrafts.current || '{}') as Record<string, Draft>)[pid] ?? null
    } catch {
      return null
    }
  }

  function validate(): string[] {
    const weird: string[] = []
    for (const p of players) {
      const d = drafts[p.id]!
      if (d.pickedUp) continue
      if (d.strokes >= 10) weird.push(`${cardName(p)}: ${d.strokes} ${S.strokes.toLowerCase()}`)
      if (d.putts >= 5) weird.push(`${cardName(p)}: ${d.putts} ${S.putts.toLowerCase()}`)
    }
    return weird
  }

  async function save(force = false) {
    if (!canEdit || busy) return
    if (!force) {
      // A second tap right after the hole changed is the first tap again, not a save of this hole.
      if (performance.now() - settledAt.current < SETTLE_MS) return
      // Nothing touched on a hole nobody has played, seconds after the last save: a double tap, or did all four make par?
      const allDefaults = players.every((p) => !touched.current.has(p.id) && !holeInfo(p.id)?.played)
      if (allDefaults && performance.now() - lastSaveAt.current < DOUBLE_SAVE_MS) {
        setConfirmDefaults(true)
        return
      }
      const weird = validate()
      if (weird.length) {
        setConfirmWeird(weird)
        return
      }
    }
    setConfirmWeird(null)
    setConfirmDefaults(false)
    if (needsReason && reason.trim().length < 3) {
      setAskReason(true)
      return
    }
    // Snake tiebreak: 2+ players at the threshold on this hole and no answer yet. The hole saves
    // only with the answer (its buttons commit). The reason sheet of a correction on a signed card
    // gives way first: the question used to open underneath it, and a second «Guardar» saved
    // the hole without the answer.
    const candidates = players.filter((p) => drafts[p.id]!.putts >= threshold).map((p) => p.id)
    const answered = snapshot.snakeTiebreaks.some((tb) => tb.roundId === round.id && tb.groupId === group.id && tb.hole === hole)
    if (candidates.length >= 2 && !answered) {
      setAskReason(false)
      setTiebreak({ candidates })
      return
    }
    await commit()
  }

  /** Writes the players in `values` and nobody else: a player left out keeps what the server has. */
  async function writeHole(values: Record<string, Draft>, holeNumber: number, lastHoled?: string) {
    for (const p of players) {
      const d = values[p.id]
      if (!d) continue
      const payload = { round_id: round.id, player_id: p.id, hole: holeNumber, strokes: d.pickedUp ? null : d.strokes, putts: d.putts, picked_up: d.pickedUp }
      // A Comité correction where a phone's write is refused (a round not live, a signed card, 0026): the server RPC, as Comité › Tarjetas does.
      if (me.isAdmin && (round.status !== 'live' || signed(p.id))) await adminSaveScore(payload, reason.trim() || null)
      else await enqueueScore(tournamentId, { ...payload, entered_by: me.playerId, client_ts: new Date().toISOString() })
    }
    for (const c of contests) {
      const chosen = picks[c.id]
      if (chosen && holeNumber === hole) await enqueueAward(tournamentId, { round_id: round.id, group_id: group.id, hole: holeNumber, game_id: c.id, player_ids: chosen, decided_by: me.playerId })
    }
    if (lastHoled) {
      await enqueueTiebreak(tournamentId, { round_id: round.id, group_id: group.id, hole: holeNumber, last_holed_player_id: lastHoled, decided_by: me.playerId })
    }
  }

  async function commit(lastHoled?: string) {
    setBusy(true)
    setAskReason(false)
    const savedHole = hole
    const savedIdx = idx
    try {
      let celebrate = false
      const before: Record<string, Draft> = {}
      const wasPlayed: Record<string, boolean> = {}
      // Only what this phone means to write: the players touched here, and the
      // ones the server has nothing for yet (that is how an all-par hole stays
      // one tap). A player the other phone already saved is left alone (REL-05).
      const writes: Record<string, Draft> = {}
      for (const p of players) {
        if (touched.current.has(p.id) || !holeInfo(p.id)?.played) writes[p.id] = drafts[p.id]!
      }
      for (const p of players) {
        const d = writes[p.id]
        if (!d) continue
        const h = holeInfo(p.id)
        const sr = h?.strokesReceived ?? 0
        const pts = stablefordPoints(h?.par ?? par, sr, d.pickedUp ? null : d.strokes, d.pickedUp)
        if (!d.pickedUp && pts >= 3 && p.id === me.playerId) celebrate = true
        wasPlayed[p.id] = !!h?.played
        before[p.id] = h?.played ? { strokes: h.gross ?? h.par, putts: h.putts ?? 2, pickedUp: h.pickedUp } : d
      }
      await writeHole(writes, hole, lastHoled)
      // Saved (in the outbox): nothing left to keep for this hole, and the save is the hole's new
      // starting point. The last hole stays on screen after its save: a correction made there is
      // kept against the save, and a later save writes only what was touched after it.
      writeKept(holeKey, {})
      restored.current.clear()
      restoredShown.current.clear()
      setRestoredCount(0)
      touched.current = new Set()
      baselines.current = new Map()
      initialDrafts.current = JSON.stringify(drafts)
      useOutbox.setState({ editing: false })
      undo.current = { hole: savedHole, drafts: before, wasPlayed }
      lastSaveAt.current = performance.now()
      setTiebreak(null)
      if (celebrate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: celebrationColors() })
      }
      // Move on, and offer the way back instead of asking first: a real undo when the hole
      // already had values (they are written back), "Corregir" when it was new. It lives in
      // the save bar: a toast there sat on «Guardar hoyo» and ate the next tap (PWA-01).
      const written = Object.keys(writes)
      showSaved({ hole: savedHole, idx: savedIdx, canUndo: written.length > 0 && written.every((id) => wasPlayed[id]) })
      if (savedIdx < order.length - 1) {
        savedSaid.current = S.savedHole(savedHole)
        goto(savedIdx + 1)
      } else {
        setSaid(S.savedHole(savedHole))
        setView('grid')
      }
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  async function sign(pairId: string) {
    setSigning(null)
    await enqueueSignature(tournamentId, { round_id: round.id, pair_id: pairId, signed_by: me.playerId })
    toast(S.signed)
  }

  function undoLast() {
    const note = savedNote
    if (!note || note.restored) return
    setSavedNote(null)
    const u = undo.current
    if (note.canUndo && u && u.hole === note.hole) {
      undo.current = null
      void writeHole(u.drafts, u.hole).then(() => {
        showSaved({ hole: u.hole, idx: note.idx, canUndo: false, restored: true })
        setSaid(S.restoredHole(u.hole))
      })
    }
    setView('hole')
    goto(note.idx)
  }

  const complete = players.every((p) => roundState[p.id]?.complete)
  const missing = (pid: string) => order.filter((h) => !roundState[pid]?.holes[h - 1]?.played)
  // Holes, not rows: «3 hoyos por subir» is what a player can act on (REL-17). Offline too.
  // Holes saved after the phone lost its session (auth-js signed it out
  // mid-round) wait for the player to enter again: say so, not only «por
  // subir» (REL-16). A stored session still being confirmed needs no PIN.
  const needsPin = heldHoles > 0 && signedOut && !hasStoredSession()
  const waiting = needsPin ? t.sync.heldForPinShort(heldHoles) : pendingHoles > 0 ? t.sync.pendingHoles(pendingHoles) : pending > 0 ? t.sync.pending(pending) : null
  const offlineText = pendingHoles > 0 ? t.sync.offlineHoles(pendingHoles) : t.sync.offlineShort
  const syncText = !online ? offlineText : rejected.length ? t.sync.rejected(rejected.length) : lastError ? lastError : (waiting ?? t.sync.synced)
  const syncWarn = !online || !!lastError || pending > 0 || rejected.length > 0
  /** The sync state in a few words, for the one-line saved note (a long error waits until the note goes). */
  const syncShort = !online ? offlineText : rejected.length ? t.sync.rejected(rejected.length) : waiting
  /** The line under «Guardar hoyo»: the last save with its way back for a few seconds, else the sync state. */
  const statusLine = (fallback: ReactNode) =>
    savedNote ? (
      <span className={styles.savedLine}>
        <span>{savedNote.restored ? S.restoredHole(savedNote.hole) : S.savedHole(savedNote.hole)}</span>
        {!savedNote.restored && (
          <button type="button" className={styles.savedAction} onClick={undoLast}>
            {savedNote.canUndo ? t.common.undo : S.correct}
          </button>
        )}
        {syncShort && <span className={`${styles.savedSync} ${styles.saveStatusWarn}`}>{syncShort}</span>}
      </span>
    ) : (
      fallback
    )

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
      <td>
        {label}
        <span className={styles.subCaption}>{S.ptsGrossCaption}</span>
      </td>
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
        // A drag inside a sheet must never change the hole under it.
        if (!touch.current || view !== 'hole' || sheetOpen) {
          touch.current = null
          return
        }
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
          <RivalryLines tournamentId={tournamentId} group={group} />
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
                    <th key={p.id}>{cardName(p)}</th>
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
            {statusLine(<span className={`${styles.saveStatus} ${syncWarn ? styles.saveStatusWarn : ''}`}>{syncText}</span>)}
            {players.some((p) => missing(p.id).length > 0) && <span className="help">{S.missingHoles}</span>}
            {players.some((p) => roundState[p.id]?.holes.some((h) => h.disputed)) && <span className="help">{S.disputedHint}</span>}
          </div>
          <RejectedWrites canResend={me.isAdmin} playerId={me.playerId} />
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
                      {/* A signed card is the one irreversible thing a player
                          does all day. It should feel like it: the stamp a
                          referee's desk would put on it. */}
                      {isSigned && (
                        <motion.span
                          className={styles.stamp}
                          aria-hidden="true"
                          initial={{ scale: 1.25, opacity: 0, rotate: -14 }}
                          animate={{ scale: 1, opacity: 1, rotate: -8 }}
                          transition={easeSlow}
                        >
                          {S.stamp}
                        </motion.span>
                      )}
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
            <h1 className={styles.holeTitle}>
              <span className="sr-only">{holeSpoken}</span>
              <span className={styles.holeNum} aria-hidden="true">
                {hole}
              </span>
              <span className={styles.holeMeta} aria-hidden="true">
                {t.player.par} {par}, {t.player.si} {lead?.strokeIndex ?? '–'}
                {lead?.yards ? `, ${t.player.yards(lead.yards)}` : ''}
              </span>
            </h1>
            <button className={styles.holeNav} type="button" onClick={() => goto(idx + 1)} disabled={idx === order.length - 1} aria-label={S.next}>
              <IconChevronRight />
            </button>
          </header>

          {restoredCount > 0 && <p className={styles.restoredNote}>{S.restoredDraft}</p>}
          <div className={styles.players}>
            {players.map((p) => {
              const d = drafts[p.id]
              const h = holeInfo(p.id)
              if (!d || !h) return null
              const { pts, text: ptsLine } = ptsText(h, d)
              const locked = signed(p.id) && !me.isAdmin
              const init = initialDraft(p.id)
              const untouched = !h.played && !!init && init.strokes === d.strokes && init.putts === d.putts && init.pickedUp === d.pickedUp
              return (
                <div key={p.id} className={`${styles.player} ${locked ? styles.locked : ''}`} role="group" aria-labelledby={`${uid}-${p.id}`}>
                  <div className={styles.playerLine}>
                    <span className={styles.playerName}>
                      <span className={styles.playerNameText} id={`${uid}-${p.id}`}>
                        {cardName(p)}
                      </span>
                      {locked && (
                        <span className={styles.lockMark} aria-label={S.cardSigned}>
                          <IconLock size={14} />
                        </span>
                      )}
                      {h.strokesReceived > 0 && (
                        <span className={styles.dots} aria-label={t.admin.players.strokesOn(h.strokesReceived)}>
                          {'•'.repeat(h.strokesReceived)}
                        </span>
                      )}
                    </span>
                    <span className={`${styles.pts} ${untouched ? styles.ptsMuted : pts >= 3 ? styles.ptsHigh : ''}`}>
                      {ptsLine}
                      {h.par !== par ? `, ${S.parHere(h.par)}` : ''}
                    </span>
                  </div>
                  <div className={styles.controls}>
                    <Stepper label={S.strokesOf(cardName(p))} quiet value={d.strokes} par={h.par} min={1} max={15} disabled={locked || d.pickedUp} onChange={(v) => setDraft(p.id, { strokes: v, putts: Math.min(d.putts, v) })} />
                    <Stepper label={S.puttsOf(cardName(p))} quiet value={d.putts} min={0} max={d.pickedUp ? 15 : d.strokes} disabled={locked} onChange={(v) => setDraft(p.id, { putts: v })} />
                    <button type="button" className={styles.pickup} disabled={locked} onClick={() => setDraft(p.id, { pickedUp: !d.pickedUp })} aria-pressed={d.pickedUp} aria-label={S.pickedUpOf(cardName(p))}>
                      {S.pickedUp}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {contests.map((c) => {
            const chosen = pickOf(c.id)
            return (
              <div key={c.id} className={styles.contest} role="group" aria-label={c.label}>
                <span className={styles.contestTitle}>
                  <strong>{S.contest.question[c.kind] ?? c.label}</strong>
                  <span className="help">
                    {c.label}
                    {c.single ? '' : `, ${S.contest.many.toLowerCase()}`}
                  </span>
                </span>
                <div className={styles.contestPicks}>
                  {c.eligible.map((p) => (
                    <button key={p.id} type="button" className={styles.pickup} aria-pressed={chosen.includes(p.id)} disabled={!canEdit} onClick={() => togglePick(c, p.id)}>
                      {cardName(p)}
                    </button>
                  ))}
                  <button type="button" className={styles.pickup} aria-pressed={picks[c.id] !== undefined && chosen.length === 0} disabled={!canEdit} onClick={() => togglePick(c, null)}>
                    {S.contest.nobody}
                  </button>
                </div>
              </div>
            )
          })}

          <div className={styles.saveBar}>
            <button className="btn btn--primary btn--block" type="button" disabled={busy || !canEdit} onClick={() => void save()}>
              {busy ? t.common.saving : idx === order.length - 1 ? S.saveLast : S.save}
            </button>
            {canEdit ? (
              statusLine(<span className={`${styles.saveStatus} ${syncWarn ? styles.saveStatusWarn : ''}`}>{syncText}</span>)
            ) : (
              <span className={`${styles.saveStatus} ${styles.saveStatusWarn}`}>{anySigned ? S.lockedSigned : round.status === 'scheduled' ? S.roundNotLive(round.number) : S.roundFinished(round.number)}</span>
            )}
          </div>
          <RejectedWrites canResend={me.isAdmin} playerId={me.playerId} />
        </>
      )}

      <Sheet open={!!tiebreak} onClose={() => setTiebreak(null)} title={S.whoHoledLast}>
        <div className="stack">
          <p className="help">{S.whoHoledLastHint(threshold)}</p>
          {tiebreak?.candidates.map((id) => {
            const p = players.find((x) => x.id === id)!
            return (
              <button key={id} type="button" className="btn btn--secondary btn--block" disabled={busy} onClick={() => void commit(id)}>
                {cardName(p)}
              </button>
            )
          })}
        </div>
      </Sheet>

      <Sheet open={confirmDefaults} onClose={() => setConfirmDefaults(false)} title={S.allDefaultsTitle(hole)}>
        <div className="stack">
          <p className="help">{S.allDefaultsHint}</p>
          <div className="row">
            <button className="btn btn--secondary" type="button" onClick={() => setConfirmDefaults(false)}>
              {S.allDefaultsBack}
            </button>
            <button className="btn btn--primary grow" type="button" onClick={() => void save(true)}>
              {S.allDefaultsConfirm}
            </button>
          </div>
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

      <Sheet open={askReason} onClose={() => setAskReason(false)} title={S.signedReasonTitle}>
        <div className="stack">
          <p className="help">{S.signedReasonHint}</p>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.admin.scores.reason} aria-label={t.admin.scores.reason} autoFocus />
          <div className="row">
            <button className="btn btn--secondary" type="button" onClick={() => setAskReason(false)}>
              {t.common.cancel}
            </button>
            <button className="btn btn--primary grow" type="button" disabled={busy || reason.trim().length < 3} onClick={() => void save(true)}>
              {busy ? t.common.saving : S.save}
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

      {/* Last in the card, so reading it from the top meets the group before the last announcement. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </p>
    </div>
  )
}
