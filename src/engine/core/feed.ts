/**
 * Derived feed events (§6, §9.2): birdies, lead changes, snake passes and the
 * honoree's holes. Replayed from the scores in the order they were saved so
 * the ticker reads like it happened. Copy is rendered by the UI from `kind`.
 */
import type { Id, Snapshot } from '../types'
import type { CoreState } from './types'
import type { SnakeState } from '../modules/snake'

export type FeedEvent =
  | { kind: 'birdie'; at: string | null; roundNumber: number; hole: number; playerId: Id; points: number; gross: boolean }
  | { kind: 'leadChange'; at: string | null; roundNumber: number; hole: number; playerId: Id; total: number }
  | { kind: 'snakePass'; at: string | null; roundNumber: number; hole: number; playerId: Id; groupNumber: number }
  | { kind: 'honoreeHole'; at: string | null; roundNumber: number; hole: number; playerId: Id; points: number }

export function computeFeed(snapshot: Snapshot, core: CoreState, snake: SnakeState | undefined, limit = 40): FeedEvent[] {
  const roundNumber = new Map(snapshot.rounds.map((r) => [r.id, r.number]))
  const honoree = snapshot.players.find((p) => p.isHonoree)?.id ?? null
  const events: FeedEvent[] = []

  const scores = snapshot.scores
    .filter((s) => core.roundIds.includes(s.roundId))
    .map((s) => ({ s, rn: roundNumber.get(s.roundId) ?? 0 }))
    .sort((a, b) => (a.s.updatedAt ?? '').localeCompare(b.s.updatedAt ?? '') || a.rn - b.rn || a.s.hole - b.s.hole)

  const totals = new Map<Id, number>()
  let leader: Id | null = null
  for (const { s, rn } of scores) {
    const h = core.rounds[s.roundId]?.[s.playerId]?.holes.find((x) => x.hole === s.hole)
    if (!h || !h.played) continue
    if (h.points >= 3) {
      events.push({ kind: 'birdie', at: s.updatedAt, roundNumber: rn, hole: s.hole, playerId: s.playerId, points: h.points, gross: !h.pickedUp && h.gross != null && h.gross <= h.par - 1 })
    } else if (honoree && s.playerId === honoree) {
      events.push({ kind: 'honoreeHole', at: s.updatedAt, roundNumber: rn, hole: s.hole, playerId: s.playerId, points: h.points })
    }
    totals.set(s.playerId, (totals.get(s.playerId) ?? 0) + h.points)
    let best: Id | null = null
    let bestPts = 0
    let tie = false
    for (const [pid, pts] of totals) {
      if (pts > bestPts) {
        best = pid
        bestPts = pts
        tie = false
      } else if (pts === bestPts && pts > 0) tie = true
    }
    if (best && !tie && best !== leader && bestPts > 0) {
      leader = best
      events.push({ kind: 'leadChange', at: s.updatedAt, roundNumber: rn, hole: s.hole, playerId: best, total: bestPts })
    } else if (tie) leader = null
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
