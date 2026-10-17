/**
 * Best round of the day (§5.4): per round, the highest single-round total.
 * Ties: countback within that day, then split. Final once that day is finished.
 */
import { countback, flattenRanks, isFinal, rankField, splitPrizes, type RankGroup } from '../../core/ranking'
import type { Explanation, Id } from '../../types'
import { msg, type Msg } from '../../messages'
import type { GameModule, PrizeAward } from '../module'

export interface BestRoundDay {
  roundId: Id
  roundNumber: number
  rows: Array<{ playerId: Id; position: number; label: string; points: number; thru: number }>
  groups: RankGroup<Id>[]
  winners: Record<Id, { amount: number; why: Explanation }>
  final: boolean
}

export interface BestRoundState {
  days: BestRoundDay[]
}

export const bestRoundModule: GameModule<BestRoundState, 'bestRound'> = {
  id: 'bestRound',
  defaultLabel: 'Mejor ronda',
  compute(ctx) {
    const nameOf = (id: Id) => ctx.snapshot.players.find((p) => p.id === id)?.displayName ?? id
    const order = new Map(ctx.snapshot.players.map((p) => [p.id, p.sortOrder]))
    const days: BestRoundDay[] = ctx.core.roundIds.map((rid) => {
      const byPlayer = ctx.core.rounds[rid] ?? {}
      const ids = Object.keys(byPlayer)
      const cb = (id: Id) => {
        const m = new Map<number, number>()
        for (const h of byPlayer[id]?.holes ?? []) m.set(h.hole, h.points)
        return { pointsByHole: m, holes: byPlayer[id]?.holes.length ?? 18 }
      }
      const groups = rankField(ids, {
        keys: [(id) => byPlayer[id]!.points],
        ties: { countback: cb },
        order: (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
      })
      const rows = flattenRanks(groups).map((r) => ({
        playerId: r.item,
        position: r.position,
        label: r.label,
        points: byPlayer[r.item]!.points,
        thru: byPlayer[r.item]!.thru,
      }))
      const roundNumber = byPlayer[ids[0] ?? '']?.roundNumber ?? ctx.snapshot.rounds.find((r) => r.id === rid)?.number ?? 0
      const winners: BestRoundDay['winners'] = {}
      const anyScores = ids.some((id) => byPlayer[id]!.thru > 0)
      if (anyScores) {
        const first = groups[0]!
        // Countback within the day (§5.4): explain the decision against the runner-up when the points tie.
        const second = groups[1]?.members[0]
        const tieWhy: Msg[] = []
        if (second && byPlayer[second]!.points === byPlayer[first.members[0]!]!.points) {
          const res = countback(cb(first.members[0]!), cb(second))
          tieWhy.push(...res.steps.map((st) => msg('bestRound.countback', { window: { from: st.from, to: st.to, total: st.total }, aName: nameOf(first.members[0]!), a: st.a, bName: nameOf(second), b: st.b })))
        }
        for (const s of splitPrizes(groups.slice(0, 1), [ctx.settings.prizes.bestRoundPerDay], nameOf)) {
          winners[s.item] = { amount: s.amount, why: { ...s.why, steps: [msg('bestRound.day', { points: byPlayer[s.item]!.points, day: roundNumber }), ...tieWhy, ...s.why.steps] } }
        }
      }
      return { roundId: rid, roundNumber, rows, groups, winners, final: isFinal(ctx, 'rounds', [rid]) }
    })
    return { days }
  },
  prizes(state, ctx) {
    const label = ctx.settings.modules.bestRound.label
    const out: PrizeAward[] = []
    for (const d of state.days) {
      for (const [playerId, w] of Object.entries(d.winners)) {
        out.push({
          moduleId: 'bestRound',
          label: `${label}, día ${d.roundNumber}`,
          playerId,
          amount: w.amount,
          final: d.final,
          why: w.why,
        })
      }
    }
    return out
  },
}
