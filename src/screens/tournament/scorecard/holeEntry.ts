/**
 * The open hole's drafts, as pure functions (ARCH-14): what a hole opens on, what comes back from the phone
 * (PWA-05), what another phone's save changes on screen (REL-05), and what is kept while it is typed. The
 * hook that holds them (`useHoleDrafts`) only keeps the refs and the state; every decision is here.
 */
import type { HoleResult } from '../../../engine/core/types'
import type { Draft, KeptDraft } from '../tarjetaDrafts'

/** What the server has for one player on a hole, as the kept draft and the card compare it: «gross:putts:pickedUp», or «-» for nothing. */
export const serverValue = (h: HoleResult | undefined): string =>
  h?.played ? `${h.gross}:${h.putts}:${h.pickedUp}` : '-'

/** A played hole's saved values as a draft; null when nothing is saved. */
export const savedDraft = (h: HoleResult | undefined): Draft | null =>
  h?.played ? { strokes: h.gross ?? h.par, putts: h.putts ?? 2, pickedUp: h.pickedUp } : null

/** What a hole opens on for one player: what is saved, else par for his own tee and 2 putts. */
export const openingDraft = (h: HoleResult | undefined): Draft =>
  savedDraft(h) ?? { strokes: h?.par ?? 4, putts: 2, pickedUp: false }

export const sameDraft = (a: Draft, b: Draft) =>
  a.strokes === b.strokes && a.putts === b.putts && a.pickedUp === b.pickedUp

/** The drafts a hole opened on (or was last saved with), as kept: a JSON string, so a draft equal to them is «not editing». */
export function parseDrafts(json: string): Record<string, Draft> {
  try {
    return (JSON.parse(json || '{}') as Record<string, Draft> | null) ?? {}
  } catch {
    return {}
  }
}

/** Untouched defaults on an unplayed hole: the points badge stays quiet (P2). */
export const isUntouched = (h: HoleResult, initial: Draft | undefined, d: Draft) =>
  !h.played && !!initial && sameDraft(initial, d)

/**
 * The name the card uses: the short one, or the full one when another in the group shares it (two «Diego»s
 * would be four identical controls again).
 */
export function cardNameIn(players: ReadonlyArray<{ id: string; displayName: string }>) {
  return (p: { id: string; displayName: string; fullName: string }) =>
    players.some((o) => o.id !== p.id && o.displayName === p.displayName) ? p.fullName : p.displayName
}

/**
 * What comes back of what was typed on this hole and not saved (PWA-05): a player's kept draft, when the card
 * may edit him and the server still holds what it had when he was typed (that is what the draft was typed
 * over). One the server moved on from is dropped, except before the phone's queue is read: then the boards may
 * lack a hole the queue holds, and the draft is held until the hole opens again with the queue read (NEW-11).
 */
export function restoreKept(o: {
  playerIds: readonly string[]
  kept: KeptDraft | null
  editable: (pid: string) => boolean
  serverOf: (pid: string) => string
  queueRead: boolean
}) {
  const restore: KeptDraft['players'] = {}
  const held: KeptDraft['players'] = {}
  for (const pid of o.playerIds) {
    const k = o.kept?.players[pid]
    if (!k || !o.editable(pid)) continue
    if (k.server !== o.serverOf(pid)) {
      if (!o.queueRead) held[pid] = k
      continue
    }
    restore[pid] = k
  }
  return { restore, held }
}

/**
 * The same hole, new values on the server (the other phone saved): they go into every player nobody here has
 * touched, so a save from this phone never writes a default over them (REL-05); what was typed here stays. A
 * player the Comité put in the group while the hole was open gets what a new hole would give him. Null when
 * nothing on screen changes; else the drafts and the new starting point they are compared with.
 */
export function takeServerValues(o: {
  playerIds: readonly string[]
  drafts: Record<string, Draft>
  initial: Record<string, Draft>
  touched: ReadonlySet<string>
  holeOf: (pid: string) => HoleResult | undefined
}): { drafts: Record<string, Draft>; initial: Record<string, Draft> } | null {
  let next: Record<string, Draft> | null = null
  const initial = { ...o.initial }
  for (const pid of o.playerIds) {
    const v = savedDraft(o.holeOf(pid))
    const d = o.drafts[pid]
    if (!d) {
      const fresh = v ?? openingDraft(o.holeOf(pid))
      next = { ...(next ?? o.drafts), [pid]: fresh }
      initial[pid] = fresh
      continue
    }
    if (!v || o.touched.has(pid) || sameDraft(d, v)) continue
    next = { ...(next ?? o.drafts), [pid]: v }
    initial[pid] = v
  }
  return next ? { drafts: next, initial } : null
}

/**
 * What the phone keeps of the open hole (PWA-05): each player touched here with what the server had when he was
 * first touched, and the drafts held before the queue was read for the players not touched since.
 */
export function keptPlayers(o: {
  held: KeptDraft['players']
  touched: ReadonlySet<string>
  drafts: Record<string, Draft>
  baselines: ReadonlyMap<string, string>
  serverOf: (pid: string) => string
}): KeptDraft['players'] {
  const keep: KeptDraft['players'] = {}
  for (const [pid, k] of Object.entries(o.held)) if (!o.touched.has(pid)) keep[pid] = k
  for (const pid of o.touched) {
    const draft = o.drafts[pid]
    if (draft) keep[pid] = { draft, server: o.baselines.get(pid) ?? o.serverOf(pid) }
  }
  return keep
}
