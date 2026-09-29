/**
 * The main event: the standings everything else hangs off — the board, TV,
 * the ceremony, the share cards, the Calcutta's slots and the biggest prizes.
 *
 * It used to *be* Stableford. Now it runs whichever format the tournament
 * chose (§5.3 is one of four) and does the part that is the same whatever
 * they play: rank the entrants, break ties on countback, label the positions,
 * and split the prizes.
 */
import { countback, flattenRanks, rankBy, splitPrizes, type RankGroup } from '../../core/ranking'
import { formatFor, type Entrant, type Figure, type FormatStandings } from '../../formats'
import type { Explanation, Id } from '../../types'
import type { GameModule, ModuleContext, PrizeAward } from '../module'
import { fieldShape, individualPrizeAmounts } from '../../settings/prizeCheck'

export interface IndividualRow {
  /** The competitor: a player, or a team in a team format. */
  playerId: Id
  entrant: Entrant
  position: number
  tied: boolean
  label: string
  /** The headline figure, ready to show. */
  figure: Figure
  /** Figures per round, in round order. */
  perRound: Figure[]
  thru: number
  /** Explanation of the countback against the neighbour above (or the tie). */
  countbackWhy: Explanation | null
  /**
   * The ranking number, kept for anything that still reasons about points.
   * In a Stableford tournament this is the points total, as it always was.
   */
  total: number
}

export interface IndividualState {
  /** Which format produced these standings. */
  formatId: string
  /** Header for the headline column: "Puntos", "Gross", "Neto". */
  figureLabel: string
  /** Team formats rank teams, so a row covers more than one player. */
  byTeam: boolean
  rows: IndividualRow[]
  /** Tie groups in order (for prizes and the auction). */
  groups: RankGroup<Id>[]
  /** Last place tie group (may be several entrants). */
  lastPlace: Id[]
  prizes: Record<Id, { amount: number; why: Explanation }>
  final: boolean
  /** What the format wants the organizer to know (a match with no opponent…). */
  warnings: string[]
}

const EMPTY_COUNTBACK = { pointsByHole: new Map<number, number>(), holes: 18 }

/** The format's standings, ranked. Shared by the module and the Calcutta. */
function rankStandings(ctx: ModuleContext) {
  const format = formatFor(ctx.settings)
  const standings = format.standings(ctx)
  const up = format.higherIsBetter(ctx.settings)

  // An entrant with no card yet sorts last whichever way the figure counts.
  const rankValue = (id: Id) => {
    const f = standings.totals[id]
    if (!f || f.empty) return up ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
    return f.value
  }
  const compare = (a: Id, b: Id) => {
    const va = rankValue(a)
    const vb = rankValue(b)
    if (va !== vb) return up ? vb - va : va - vb
    return countback(standings.countback[a] ?? EMPTY_COUNTBACK, standings.countback[b] ?? EMPTY_COUNTBACK).result
  }
  const order = new Map(standings.entrants.map((e, i) => [e.id, i]))
  const groups = rankBy(
    standings.entrants.map((e) => e.id),
    compare,
    (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
  )
  return { format, standings, groups, rankValue }
}

/**
 * The finishing order as *player* ids, which is what the Calcutta pays on: it
 * auctions people, and a team's members all finished where their team did.
 * For an individual format this is the ranking unchanged.
 */
export function rankIndividual(ctx: ModuleContext): RankGroup<Id>[] {
  const { standings, groups } = rankStandings(ctx)
  const members = new Map(standings.entrants.map((e) => [e.id, e.playerIds]))
  return groups.map((g) => ({ position: g.position, members: g.members.flatMap((id) => members.get(id) ?? [id]) }))
}

export const individualModule: GameModule<IndividualState> = {
  id: 'individual',
  defaultLabel: 'Individual',

  compute(ctx) {
    const { format, standings, groups, rankValue } = rankStandings(ctx)
    const byId = new Map(standings.entrants.map((e) => [e.id, e]))
    const nameOf = (id: Id) => byId.get(id)?.name ?? id
    const ranked = flattenRanks(groups)

    const rows: IndividualRow[] = ranked.map((r, i) => {
      const entrant = byId.get(r.item)!
      const figure = standings.totals[r.item] ?? { value: 0, text: '—', empty: true }
      const neighbour = ranked[i - 1]
      let countbackWhy: Explanation | null = null
      if (neighbour && rankValue(neighbour.item) === rankValue(r.item)) {
        countbackWhy = explainCountback(ctx, standings, neighbour.item, r.item, nameOf, r.tied)
      }
      return {
        playerId: r.item,
        entrant,
        position: r.position,
        tied: r.tied,
        label: r.label,
        figure,
        perRound: ctx.core.roundIds.map((rid) => standings.perRound[r.item]?.[rid] ?? { value: 0, text: '—', empty: true }),
        thru: standings.thru[r.item] ?? 0,
        countbackWhy,
        total: figure.value,
      }
    })

    // No money until a hole has been played: an all-tied field on Calcutta
    // night is not a twelve-way split.
    const anyScores = Object.values(standings.thru).some((t) => t > 0)
    const prizeShares = anyScores || ctx.tournamentFinal ? splitPrizes(groups, individualPrizeAmounts(ctx.settings, fieldShape(ctx.snapshot, ctx.settings)), nameOf) : []
    const prizes: IndividualState['prizes'] = {}
    for (const s of prizeShares) prizes[s.item] = { amount: s.amount, why: s.why }

    return {
      formatId: format.id,
      figureLabel: format.figureLabel(ctx.settings),
      byTeam: standings.entrants.some((e) => e.isTeam),
      rows,
      groups,
      lastPlace: anyScores || ctx.tournamentFinal ? (groups.at(-1)?.members ?? []) : [],
      prizes,
      final: ctx.tournamentFinal,
      warnings: standings.warnings,
    }
  },

  prizes(state, ctx) {
    const label = ctx.settings.modules.individual.label
    const out: PrizeAward[] = []
    for (const row of state.rows) {
      const p = state.prizes[row.playerId]
      if (!p) continue
      // A team's prize is split between its members, so each is paid their share.
      const members = row.entrant.playerIds
      const each = Math.floor(p.amount / members.length)
      let remainder = p.amount - each * members.length
      for (const playerId of members) {
        const extra = remainder > 0 ? 1 : 0
        remainder -= extra
        out.push({
          moduleId: 'individual',
          label: `${label}, ${row.label}º`,
          playerId,
          amount: each + extra,
          final: state.final,
          why: members.length > 1 ? { title: p.why.title, steps: [...p.why.steps, `${row.entrant.name}: $${p.amount} ÷ ${members.length}`] } : p.why,
        })
      }
    }
    return out
  },
}

/** Why one entrant sits above another on an equal figure. */
function explainCountback(
  ctx: ModuleContext,
  standings: FormatStandings,
  aboveId: Id,
  id: Id,
  nameOf: (id: Id) => string,
  tied: boolean,
): Explanation {
  const lastRoundId = ctx.core.roundIds.at(-1) ?? ''
  const lastRound = ctx.snapshot.rounds.find((x) => x.id === lastRoundId)
  const lastN = lastRound?.number ?? ctx.core.roundIds.length
  const lastHole = lastRound?.holes ?? 18
  const empty = { pointsByHole: new Map<number, number>(), holes: 18 }
  const cb = countback(standings.countback[aboveId] ?? empty, standings.countback[id] ?? empty)
  const why: Explanation = {
    title: tied ? `Empate con ${nameOf(aboveId)}` : `Desempate con ${nameOf(aboveId)}`,
    steps: cb.steps.map((s) => `Día ${lastN}, ${s.label}: ${nameOf(aboveId)} ${s.a} – ${nameOf(id)} ${s.b}`),
  }
  if (cb.result === 0) why.steps.push(`Iguales hasta el hoyo ${lastHole}: se reparten los premios.`)
  return why
}
