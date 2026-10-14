/**
 * «Guardar hoyo», as pure functions (ARCH-14, QA-13): whether a tap saves at all, which question comes first
 * (untouched defaults, unusual values, the Comité's reason, the snake's tiebreak), who is written, where the
 * card goes after, and what an undo puts back. The card asks the question this returns and acts on the
 * answer; nothing here touches the screen or the phone's storage.
 */
import { baseRow, type HoleFields } from '../../../data/outbox'
import { stablefordPoints } from '../../../engine/core/stableford'
import type { HoleResult } from '../../../engine/core/types'
import { t } from '../../../i18n/es-MX'
import type { Draft } from '../tarjetaDrafts'
import { DOUBLE_SAVE_MS, SETTLE_MS } from './timing'

const S = t.card

/** Strokes of 10 or more and putts of 5 or more are asked about before the save (§9.3), one line each. A pick-up has nothing to ask. */
export function unusualValues(players: ReadonlyArray<{ id: string; name: string }>, drafts: Record<string, Draft>): string[] {
  const weird: string[] = []
  for (const p of players) {
    const d = drafts[p.id]
    if (!d || d.pickedUp) continue
    if (d.strokes >= 10) weird.push(`${p.name}: ${d.strokes} ${S.strokes.toLowerCase()}`)
    if (d.putts >= 5) weird.push(`${p.name}: ${d.putts} ${S.putts.toLowerCase()}`)
  }
  return weird
}

/** The players at the snake's threshold on this hole: two or more ask «¿Quién embocó al último?». */
export const snakeCandidates = (playerIds: readonly string[], drafts: Record<string, Draft>, threshold: number) => playerIds.filter((id) => (drafts[id]?.putts ?? -Infinity) >= threshold)

export interface SaveCheck {
  /** Past the questions about the values: the tap is the answer to «¿Seguro?» or «Sí, todos par». */
  force: boolean
  canEdit: boolean
  /** A Comité correction waiting for the server, or storage slower than the settle guard («Guardando…»). */
  busy: boolean
  /** A hole still on its way into the phone's storage (PERF-10): the next one waits for it. */
  saving: boolean
  /** Whether the phone has read the holes it keeps: before that the hole on screen may be one of them, shown unplayed (NEW-11). */
  queueRead: boolean
  /** Milliseconds since the hole on screen changed (UX-02) and since the last save. */
  sinceSettled: number
  sinceLastSave: number
  /** Nobody touched on a hole nobody has played. */
  allDefaults: boolean
  /** `unusualValues` of the drafts. */
  unusual: string[]
  /** A Comité correction on a signed card (§7), and the reason typed so far. */
  needsReason: boolean
  reason: string
  /** `snakeCandidates`, and whether the group already answered the question for this hole. */
  candidates: string[]
  answered: boolean
}

export type SaveStep =
  /** The tap saves nothing: the card can't be edited, a save is on its way, or it is the first tap again. */
  | { kind: 'ignore' }
  /** Untouched defaults seconds after the last save: a double tap, or did all of them make par? */
  | { kind: 'confirmDefaults' }
  | { kind: 'confirmUnusual'; lines: string[] }
  | { kind: 'askReason' }
  /** The hole saves from the question's sheet: with an answer, or with «que decida el Comité» (UX-08). */
  | { kind: 'askTiebreak'; candidates: string[] }
  | { kind: 'commit' }

/**
 * What a tap on «Guardar hoyo» does. The questions about values come first (and a `force` tap is past them);
 * then the reason of a correction on a signed card; then the snake's tiebreak, which gives way to nothing:
 * the reason sheet used to stay under it, and a second «Guardar» saved the hole without the answer.
 */
export function decideSave(c: SaveCheck): SaveStep {
  if (!c.canEdit || c.busy || c.saving || !c.queueRead) return { kind: 'ignore' }
  if (!c.force) {
    if (c.sinceSettled < SETTLE_MS) return { kind: 'ignore' }
    if (c.allDefaults && c.sinceLastSave < DOUBLE_SAVE_MS) return { kind: 'confirmDefaults' }
    if (c.unusual.length) return { kind: 'confirmUnusual', lines: c.unusual }
  }
  if (c.needsReason && c.reason.trim().length < 3) return { kind: 'askReason' }
  if (c.candidates.length >= 2 && !c.answered) return { kind: 'askTiebreak', candidates: c.candidates }
  return { kind: 'commit' }
}

/**
 * Who a save writes: the players touched here, and the ones the server has nothing for yet (that is how an
 * all-par hole stays one tap). A player the other phone already saved is left alone (REL-05).
 */
export function pickWrites(playerIds: readonly string[], drafts: Record<string, Draft>, touched: ReadonlySet<string>, played: (pid: string) => boolean): Record<string, Draft> {
  const writes: Record<string, Draft> = {}
  for (const id of playerIds) {
    const d = drafts[id]
    if (d && (touched.has(id) || !played(id))) writes[id] = d
  }
  return writes
}

/**
 * Where the card goes after a save. A hole the whole group had played, saved again, is a correction: back to
 * where the group is, the first hole someone still has to play (null: every hole is played, the grid), not
 * to the hole after this one (UX-19). A new hole goes on to the next one (null after the last: the grid).
 * `target` is the index in the play order to move to.
 */
export function afterSave(o: { order: readonly number[]; savedHole: number; playerIds: readonly string[]; played: (pid: string, hole: number) => boolean }) {
  const correcting = o.playerIds.every((id) => o.played(id, o.savedHole))
  const backTo = correcting ? (o.order.find((h) => h !== o.savedHole && o.playerIds.some((id) => !o.played(id, h))) ?? null) : null
  const idx = o.order.indexOf(o.savedHole)
  const target = correcting ? (backTo == null ? null : o.order.indexOf(backTo)) : idx < o.order.length - 1 ? idx + 1 : null
  return { correcting, backTo, target }
}

/**
 * What an undo puts back, taken before the save: each written player's saved values (or the draft itself for a
 * hole that was new) and whether he had any. `celebrate`: this phone's own player made a net birdie or better.
 */
export function undoSnapshot(o: { writes: Record<string, Draft>; holeOf: (pid: string) => HoleResult | undefined; fallbackPar: number; myPlayerId: string | null }) {
  const before: Record<string, Draft> = {}
  const wasPlayed: Record<string, boolean> = {}
  let celebrate = false
  for (const [id, d] of Object.entries(o.writes)) {
    const h = o.holeOf(id)
    const pts = stablefordPoints(h?.par ?? o.fallbackPar, h?.strokesReceived ?? 0, d.pickedUp ? null : d.strokes, d.pickedUp)
    if (!d.pickedUp && pts >= 3 && id === o.myPlayerId) celebrate = true
    wasPlayed[id] = !!h?.played
    before[id] = h?.played ? { strokes: h.gross ?? h.par, putts: h.putts ?? 2, pickedUp: h.pickedUp } : d
  }
  return { before, wasPlayed, celebrate }
}

/** A real undo only when every player written already had values: they are written back. Else the card offers «Corregir». */
export const canUndo = (written: readonly string[], wasPlayed: Record<string, boolean>) => written.length > 0 && written.every((id) => wasPlayed[id])

/** The fields a save sets for one player: only those that differ from the row the phone saw (REL-05). */
export function entryFields(row: { strokes: number | null; putts: number | null; picked_up: boolean }, base: HoleFields): HoleFields {
  const was = baseRow(base)
  const fields: HoleFields = {}
  if (row.strokes !== was.strokes) fields.strokes = row.strokes
  if (row.putts !== was.putts) fields.putts = row.putts
  if (row.picked_up !== was.picked_up) fields.picked_up = row.picked_up
  return fields
}
