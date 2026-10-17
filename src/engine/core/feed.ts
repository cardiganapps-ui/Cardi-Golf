/**
 * Derived feed events (§6, §9.2): birdies, lead changes, snake passes, the
 * honoree's holes and three-putts. Replayed from the scores in the order they
 * were saved so the ticker reads like it happened. Copy is rendered by the UI
 * from `kind` (`feedLines`), which picks among a few lines per kind.
 *
 * COPY-15: each event carries what makes it a story: a birdie the day's
 * first, or the latest of a run on consecutive holes; a lead change whom it
 * took the lead from; a three-putt where no snake would say it already.
 *
 * The feed speaks the main event's language (STRAT-03). Under Stableford a
 * birdie is worth its points and the leader has the most of them. Under
 * strokes a birdie is a score under par (net or gross, as the event counts)
 * and the leader is lowest against par over the holes played, which is how
 * the board ranks. Where the board ranks teams or matches, one player's
 * running total is nobody's lead, so the feed announces no leader at all.
 */
import type { Id, Score, Snapshot } from '../types'
import type { CoreState, HoleResult } from './types'
import { timeKey } from './time'
import type { SnakeState } from '../modules/snake'
import { holeStrokes } from '../formats/strokePlay'
import { toParText } from '../formats/format'
import type { MainScoring } from '../formats'

export type FeedEvent =
  | {
      kind: 'birdie'
      at: string | null
      roundNumber: number
      hole: number
      playerId: Id
      /** Stableford points on the hole (always computed, shown only when the event counts points). */
      points: number
      /**
       * Strokes under par on the card itself, before any stroke received (0 at par or worse). When it
       * reaches `under` the card made the score on its own and the line names it plainly: «águila», not
       * «águila neta» (COPY-23).
       */
      grossUnder: number
      /** Strokes under par on the score the event counts (1 birdie, 2 eagle, 3 albatross). */
      under: number
      scoring: MainScoring
      /** The first birdie of its day, by anyone. */
      firstOfDay?: true
      /** Birdies on this many consecutive holes, this one the last, each saved before it (2 or more). */
      streak?: number
    }
  | {
      kind: 'leadChange'
      at: string | null
      roundNumber: number
      hole: number
      playerId: Id
      /** The leader's total as the board writes it: «34» points, «−3» against par. */
      figure: string
      scoring: MainScoring
      /** Whose save made the change (absent on the close's): the key of the line, which a sync must not change. */
      by?: Id
      /** The board's last word at the close (`computeTournament`), not a save's. */
      close?: true
      /** Who led before it, when someone did. */
      previous?: Id
    }
  | { kind: 'snakePass'; at: string | null; roundNumber: number; hole: number; playerId: Id; groupNumber: number }
  | {
      kind: 'honoreeHole'
      at: string | null
      roundNumber: number
      hole: number
      playerId: Id
      points: number
      /** The hole against par on the score the event counts; null for a pick-up. */
      toPar: number | null
      scoring: MainScoring
    }
  /** Three putts or more on a hole, where no snake is played to say it (and not a birdie nor the honoree's hole). */
  | { kind: 'threePutt'; at: string | null; roundNumber: number; hole: number; playerId: Id; putts: number }

export interface FeedOptions {
  /** What the main event counts. */
  scoring: MainScoring
  /** Whether a single player's running total is the board's lead (see `ranksPlayersByTotal`). */
  leaders: boolean
}

const POINTS: FeedOptions = { scoring: 'points', leaders: true }

/** The hole against par on the score the event counts, or null when there is none (a pick-up). */
function holeToPar(h: HoleResult, scoring: MainScoring): number | null {
  if (scoring === 'points') return h.net == null ? null : h.net - h.par
  if (h.pickedUp) return null
  const s = holeStrokes(h, scoring === 'net')
  return s == null ? null : s - h.par
}

/** When it happened, its day and its hole: the replay's order, and the feed's. */
interface Placed {
  /** The save's stamp in one form (`canonicalTime`), so `<` is time order; '' when there is none. */
  at: string
  rn: number
  hole: number
}
const inOrder = (a: Placed, b: Placed) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.rn - b.rn || a.hole - b.hole)

/** The hole a score is on, in its player's round: the holes are numbered from 1 in order, so it is at its number's place. */
function holeOf(holes: HoleResult[] | undefined, hole: number): HoleResult | undefined {
  const h = holes?.[hole - 1]
  return h?.hole === hole ? h : holes?.find((x) => x.hole === hole)
}

/**
 * PERF-14: every save replays the whole tournament's scores. The replay sorted
 * them with `localeCompare` and looked each hole and each snake pass up by
 * scanning, which was a third of a 60-player recompute. The stamps are put in
 * one form once and compared with `<`, holes are read at their place, and a
 * pass finds its save in an index.
 */
export function computeFeed(snapshot: Snapshot, core: CoreState, snake: SnakeState | undefined, opts: FeedOptions = POINTS, limit = 40): FeedEvent[] {
  const roundNumber = new Map(snapshot.rounds.map((r) => [r.id, r.number]))
  const honoree = snapshot.players.find((p) => p.isHonoree)?.id ?? null
  const events: Array<{ e: FeedEvent } & Placed> = []
  const push = (e: FeedEvent, at: string) => events.push({ e, at, rn: e.roundNumber, hole: e.hole })
  const { scoring } = opts
  const points = scoring === 'points'

  const active = new Set(core.roundIds)
  const scores: Array<{ s: Score } & Placed> = []
  for (const s of snapshot.scores) if (active.has(s.roundId)) scores.push({ s, at: timeKey(s.updatedAt), rn: roundNumber.get(s.roundId) ?? 0, hole: s.hole })
  scores.sort(inOrder)

  // Running totals: Stableford points (more is better), or strokes against
  // par (less is better). A pick-up counts as net double bogey, as on the board.
  // Kept in arrays, in the order each player first scored: the leader is read
  // off them after every save, and walking a Map made an entry each step.
  const slot = new Map<Id, number>()
  const ids: Id[] = []
  const totals: number[] = []
  let leader: Id | null = null
  // Which saved holes were birdies, by day, player and hole, and the days that have had one (COPY-15).
  const birdieHoles = new Map<string, boolean>()
  const birdieDays = new Set<Id>()
  for (const { s, rn, at } of scores) {
    const h = holeOf(core.rounds[s.roundId]?.[s.playerId]?.holes, s.hole)
    if (!h?.played) continue
    const toPar = holeToPar(h, scoring)
    const isBirdie = points ? h.points >= 3 : toPar != null && toPar <= -1
    if (isBirdie) {
      const under = points ? h.points - 2 : -toPar!
      const grossUnder = !h.pickedUp && h.gross != null ? Math.max(0, h.par - h.gross) : 0
      let streak = 1
      while (birdieHoles.get(`${s.roundId}:${s.playerId}:${s.hole - streak}`)) streak++
      const firstOfDay = !birdieDays.has(s.roundId)
      birdieDays.add(s.roundId)
      push({ kind: 'birdie', at: s.updatedAt, roundNumber: rn, hole: s.hole, playerId: s.playerId, points: h.points, grossUnder, under, scoring, ...(firstOfDay ? { firstOfDay: true as const } : {}), ...(streak > 1 ? { streak } : {}) }, at)
    } else if (honoree && s.playerId === honoree) {
      push({ kind: 'honoreeHole', at: s.updatedAt, roundNumber: rn, hole: s.hole, playerId: s.playerId, points: h.points, toPar, scoring }, at)
    } else if (!snake && !h.pickedUp && h.putts != null && h.putts >= 3) {
      push({ kind: 'threePutt', at: s.updatedAt, roundNumber: rn, hole: s.hole, playerId: s.playerId, putts: h.putts }, at)
    }
    birdieHoles.set(`${s.roundId}:${s.playerId}:${s.hole}`, isBirdie)
    if (!opts.leaders) continue

    const counted = points ? h.points : (holeStrokes(h, scoring === 'net') ?? h.par) - h.par
    let row = slot.get(s.playerId)
    if (row === undefined) {
      row = ids.length
      slot.set(s.playerId, row)
      ids.push(s.playerId)
      totals.push(0)
    }
    totals[row] = totals[row]! + counted
    let best: Id | null = null
    let bestValue = 0
    let tie = false
    for (let i = 0; i < totals.length; i++) {
      const v = totals[i]!
      if (best == null || (points ? v > bestValue : v < bestValue)) {
        best = ids[i]!
        bestValue = v
        tie = false
      } else if (v === bestValue) tie = true
    }
    // Points: nobody leads on zero. Strokes: a lead needs at least two cards.
    // A tie in between changes nothing: the leader who retakes the lead alone
    // was announced already (STRAT-03), so only a new name is a change.
    const real = points ? bestValue > 0 : ids.length > 1
    if (best && !tie && real && best !== leader) {
      const previous = leader
      leader = best
      push({ kind: 'leadChange', at: s.updatedAt, roundNumber: rn, hole: s.hole, playerId: best, by: s.playerId, figure: points ? String(bestValue) : toParText(bestValue), scoring, ...(previous ? { previous } : {}) }, at)
    }
  }

  if (snake?.groups.some((g) => g.passes.some((p) => p.holderId))) {
    // A pass is dated by its holder's save of that hole: the first such row,
    // as a scan finds it. Only the holders' cards are indexed, by day, player and hole.
    const cards = new Map<Id, Map<Id, Map<number, Score>>>()
    for (const g of snake.groups) {
      for (const pass of g.passes) {
        if (!pass.holderId) continue
        let byPlayer = cards.get(g.roundId)
        if (!byPlayer) cards.set(g.roundId, (byPlayer = new Map<Id, Map<number, Score>>()))
        if (!byPlayer.has(pass.holderId)) byPlayer.set(pass.holderId, new Map())
      }
    }
    for (const s of snapshot.scores) {
      const card = cards.get(s.roundId)?.get(s.playerId)
      if (card && !card.has(s.hole)) card.set(s.hole, s)
    }
    for (const g of snake.groups) {
      for (const pass of g.passes) {
        if (!pass.holderId) continue
        const sc = cards.get(g.roundId)?.get(pass.holderId)?.get(pass.hole)
        push({ kind: 'snakePass', at: sc?.updatedAt ?? null, roundNumber: g.roundNumber, hole: pass.hole, playerId: pass.holderId, groupNumber: g.groupNumber }, timeKey(sc?.updatedAt))
      }
    }
  }

  events.sort(inOrder)
  return events
    .slice(-limit)
    .reverse()
    .map((x) => x.e)
}

