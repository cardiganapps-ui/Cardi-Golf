/**
 * The open hole's drafts (§9.3): what each player's steppers show, who was touched here, what the server had
 * when he was, and what the phone keeps of a half-entered hole (PWA-05). The decisions are `holeEntry.ts`'s;
 * this keeps the refs and the state, and the effects that run when the hole or its server values change.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useOutbox, type HoleFields } from '../../../data/outbox'
import type { HoleResult } from '../../../engine/core/types'
import { readKept, sweepKept, writeKept, type Draft, type KeptDraft } from '../tarjetaDrafts'
import { keptPlayers, openingDraft, parseDrafts, restoreKept, serverValue, takeServerValues } from './holeEntry'

export interface HoleDraftsInput {
  /** `round|group|hole`: the hole on screen. */
  holeKey: string
  playerIds: readonly string[]
  /** The engine's hole for one player on the hole on screen. */
  holeInfo: (pid: string) => HoleResult | undefined
  /** The hole as a screen reader hears it, said when the card lands on a new one. */
  holeSpoken: string
  editableFor: (pid: string) => boolean
  /** The row the boards hold for one player on the hole on screen (`{}`: none). */
  rowOf: (pid: string) => HoleFields
  /** The card's live region, and what the last save left to say with the next hole («Hoyo 12 guardado»). */
  say: (text: string) => void
  sayWithNextHole: RefObject<string>
}

export function useHoleDrafts({
  holeKey,
  playerIds,
  holeInfo,
  holeSpoken,
  editableFor,
  rowOf,
  say,
  sayWithNextHole,
}: HoleDraftsInput) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  /** Players whose steppers were changed on this hole: only they, and players the server has nothing for, are written (REL-05). */
  const touched = useRef<Set<string>>(new Set())
  /** When the hole on screen last changed: a second tap must not save the next hole (UX-02). */
  const settledAt = useRef(0)
  /** What the server has for one player on the open hole. */
  const serverOf = (pid: string) => serverValue(holeInfo(pid))
  /** What the server has for each player on the open hole; changes when a save lands, from this phone or another. */
  const serverKey = playerIds.map((id) => `${id}:${serverOf(id)}`).join('|')

  // Latest players, hole data and drafts for the effect below: it runs when the hole
  // changes or the server's values for it do, never on a keystroke. A layout effect,
  // like that one, and declared before it, so it runs first.
  const latest = useRef({ playerIds, holeInfo, drafts, holeSpoken, editableFor, rowOf })
  useLayoutEffect(() => {
    latest.current = { playerIds, holeInfo, drafts, holeSpoken, editableFor, rowOf }
  })
  /** What the server had for each player when he was first touched or restored on this hole: the kept draft's baseline. */
  const baselines = useRef(new Map<string, string>())
  /** The same, as the row the save sends as what it saw (REL-05): the server overwrites nothing changed since. */
  const bases = useRef(new Map<string, HoleFields>())
  /** Players whose kept draft was restored and not touched since: newer server values replace it. */
  const restored = useRef(new Set<string>())
  /** Players whose restored value is on screen, touched or not: «falta guardarlo» shows until the hole is saved. */
  const restoredShown = useRef(new Set<string>())
  const [restoredCount, setRestoredCount] = useState(0)
  useEffect(sweepKept, [])
  /** Kept drafts of this hole read before the phone's queue was, whose baseline couldn't be checked yet (NEW-11). */
  const heldKept = useRef<KeptDraft['players']>({})
  const shownHole = useRef('')
  /** The drafts the hole opened on or was last saved with (JSON): a draft equal to them is not an edit. */
  const initialDrafts = useRef('')
  // A layout effect, on its own merits: its update renders before the browser gets the page back,
  // so no task and no frame ever shows a new hole's heading over the last hole's figures. As a
  // passive effect its update ran at default priority, tasks later (one to three painted frames in
  // Chromium): the stack suite (PRs 104 and 105) read a stepper in between, saw the value it meant
  // to set, tapped nothing, and the correction was never written; a player's tap there counted from
  // the last hole's figure, so it saved that figure ±1 as the new hole's. (The picks reset beside it, a
  // layout effect too, happens to flush this one with it in React 19; don't lean on that.)
  useLayoutEffect(() => {
    const { playerIds, holeInfo, drafts: current, holeSpoken, editableFor, rowOf } = latest.current
    const serverNow = (pid: string) => serverValue(holeInfo(pid))
    if (shownHole.current !== holeKey) {
      // A new hole: saved values or defaults (par, 2 putts), nothing touched yet.
      // A screen reader hears where it landed; the first hole is the page itself.
      if (shownHole.current) say([sayWithNextHole.current, holeSpoken].filter(Boolean).join('. '))
      sayWithNextHole.current = ''
      shownHole.current = holeKey
      touched.current = new Set()
      baselines.current = new Map()
      bases.current = new Map()
      restored.current = new Set()
      restoredShown.current = new Set()
      settledAt.current = performance.now()
      const next: Record<string, Draft> = {}
      for (const id of playerIds) next[id] = openingDraft(holeInfo(id))
      initialDrafts.current = JSON.stringify(next)
      // What was typed here and not saved yet comes back, unless the server has moved on for that player or the card can't be edited.
      const { restore, held } = restoreKept({
        playerIds,
        kept: readKept(holeKey),
        editable: editableFor,
        serverOf: serverNow,
        queueRead: useOutbox.getState().queueRead,
      })
      heldKept.current = held
      for (const [id, k] of Object.entries(restore)) {
        next[id] = k.draft
        touched.current.add(id)
        baselines.current.set(id, k.server)
        // Restored only when the server still holds what it had then: that is what this draft was typed over.
        bases.current.set(id, rowOf(id))
        restored.current.add(id)
        restoredShown.current.add(id)
      }
      setRestoredCount(restoredShown.current.size)
      setDrafts(next)
      return
    }
    // Same hole, new values on the server: the other phone saved. A restored draft nobody has touched
    // since gives way to a newer save (a stale snapshot at open, then the fresh one).
    for (const id of [...restored.current]) {
      if (serverNow(id) === baselines.current.get(id)) continue
      restored.current.delete(id)
      restoredShown.current.delete(id)
      touched.current.delete(id)
      baselines.current.delete(id)
      bases.current.delete(id)
    }
    setRestoredCount(restoredShown.current.size)
    const merged = takeServerValues({
      playerIds,
      drafts: current,
      initial: parseDrafts(initialDrafts.current),
      touched: touched.current,
      holeOf: holeInfo,
    })
    if (merged) {
      setDrafts(merged.drafts)
      initialDrafts.current = JSON.stringify(merged.initial)
    }
  }, [holeKey, serverKey]) // eslint-disable-line react-hooks/exhaustive-deps -- the hole and its server values; the rest is read from `latest`
  // Keep what was typed on this hole, for the players touched here (PWA-05).
  useEffect(() => {
    if (!shownHole.current) return
    writeKept(
      shownHole.current,
      keptPlayers({ held: heldKept.current, touched: touched.current, drafts, baselines: baselines.current, serverOf }),
    )
  }, [drafts]) // eslint-disable-line react-hooks/exhaustive-deps -- written when the drafts change, with the server values of that moment
  // An unsaved hole defers the "new version" reload offer (main.tsx).
  useEffect(() => {
    useOutbox.setState({ editing: JSON.stringify(drafts) !== initialDrafts.current })
  }, [drafts])
  useEffect(() => () => useOutbox.setState({ editing: false }), [])

  /** A stepper or «Levantó» changed one player's draft. */
  const change = (pid: string, patch: Partial<Draft>) => {
    // Its baseline is what the server has now, the first time; a restored draft touched again is a live edit.
    if (!baselines.current.has(pid)) baselines.current.set(pid, serverOf(pid))
    // Before the phone's queue is read the boards may lack a hole it holds (NEW-11): what it saw is taken at the save instead.
    if (!bases.current.has(pid) && useOutbox.getState().queueRead) bases.current.set(pid, rowOf(pid))
    // Touched again, it is a live edit; the note stays until the hole is saved.
    restored.current.delete(pid)
    touched.current.add(pid)
    setDrafts((d) => {
      const cur = d[pid]
      return cur ? { ...d, [pid]: { ...cur, ...patch } } : d
    })
  }

  /**
   * The save is the hole's new starting point. The last hole stays on screen after its save: a correction made
   * there is kept against the save, and a later save writes only what was touched after it.
   */
  const markSaved = (saved: Record<string, Draft>) => {
    restored.current.clear()
    restoredShown.current.clear()
    setRestoredCount(0)
    touched.current = new Set()
    baselines.current = new Map()
    bases.current = new Map()
    initialDrafts.current = JSON.stringify(saved)
    useOutbox.setState({ editing: false })
  }

  return {
    drafts,
    change,
    markSaved,
    /** The drafts the hole opened on or was last saved with, read once per render for the quiet badges. */
    initial: () => parseDrafts(initialDrafts.current),
    touched,
    bases,
    settledAt,
    restoredCount,
    /** The latest render's hole as a screen reader hears it, for an announcement made after a save lands. */
    latest,
  }
}
