/**
 * Derived feed events (§6, §9.2): birdies, lead changes, snake passes and the
 * honoree's holes. Replayed from the scores in the order they were saved so
 * the ticker reads like it happened. Copy is rendered by the UI from `kind`.
 *
 * The feed speaks the main event's language (STRAT-03). Under Stableford a
 * birdie is worth its points and the leader has the most of them. Under
 * strokes a birdie is a score under par (net or gross, as the event counts)
 * and the leader is lowest against par over the holes played, which is how
 * the board ranks. Where the board ranks teams or matches, one player's
 * running total is nobody's lead, so the feed announces no leader at all.
 */
import type { Id, Snapshot } from '../types'
import type { CoreState, HoleResult } from './types'
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
      /** A gross birdie or better. */
      gross: boolean
      /** Strokes under par on the score the event counts (1 birdie, 2 eagle, 3 albatross). */
      under: number
      scoring: MainScoring
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
      /** The board's last word at the close (`computeTournament`), not a save's. */
      close?: true
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

export function computeFeed(snapshot: Snapshot, core: CoreState, snake: SnakeState | undefined, opts: FeedOptions = POINTS, limit = 40): FeedEvent[] {
  const roundNumber = new Map(snapshot.rounds.map((r) => [r.id, r.number]))
  const honoree = snapshot.players.find((p) => p.isHonoree)?.id ?? null
  const events: FeedEvent[] = []
  const { scoring } = opts
  const points = scoring === 'points'

  const scores = snapshot.scores
    .filter((s) => core.roundIds.includes(s.roundId))
    .map((s) => ({ s, rn: roundNumber.get(s.roundId) ?? 0 }))
    .sort((a, b) => (a.s.updatedAt ?? '').localeCompare(b.s.updatedAt ?? '') || a.rn - b.rn || a.s.hole - b.s.hole)

  // Running totals: Stableford points (more is better), or strokes against
  // par (less is better). A pick-up counts as net double bogey, as on the board.
  const totals = new Map<Id, number>()
  let leader: Id | null = null
  for (const { s, rn } of scores) {
    const h = core.rounds[s.roundId]?.[s.playerId]?.holes.find((x) => x.hole === s.hole)
    if (!h || !h.played) continue
    const toPar = holeToPar(h, scoring)
    const isBirdie = points ? h.points >= 3 : toPar != null && toPar <= -1
    if (isBirdie) {
      const under = points ? h.points - 2 : -toPar!
      events.push({ kind: 'birdie', at: s.updatedAt, roundNumber: rn, hole: s.hole, playerId: s.playerId, points: h.points, gross: !h.pickedUp && h.gross != null && h.gross <= h.par - 1, under, scoring })
    } else if (honoree && s.playerId === honoree) {
      events.push({ kind: 'honoreeHole', at: s.updatedAt, roundNumber: rn, hole: s.hole, playerId: s.playerId, points: h.points, toPar, scoring })
    }
    if (!opts.leaders) continue

    const counted = points ? h.points : (holeStrokes(h, scoring === 'net') ?? h.par) - h.par
    totals.set(s.playerId, (totals.get(s.playerId) ?? 0) + counted)
    let best: Id | null = null
    let bestValue = 0
    let tie = false
    for (const [pid, v] of totals) {
      if (best == null || (points ? v > bestValue : v < bestValue)) {
        best = pid
        bestValue = v
        tie = false
      } else if (v === bestValue) tie = true
    }
    // Points: nobody leads on zero. Strokes: a lead needs at least two cards.
    // A tie in between changes nothing: the leader who retakes the lead alone
    // was announced already (STRAT-03), so only a new name is a change.
    const real = points ? bestValue > 0 : totals.size > 1
    if (best && !tie && real && best !== leader) {
      leader = best
      events.push({ kind: 'leadChange', at: s.updatedAt, roundNumber: rn, hole: s.hole, playerId: best, figure: points ? String(bestValue) : toParText(bestValue), scoring })
    }
  }

  if (snake) {
    for (const g of snake.groups) {
      for (const pass of g.passes) {
        if (!pass.holderId) continue
        const sc = snapshot.scores.find((s) => s.roundId === g.roundId && s.playerId === pass.holderId && s.hole === pass.hole)
        events.push({ kind: 'snakePass', at: sc?.updatedAt ?? null, roundNumber: g.roundNumber, hole: pass.hole, playerId: pass.holderId, groupNumber: g.groupNumber })
      }
    }
  }

  events.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '') || a.roundNumber - b.roundNumber || a.hole - b.hole)
  return events.slice(-limit).reverse()
}

