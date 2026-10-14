/**
 * Writing one hole of the Tarjeta (ARCH-14): to the phone's outbox, or, for a Comité correction where a phone's
 * write is refused, to the server in one call. Every write starts at once, in this order (each player's direct
 * write, the group's hole, the contest winners, the snake's answer), so all of it is in the phone's storage
 * before anything waits: the app may be closed the moment the card moves on (PERF-10).
 */
import { adminSaveHole } from '../../../data/api'
import { enqueueAward, enqueueHole, enqueueScore, enqueueTiebreak, type HoleEntry, type HoleFields } from '../../../data/outbox'
import type { Draft } from '../tarjetaDrafts'
import { entryFields } from './saveDecision'

export interface HoleWriter {
  tournamentId: string
  roundId: string
  groupId: string
  /** The group's players on the boards, in the card's order. */
  playerIds: readonly string[]
  /** The group as the round lists it: a phone of the group sends its hole as one save. */
  groupPlayerIds: readonly string[]
  /** This phone's player (null: an organizer who plays nobody). */
  myPlayerId: string | null
  /** Whether writing these players is a Comité correction on the server (a day no longer live, a signed card). */
  viaServer: (ids: string[]) => boolean
  /** The row the boards hold for one player on a hole (`{}`: none), as a save names what it saw. */
  rowOf: (pid: string, hole: number) => HoleFields
  /** What this phone would save for him untouched on a hole: par for his own tee. */
  parOf: (pid: string, hole: number) => number
  /** The hole on screen and its contest winners as picked there (only a hole on screen carries its picks). */
  holeOnScreen: number
  awards: ReadonlyArray<{ gameId: string; playerIds: string[] }>
  /** The Comité's reason for a correction on a signed card ('' when none). */
  reason: string
}

export interface HoleWrite {
  /** Who holed out last, when the snake's question was answered. «No sabemos» sends no answer: the Comité decides (UX-08). */
  lastHoled?: string
  /** The rows each player was first seen with on this hole; a player missing here is compared with the boards now. */
  seen?: Map<string, HoleFields>
  /** Players written with untouched defaults (`auto`): an all-par hole nobody confirmed (REL-08). */
  auto?: Set<string>
  /** What the boards wait for: the next hole's frame. */
  settle?: Promise<void>
}

/**
 * Writes the players in `values` and nobody else: a player left out keeps what the server has. A group's own
 * phone sends the hole as one save (REL-05): per player only the fields that differ from the row it saw, so a
 * value another phone saved meanwhile is never overwritten; the server asks instead. The Comité writing another
 * group's card keeps its direct write (0026 allows it while the day is live).
 */
export async function writeHole(w: HoleWriter, values: Record<string, Draft>, holeNumber: number, o: HoleWrite = {}) {
  const ofGroup = !!w.myPlayerId && w.groupPlayerIds.includes(w.myPlayerId)
  const entries: HoleEntry[] = []
  const queued: Promise<void>[] = []
  const viaServer = w.viaServer(Object.keys(values))
  const corrections: Array<{ player_id: string; strokes: number | null; putts: number | null; picked_up: boolean }> = []
  for (const pid of w.playerIds) {
    const d = values[pid]
    if (!d) continue
    const payload = { round_id: w.roundId, player_id: pid, hole: holeNumber, strokes: d.pickedUp ? null : d.strokes, putts: d.putts, picked_up: d.pickedUp }
    // A Comité correction where a phone's write is refused: every player of the hole to the server, as one correction.
    // One by one, a refusal or a lost signal on the second came after the first was saved: half a hole (REL-22).
    if (viaServer) corrections.push({ player_id: pid, strokes: payload.strokes, putts: payload.putts, picked_up: payload.picked_up })
    else if (!ofGroup) queued.push(enqueueScore(w.tournamentId, { ...payload, entered_by: w.myPlayerId, client_ts: new Date().toISOString() }, o.settle))
    else {
      const base = o.seen?.get(pid) ?? w.rowOf(pid, holeNumber)
      // What this phone would have saved for him untouched: another phone's save of exactly that is no one's claim.
      const dflt = { strokes: w.parOf(pid, holeNumber), putts: 2, picked_up: false }
      entries.push({ player_id: pid, fields: entryFields(payload, base), base, auto: !!o.auto?.has(pid), dflt })
    }
  }
  if (entries.length) queued.push(enqueueHole(w.tournamentId, { round_id: w.roundId, hole: holeNumber, entered_by: w.myPlayerId, entries }, o.settle))
  if (holeNumber === w.holeOnScreen) {
    for (const a of w.awards) queued.push(enqueueAward(w.tournamentId, { round_id: w.roundId, group_id: w.groupId, hole: holeNumber, game_id: a.gameId, player_ids: a.playerIds, decided_by: w.myPlayerId }, o.settle))
  }
  if (o.lastHoled) {
    queued.push(enqueueTiebreak(w.tournamentId, { round_id: w.roundId, group_id: w.groupId, hole: holeNumber, last_holed_player_id: o.lastHoled, decided_by: w.myPlayerId }, o.settle))
  }
  // The server's correction, in one call, once the phone's own writes (winners, the snake's answer) are on their way; then those, failed or not.
  const stored = Promise.all(queued)
  // Awaited below; a refusal meanwhile is not an unhandled one.
  stored.catch(() => undefined)
  try {
    if (corrections.length) await adminSaveHole(w.roundId, holeNumber, corrections, w.reason.trim() || null)
  } finally {
    await stored
  }
}
