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
  /** Has played every hole the field has played: only these compete for the prize. */
  complete: boolean
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
      // A picked-up hole counts at least the setting (§18.1): the player never holed out, so his count is a floor.
      const putts = h.pickedUp ? Math.max(h.putts ?? 0, ctx.settings.pickupPuttsForFewestPutts) : (h.putts ?? 0)
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
    // Fewest putts over the same number of holes: a player behind the field
    // (or who withdrew) ranks after everyone who has played more holes, so
    // the leader is never simply the one with the fewest holes.
    const maxHoles = Math.max(0, ...ids.map((id) => totals.get(id)!.holes))
    const groups = rankBy(
      ids,
      (a, b) => {
        const ta = totals.get(a)!
        const tb = totals.get(b)!
        if (ta.holes !== tb.holes) return tb.holes - ta.holes
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
        complete: t.holes > 0 && t.holes === maxHoles,
        average: t.holes ? Math.round((t.putts / t.holes) * 100) / 100 : 0,
        onePutts: t.onePutts,
        threePutts: t.threePutts,
        pickedUpHoles: t.pickedUpHoles,
      }
    })
    const prizes: FewestPuttsState['prizes'] = {}
    const anyPlayed = maxHoles > 0
    if (anyPlayed) {
      // The first group only holds players with `maxHoles` holes (the comparator sorts by holes first).
      const first = groups[0]!
      const winners = { ...first, members: first.members.filter((id) => totals.get(id)!.holes === maxHoles) }
      for (const s of splitPrizes([winners], [ctx.settings.prizes.fewestPutts], nameOf)) {
        const w = totals.get(s.item)!
        prizes[s.item] = { amount: s.amount, why: { ...s.why, steps: [`${w.putts} putts en ${w.holes} hoyos`, ...(w.pickedUpHoles ? [`Hoyos levantados: cuentan ${ctx.settings.pickupPuttsForFewestPutts} putts como mínimo`] : []), ...s.why.steps] } }
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
