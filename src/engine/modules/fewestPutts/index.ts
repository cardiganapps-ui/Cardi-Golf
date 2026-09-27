/**
 * Fewest putts (§5.7): lowest total putts over all rounds. Picked-up holes
 * count `pickupPuttsForFewestPutts` (§18.1). Tie: split.
 */
import { flattenRanks, rankBy, splitPrizes, type RankGroup } from '../../core/ranking'
import type { Explanation, Id } from '../../types'
import type { GameModule, ModuleContext, PrizeAward } from '../module'

export interface PuttsRow {
  playerId: Id
  position: number
  label: string
  putts: number
  holes: number
  /** Putts per hole, 2 decimals. */
  average: number
  onePutts: number
  threePutts: number
  pickedUpHoles: number
}

export interface FewestPuttsState {
  rows: PuttsRow[]
  groups: RankGroup<Id>[]
  prizes: Record<Id, { amount: number; why: Explanation }>
  final: boolean
}

export function puttsTotals(ctx: ModuleContext, playerId: Id) {
  const t = { putts: 0, holes: 0, onePutts: 0, threePutts: 0, pickedUpHoles: 0 }
  const threshold = ctx.settings.modules.snake.puttsThreshold
  for (const rid of ctx.core.roundIds) {
    for (const h of ctx.core.rounds[rid]?.[playerId]?.holes ?? []) {
      if (!h.played) continue
      t.holes++
      const putts = h.pickedUp && h.putts == null ? ctx.settings.pickupPuttsForFewestPutts : (h.putts ?? 0)
      if (h.pickedUp) t.pickedUpHoles++
      t.putts += putts
      if (putts === 1) t.onePutts++
      if (putts >= threshold) t.threePutts++
    }
  }
  return t
}

export const fewestPuttsModule: GameModule<FewestPuttsState> = {
  id: 'fewestPutts',
  defaultLabel: 'Menos putts',
  compute(ctx) {
    const nameOf = (id: Id) => ctx.snapshot.players.find((p) => p.id === id)?.displayName ?? id
    const order = new Map(ctx.snapshot.players.map((p) => [p.id, p.sortOrder]))
    const totals = new Map(ctx.snapshot.players.map((p) => [p.id, puttsTotals(ctx, p.id)]))
    const ids = ctx.snapshot.players.map((p) => p.id)
    // Only players who have played count for the prize; fewer putts first.
    const groups = rankBy(
      ids,
      (a, b) => {
        const ta = totals.get(a)!
        const tb = totals.get(b)!
        if (ta.holes === 0 && tb.holes === 0) return 0
        if (ta.holes === 0) return 1
        if (tb.holes === 0) return -1
        return ta.putts - tb.putts
      },
      (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
    )
    const rows: PuttsRow[] = flattenRanks(groups).map((r) => {
      const t = totals.get(r.item)!
      return {
        playerId: r.item,
        position: r.position,
        label: r.label,
        putts: t.putts,
        holes: t.holes,
        average: t.holes ? Math.round((t.putts / t.holes) * 100) / 100 : 0,
        onePutts: t.onePutts,
        threePutts: t.threePutts,
        pickedUpHoles: t.pickedUpHoles,
      }
    })
    const prizes: FewestPuttsState['prizes'] = {}
    const anyPlayed = rows.some((r) => r.holes > 0)
    if (anyPlayed) {
      const first = groups[0]!
      const winners = { ...first, members: first.members.filter((id) => totals.get(id)!.holes > 0) }
      for (const s of splitPrizes([winners], [ctx.settings.prizes.fewestPutts], nameOf)) {
        prizes[s.item] = { amount: s.amount, why: s.why }
      }
    }
    return { rows, groups, prizes, final: ctx.tournamentFinal }
  },
  prizes(state, ctx) {
    const label = ctx.settings.modules.fewestPutts.label
    return Object.entries(state.prizes).map(([playerId, p]): PrizeAward => ({
      moduleId: 'fewestPutts',
      label,
      playerId,
      amount: p.amount,
      final: state.final,
      why: p.why,
    }))
  },
}
