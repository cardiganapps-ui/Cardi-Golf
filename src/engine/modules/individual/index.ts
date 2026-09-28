/**
 * Individual Stableford (§5.3): the main event. Standings with countback on
 * the last round, `T` labels, prize splitting, and last place.
 */
import { countback, flattenRanks, rankBy, splitPrizes, type RankGroup } from '../../core/ranking'
import type { Explanation, Id } from '../../types'
import type { GameModule, ModuleContext, PrizeAward } from '../module'
import { fieldShape, individualPrizeAmounts } from '../../settings/prizeCheck'

export interface IndividualRow {
  playerId: Id
  position: number
  tied: boolean
  label: string
  total: number
  /** Points per round, in round order. */
  perRound: number[]
  thru: number
  /** Explanation of the countback against the neighbour above (or the tie). */
  countbackWhy: Explanation | null
}

export interface IndividualState {
  rows: IndividualRow[]
  /** Tie groups in order (for prizes and the auction). */
  groups: RankGroup<Id>[]
  /** Last place tie group (may be several players). */
  lastPlace: Id[]
  prizes: Record<Id, { amount: number; why: Explanation }>
  final: boolean
}

function lastRoundPoints(ctx: ModuleContext, playerId: Id) {
  const rid = ctx.core.roundIds.at(-1)
  const pr = rid ? ctx.core.rounds[rid]?.[playerId] : undefined
  const m = new Map<number, number>()
  for (const h of pr?.holes ?? []) m.set(h.hole, h.points)
  return { pointsByHole: m, holes: pr?.holes.length ?? 18 }
}

/** Higher total first, then countback on the last round. */
export function compareIndividual(ctx: ModuleContext, a: Id, b: Id): number {
  const ta = ctx.core.totals[a]?.points ?? 0
  const tb = ctx.core.totals[b]?.points ?? 0
  if (ta !== tb) return tb - ta
  if (ctx.core.roundIds.length < 2) {
    // One round: the countback runs within that round (same windows), but the
    // "total" step is already equal, so it falls through to the back nine.
  }
  return countback(lastRoundPoints(ctx, a), lastRoundPoints(ctx, b)).result
}

export function rankIndividual(ctx: ModuleContext): RankGroup<Id>[] {
  const ids = ctx.snapshot.players.map((p) => p.id)
  const order = new Map(ctx.snapshot.players.map((p) => [p.id, p.sortOrder]))
  return rankBy(
    ids,
    (a, b) => compareIndividual(ctx, a, b),
    (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
  )
}

export const individualModule: GameModule<IndividualState> = {
  id: 'individual',
  defaultLabel: 'Individual',
  compute(ctx) {
    const groups = rankIndividual(ctx)
    const ranked = flattenRanks(groups)
    const nameOf = (id: Id) => ctx.snapshot.players.find((p) => p.id === id)?.displayName ?? id
    const rows: IndividualRow[] = ranked.map((r, i) => {
      const total = ctx.core.totals[r.item]?.points ?? 0
      const perRound = ctx.core.roundIds.map((rid) => ctx.core.rounds[rid]?.[r.item]?.points ?? 0)
      let countbackWhy: Explanation | null = null
      const neighbour = ranked[i - 1]
      if (neighbour && (ctx.core.totals[neighbour.item]?.points ?? 0) === total) {
        const cb = countback(lastRoundPoints(ctx, neighbour.item), lastRoundPoints(ctx, r.item))
        const lastRoundId = ctx.core.roundIds.at(-1) ?? ''
        const lastRound = ctx.snapshot.rounds.find((x) => x.id === lastRoundId)
        const lastN = lastRound?.number ?? ctx.core.roundIds.length
        const lastHole = lastRound?.holes ?? 18
        countbackWhy = {
          title: r.tied ? `Empate con ${nameOf(neighbour.item)}` : `Desempate con ${nameOf(neighbour.item)}`,
          steps: cb.steps.map((s) => `Día ${lastN}, ${s.label}: ${nameOf(neighbour.item)} ${s.a} – ${nameOf(r.item)} ${s.b}`),
        }
        if (cb.result === 0) countbackWhy.steps.push(`Iguales hasta el hoyo ${lastHole}: se reparten los premios.`)
      }
      return {
        playerId: r.item,
        position: r.position,
        tied: r.tied,
        label: r.label,
        total,
        perRound,
        thru: ctx.core.totals[r.item]?.thru ?? 0,
        countbackWhy,
      }
    })
    // No money until a hole has been played: an all-tied field on Calcutta night is not a 12-way split.
    const anyScores = Object.values(ctx.core.totals).some((t) => t.thru > 0)
    const prizeShares = anyScores || ctx.tournamentFinal ? splitPrizes(groups, individualPrizeAmounts(ctx.settings, fieldShape(ctx.snapshot, ctx.settings)), nameOf) : []
    const prizes: IndividualState['prizes'] = {}
    for (const s of prizeShares) prizes[s.item] = { amount: s.amount, why: s.why }
    return {
      rows,
      groups,
      lastPlace: anyScores || ctx.tournamentFinal ? (groups.at(-1)?.members ?? []) : [],
      prizes,
      final: ctx.tournamentFinal,
    }
  },
  prizes(state, ctx) {
    const label = ctx.settings.modules.individual.label
    const out: PrizeAward[] = []
    for (const row of state.rows) {
      const p = state.prizes[row.playerId]
      if (!p) continue
      out.push({
        moduleId: 'individual',
        label: `${label}, ${row.label}º`,
        playerId: row.playerId,
        amount: p.amount,
        final: state.final,
        why: p.why,
      })
    }
    return out
  },
}
