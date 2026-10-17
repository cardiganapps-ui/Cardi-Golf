/**
 * «Guardar hoyo» and its way back (§9.3): the questions before a save (`decideSave`), the save itself, what the
 * card shows after it (the save bar's note, «Guardado» on the button, the snake changing hands) and the undo.
 *
 * A Comité correction goes to the server (a closed day, a signed card) and can be refused or lost on a bad
 * signal: the card waits for its answer. Everything else goes into the phone's own outbox, which only the
 * phone's storage can refuse: the card moves on in the tap's frame. The hole goes into the phone's storage
 * at once, so an app closed or put away the moment the card moves on keeps it, and the boards take it once
 * that frame is on screen, so their recompute never holds the frame back. It waited for the write and the
 * recompute, a third of a second on a mid-range phone (PERF-10); then the write waited for the frame, and a
 * page closed inside it lost the hole.
 */
import { burst } from '../../../lib/confetti'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { toast } from '../../../components/toast'
import { useOutbox } from '../../../data/outbox'
import type { HoleResult } from '../../../engine/core/types'
import { t } from '../../../i18n/es-MX'
import { haptic } from '../../../lib/haptics'
import { humanError, isTransient } from '../../../lib/humanError'
import { celebrationColors } from '../../../lib/tokens'
import { writeKept, type Draft } from '../tarjetaDrafts'
import {
  afterSave,
  canUndo,
  decideSave,
  pickWrites,
  snakeCandidates,
  undoSnapshot,
  unusualValues,
} from './saveDecision'
import { afterPaint, SAVED_CHECK_MS, SAVED_NOTE_MS, SETTLE_MS, SNAKE_NOTE_MS } from './timing'
import type { useHoleDrafts } from './useHoleDrafts'
import type { HoleNav } from './useHoleNav'
import { writeHole, type HoleWriter } from './writeHole'

const S = t.card

/** The last save, shown in the save bar instead of a toast over «Guardar hoyo» (PWA-01). */
export interface SavedNote {
  hole: number
  idx: number
  canUndo: boolean
  restored?: boolean
  /** The hole was a correction, and where the card went back to (null: the round is all played, UX-19). */
  corrected?: number | null
}

export interface HoleSaveInput {
  nav: HoleNav
  order: readonly number[]
  holeKey: string
  /** The group's players on the boards, in the card's order, with the names the card gives them. */
  named: ReadonlyArray<{ id: string; name: string }>
  holeInfo: (pid: string) => HoleResult | undefined
  playedOn: (pid: string, hole: number) => boolean
  par: number
  myPlayerId: string | null
  canEdit: boolean
  needsReason: boolean
  correctsOnServer: (ids: string[]) => boolean
  /** The writer for this card, but for the reason, which this hook keeps. */
  writer: Omit<HoleWriter, 'reason'>
  threshold: number
  /** The snake's label, which names it when it changes hands (STRAT-11). */
  snakeLabel: string
  /** Whether the group already answered «¿Quién embocó al último?» for the hole on screen. */
  answered: boolean
  entry: ReturnType<typeof useHoleDrafts>
  say: (text: string) => void
  sayWithNextHole: RefObject<string>
  /** Who carries the snake: on the boards as the screen drew them, and on the boards now. */
  snakeHolder: string | null
  holderNow: () => string | null
}

export function useHoleSave(o: HoleSaveInput) {
  const { nav, entry } = o
  // `confirmedPar` rides along: the answer commits the hole, and «Sí, todos par» before it still holds.
  const [tiebreak, setTiebreak] = useState<{ candidates: string[]; confirmedPar: boolean } | null>(null)
  const [confirmWeird, setConfirmWeird] = useState<string[] | null>(null)
  const [askReason, setAskReason] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  /** The hole on its way into the phone's storage: the card has moved on, and the next save waits for it (PERF-10). */
  const saving = useRef<Promise<void> | null>(null)
  const [confirmDefaults, setConfirmDefaults] = useState(false)
  /** The saved values of the hole before the last save, for a real undo. */
  const undo = useRef<{ hole: number; drafts: Record<string, Draft>; wasPlayed: Record<string, boolean> } | null>(null)
  /** When the last save went out: untouched defaults right after it ask first. */
  const lastSaveAt = useRef(-Infinity)
  const [savedNote, setSavedNote] = useState<SavedNote | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(savedTimer.current), [])
  const showSaved = (note: SavedNote) => {
    clearTimeout(savedTimer.current)
    setSavedNote(note)
    savedTimer.current = setTimeout(() => setSavedNote(null), SAVED_NOTE_MS)
  }
  /** The button rests on «Guardado» for a moment after a save (MOT-02). */
  const [justSaved, setJustSaved] = useState(false)
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** The snake changed hands with this phone's save: said under the hole for a few seconds (MOT-07). */
  const [snakeNote, setSnakeNote] = useState<string | null>(null)
  const snakeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(
    () => () => {
      clearTimeout(justSavedTimer.current)
      clearTimeout(snakeTimer.current)
    },
    [],
  )

  const playerIds = o.named.map((p) => p.id)
  const write = (values: Record<string, Draft>, hole: number, more?: Parameters<typeof writeHole>[3]) =>
    writeHole({ ...o.writer, reason }, values, hole, more)

  /** `confirmedPar`: the player answered «Sí, todos par»: those pars are his capture, not untouched defaults (REL-08). */
  async function save(force = false, confirmedPar = false) {
    const now = performance.now()
    const step = decideSave({
      force,
      canEdit: o.canEdit,
      busy,
      saving: !!saving.current,
      queueRead: useOutbox.getState().queueRead,
      sinceSettled: now - entry.settledAt.current,
      sinceLastSave: now - lastSaveAt.current,
      allDefaults: playerIds.every((id) => !entry.touched.current.has(id) && !o.holeInfo(id)?.played),
      unusual: unusualValues(o.named, entry.drafts),
      needsReason: o.needsReason,
      reason,
      candidates: snakeCandidates(playerIds, entry.drafts, o.threshold),
      answered: o.answered,
    })
    if (step.kind === 'ignore') return
    if (step.kind === 'confirmDefaults') {
      setConfirmDefaults(true)
      return
    }
    if (step.kind === 'confirmUnusual') {
      setConfirmWeird(step.lines)
      return
    }
    setConfirmWeird(null)
    setConfirmDefaults(false)
    if (step.kind === 'askReason') {
      setAskReason(true)
      return
    }
    if (step.kind === 'askTiebreak') {
      setAskReason(false)
      setTiebreak({ candidates: step.candidates, confirmedPar })
      return
    }
    await commit(undefined, confirmedPar)
  }

  async function commit(lastHoled?: string, confirmedPar = false) {
    setAskReason(false)
    const savedHole = nav.hole
    const savedIdx = nav.idx
    const savedKey = o.holeKey
    const holderBefore = o.snakeHolder
    const { correcting, backTo, target } = afterSave({ order: o.order, savedHole, playerIds, played: o.playedOn })
    const writes = pickWrites(playerIds, entry.drafts, entry.touched.current, (id) => !!o.holeInfo(id)?.played)
    const { before, wasPlayed, celebrate } = undoSnapshot({
      writes,
      holeOf: o.holeInfo,
      fallbackPar: o.par,
      myPlayerId: o.myPlayerId,
    })
    const viaServer = o.correctsOnServer(Object.keys(writes))
    const seen = new Map(entry.bases.current)
    // Untouched defaults say so (`auto`), unless the player confirmed them: «Sí, todos par» is a person's capture.
    const auto = new Set(confirmedPar ? [] : Object.keys(writes).filter((id) => !entry.touched.current.has(id)))
    const writing = write(writes, savedHole, { lastHoled, seen, auto, settle: viaServer ? undefined : afterPaint() })
    if (viaServer) {
      setBusy(true)
      try {
        await writing
      } catch (e) {
        // Nothing of the hole was kept (one call, REL-22): with no signal, say so, and what was typed stays on the card.
        toast(isTransient(e) ? S.correctionNeedsSignal : humanError(e))
        setBusy(false)
        return
      }
      setBusy(false)
    }
    // One hole in the phone's storage at a time. The settle guard ignores taps for SETTLE_MS anyway; storage slower
    // than that shows «Guardando…» until it answers, and «Guardar hoyo» never waits greyed out on a save that took ms.
    saving.current = writing
    let saidSaving = false
    const slow = viaServer
      ? undefined
      : setTimeout(() => {
          saidSaving = true
          setBusy(true)
        }, SETTLE_MS)
    entry.markSaved(entry.drafts)
    const undoBefore = undo.current
    const lastSaveBefore = lastSaveAt.current
    undo.current = { hole: savedHole, drafts: before, wasPlayed }
    lastSaveAt.current = performance.now()
    setTiebreak(null)
    if (celebrate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      burst({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: celebrationColors() })
    }
    // The hand feels the save; a birdie or a snake pass a little more (MOT-10). The button says «Guardado» a moment (MOT-02).
    haptic(celebrate ? 'moment' : 'save')
    clearTimeout(justSavedTimer.current)
    setJustSaved(true)
    justSavedTimer.current = setTimeout(() => setJustSaved(false), SAVED_CHECK_MS)
    // Move on, and offer the way back instead of asking first: a real undo when the hole
    // already had values (they are written back), "Corregir" when it was new. It lives in
    // the save bar: a toast there sat on «Guardar hoyo» and ate the next tap (PWA-01).
    const written = Object.keys(writes)
    showSaved({
      hole: savedHole,
      idx: savedIdx,
      canUndo: canUndo(written, wasPlayed),
      ...(correcting ? { corrected: backTo } : {}),
    })
    // Where the card goes: after a correction, back to where the group is (the grid when it has played every hole);
    // after a new hole, the next one (the grid after the last).
    const moveOn = target != null
    const savedLine = correcting ? S.correctedHole(savedHole, backTo) : S.savedHole(savedHole)
    if (moveOn) {
      o.sayWithNextHole.current = savedLine
      nav.goto(target)
    } else {
      o.say(savedLine)
      nav.setView('grid')
    }
    try {
      await writing
    } catch (e) {
      // The phone's storage refused the hole (full, or blocked), so nothing was kept: back to it, with what was
      // typed there (kept on the phone as it was typed, PWA-05) and why.
      clearTimeout(justSavedTimer.current)
      setJustSaved(false)
      clearTimeout(savedTimer.current)
      setSavedNote(null)
      undo.current = undoBefore
      lastSaveAt.current = lastSaveBefore
      nav.setView('hole')
      if (moveOn) nav.goto(savedIdx)
      toast(humanError(e))
      return
    } finally {
      clearTimeout(slow)
      if (saving.current === writing) saving.current = null
      // Only when it said «Guardando…»: setting an unchanged state still costs a render now and then.
      if (saidSaving) setBusy(false)
    }
    // In the outbox: nothing left to keep for this hole.
    writeKept(savedKey, {})
    // The boards hold the save now (the outbox's overlay): did the snake change hands with it (MOT-07)?
    const holderAfter = o.holderNow()
    const passedTo = holderAfter && holderAfter !== holderBefore ? o.named.find((p) => p.id === holderAfter) : undefined
    if (passedTo) {
      clearTimeout(snakeTimer.current)
      setSnakeNote(passedTo.name)
      snakeTimer.current = setTimeout(() => setSnakeNote(null), SNAKE_NOTE_MS)
      if (!celebrate) haptic('moment')
      // One message for a screen reader: the hole saved, the snake, and where the card is now.
      o.say(
        [
          savedLine,
          S.snakePasses(passedTo.name, o.snakeLabel),
          ...(moveOn ? [entry.latest.current.holeSpoken] : []),
        ].join('. '),
      )
    }
  }

  function undoLast() {
    const note = savedNote
    if (!note || note.restored) return
    setSavedNote(null)
    const u = undo.current
    if (note.canUndo && u?.hole === note.hole) {
      // The Comité's path (a closed day, a signed card) can fail: no signal, a refusal. The undo stays offered
      // until it lands, and says why it didn't (#98's second verifier).
      void write(u.drafts, u.hole).then(
        () => {
          if (undo.current === u) undo.current = null
          showSaved({ hole: u.hole, idx: note.idx, canUndo: false, restored: true })
          o.say(S.restoredHole(u.hole))
        },
        (e: unknown) => {
          toast(isTransient(e) ? S.undoNeedsSignal : humanError(e))
          if (undo.current === u) showSaved(note)
        },
      )
    }
    nav.setView('hole')
    nav.goto(note.idx)
  }

  return {
    save,
    commit,
    undoLast,
    busy,
    savedNote,
    justSaved,
    snakeNote,
    tiebreak,
    setTiebreak,
    confirmWeird,
    setConfirmWeird,
    confirmDefaults,
    setConfirmDefaults,
    askReason,
    setAskReason,
    reason,
    setReason,
    /** Whether one of the save's questions is open: no swipe, no notice moves the hole under it. */
    asking: !!tiebreak || !!confirmWeird || askReason || confirmDefaults,
  }
}
