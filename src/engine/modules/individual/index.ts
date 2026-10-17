/**
 * The main event: the standings everything else hangs off — the board, TV,
 * the ceremony, the share cards, the Calcutta's slots and the biggest prizes.
 *
 * It used to *be* Stableford. Now it runs whichever format the tournament
 * chose (§5.3 is one of four) and does the part that is the same whatever
 * they play: rank the entrants, break ties on countback, label the positions,
 * and split the prizes.
 */
import { label, msg, say, type MatchSide, type Msg } from '../../messages'
import { countback, flattenRanks, isFinal, onlyWithResult, rankField, splitEven, splitPrizes, unfilledPlaces, unfilledWarning, type RankGroup } from '../../core/ranking'
import { figureKind, formatFor, type Entrant, type Figure, type FormatStandings } from '../../formats'
import type { Explanation, Id } from '../../types'
import type { GameModule, ModuleContext, PrizeAward } from '../module'
import { prizeLabel } from '../../games/game'
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
  /** Header for the headline column: «Puntos», «Gross», «Neto». */
  figureLabel: Msg
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
  warnings: Msg[]
}

const EMPTY_COUNTBACK = { pointsByHole: new Map<number, number>(), holes: 18 }
/** Per hole missing: an incomplete card ranks after every complete one, and after any card with more holes. */
const INCOMPLETE_OFFSET = 1_000_000

/** The format's standings, ranked. Shared by the module and the Calcutta. */
function rankStandings(ctx: ModuleContext) {
  const format = formatFor(ctx.settings)
  const standings = format.standings(ctx)
  const up = format.higherIsBetter(ctx.settings)

  // Where fewer is better (strokes), the prize goes to a full card: once the
  // tournament is final, an entrant who did not finish every hole ranks after
  // everyone who did (MONEY-02). Points formats need no rule, the missing
  // holes already score nothing.
  const expectedHoles = ctx.core.roundIds.reduce((sum, rid) => sum + (ctx.snapshot.rounds.find((r) => r.id === rid)?.holes ?? 18), 0)
  const missing = (id: Id) => (!up && ctx.tournamentFinal && !standings.totals[id]?.empty ? Math.max(0, expectedHoles - (standings.thru[id] ?? 0)) : 0)
  const incomplete = (id: Id) => missing(id) > 0
  // An entrant with no card yet sorts last whichever way the figure counts.
  // Among incomplete cards, more holes played ranks first: one hole at −1 is
  // not a better card than 17 at +1.
  const rankValue = (id: Id) => {
    const f = standings.totals[id]
    if (!f || f.empty) return up ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
    return (f.rank ?? f.value) + missing(id) * INCOMPLETE_OFFSET
  }
  // The format's figure, then the countback on the last round (§5.3).
  const order = new Map(standings.entrants.map((e, i) => [e.id, i]))
  const groups = rankField(standings.entrants.map((e) => e.id), {
    keys: [(id) => (up ? rankValue(id) : -rankValue(id))],
    ties: { countback: (id) => standings.countback[id] ?? EMPTY_COUNTBACK },
    order: (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
  })
  return { format, standings, groups, rankValue, incomplete, expectedHoles }
}

function incompleteWarning(cards: Array<{ name: Msg; thru: number; of: number }>): Msg[] {
  if (!cards.length) return []
  return [msg('individual.incomplete', { cards })]
}

/**
 * The finishing order as *player* ids, which is what the Calcutta pays on: it
 * auctions people, and a team's members all finished where their team did.
 * For an individual format this is the ranking unchanged.
 *
 * `places` is how many finishing places the group fills: one per entrant. A
 * two-player team alone in 1st fills 1st only, so 2nd goes to the next team
 * (MONEY-20); before, its two members read as a tie across 1st and 2nd.
 *
 * Only entrants with a result, as the main event pays (MONEY-09): one who
 * never played a hole takes no place, so he cashes no Calcutta slot either,
 * La Cuchara included, and with nobody's result the Calcutta fills none
 * (round 3 of PR 104). `position` stays the leaderboard's place.
 */
export function rankIndividual(ctx: ModuleContext): Array<RankGroup<Id> & { places: number; entrants: Id[][] }> {
  const { standings, groups } = rankStandings(ctx)
  const members = new Map(standings.entrants.map((e) => [e.id, e.playerIds]))
  const out: Array<RankGroup<Id> & { places: number; entrants: Id[][] }> = []
  for (const g of groups) {
    const withResult = g.members.filter((id) => !standings.totals[id]?.empty)
    if (!withResult.length) continue
    const entrants = withResult.map((id) => members.get(id) ?? [id])
    out.push({ position: g.position, places: withResult.length, entrants, members: entrants.flat() })
  }
  return out
}

export const individualModule: GameModule<IndividualState, 'individual'> = {
  id: 'individual',
  defaultLabel: 'Individual',

  compute(ctx) {
    const { format, standings, groups, rankValue, incomplete, expectedHoles } = rankStandings(ctx)
    const byId = new Map(standings.entrants.map((e) => [e.id, e]))
    const nameOf = (id: Id) => byId.get(id)?.name ?? label(id)
    const ranked = flattenRanks(groups)

    const rows: IndividualRow[] = ranked.map((r, i) => {
      const entrant = byId.get(r.item)!
      const figure = standings.totals[r.item] ?? { value: 0, text: '—', empty: true }
      const neighbour = ranked[i - 1]
      let countbackWhy: Explanation | null = null
      if (neighbour && rankValue(neighbour.item) === rankValue(r.item)) {
        // Tied with the row above only when they share its place: a T2 row below a 1st won on countback is «Desempate».
        countbackWhy = explainCountback(ctx, standings, neighbour.item, r.item, nameOf, neighbour.position === r.position, format.higherIsBetter(ctx.settings))
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
    // night is not a twelve-way split. An entrant with no result (never
    // played, a fourball side with no match) takes no paid place (MONEY-09).
    const anyScores = Object.values(standings.thru).some((t) => t > 0)
    const paid = onlyWithResult(groups, (id) => !standings.totals[id]?.empty)
    const amounts = individualPrizeAmounts(ctx.settings, fieldShape(ctx.snapshot, ctx.settings))
    const prizeShares = anyScores || ctx.tournamentFinal ? splitPrizes(paid, amounts, nameOf) : []
    const prizes: IndividualState['prizes'] = {}
    for (const s of prizeShares) prizes[s.item] = { amount: s.amount, why: s.why }
    const byTeam = standings.entrants.some((e) => e.isTeam)
    const unfilled = ctx.tournamentFinal
      ? unfilledWarning(ctx.settings.modules.individual.label, unfilledPlaces(paid, amounts), paid.reduce((n, g) => n + g.members.length, 0), byTeam ? 'team' : 'player')
      : []

    return {
      formatId: format.id,
      figureLabel: format.figureLabel(ctx.settings),
      byTeam,
      rows,
      groups,
      lastPlace: anyScores || ctx.tournamentFinal ? (groups.at(-1)?.members ?? []) : [],
      prizes,
      final: isFinal(ctx, 'tournament'),
      warnings: [...standings.warnings, ...incompleteWarning(standings.entrants.filter((e) => incomplete(e.id)).map((e) => ({ name: e.name, thru: standings.thru[e.id] ?? 0, of: expectedHoles }))), ...unfilled],
    }
  },

  warnings(state) {
    return state.warnings
  },

  prizes(state, ctx) {
    const game = ctx.settings.modules.individual.label
    const kind = figureKind(ctx.settings)
    const out: PrizeAward[] = []
    for (const row of state.rows) {
      const p = state.prizes[row.playerId]
      if (!p) continue
      // COPY-19: where the prize comes from, in words: the place and the figure, and «si terminara ahora» while it runs.
      const where = msg('individual.where', { name: row.entrant.name, final: state.final, place: row.label, figure: row.figure.text, value: row.figure.value, kind })
      const steps = [where, ...p.why.steps]
      // A team's prize is split between its members, so each is paid their share.
      const members = row.entrant.playerIds
      const shares = splitEven(p.amount, members.length)
      members.forEach((playerId, i) => {
        const { amount, rounding: extra } = shares[i]!
        const each = amount - extra
        out.push({
          moduleId: 'individual',
          ...prizeLabel(game, msg('part.place', { place: row.label })),
          playerId,
          amount,
          final: state.final,
          // A member's line is titled with what the member is paid; the team's prize is a step (MONEY-15).
          why: members.length > 1 ? { title: msg('amount', { amount }), steps: [...steps, msg('individual.teamSplit', { team: row.entrant.name, n: members.length, total: p.amount, each, rounding: extra })] } : { ...p.why, steps },
        })
      })
    }
    return out
  },
}

/**
 * Why one entrant sits above another on an equal figure.
 *
 * `up`: the format counts up (points, matches). When it counts strokes, the
 * countback holds strokes to par negated so that more is better; the lines
 * turn them back into to-par figures («+4», «E», «−1»), or a player 3 over
 * would read as 3 under.
 */
function explainCountback(
  ctx: ModuleContext,
  standings: FormatStandings,
  aboveId: Id,
  id: Id,
  nameOf: (id: Id) => Msg,
  tied: boolean,
  up: boolean,
): Explanation {
  const lastRoundId = ctx.core.roundIds.at(-1) ?? ''
  const lastRound = ctx.snapshot.rounds.find((x) => x.id === lastRoundId)
  const lastN = lastRound?.number ?? ctx.core.roundIds.length
  const lastHole = lastRound?.holes ?? 18
  const empty = { pointsByHole: new Map<number, number>(), holes: 18 }
  const cb = countback(standings.countback[aboveId] ?? empty, standings.countback[id] ?? empty)
  const title = msg('countback.title', { name: nameOf(aboveId), tied })
  if (ctx.settings.modules.individual.format === 'matchPlay') {
    // Match play's countback is the last day's match, holes up (the Reglamento says so), not the last holes' scores.
    const a = standings.countback[aboveId]?.pointsByHole.get(1) ?? 0
    const b = standings.countback[id]?.pointsByHole.get(1) ?? 0
    // The last day as it stands: not played yet, under way, or over.
    const dayA = standings.perRound[aboveId]?.[lastRoundId]
    const dayB = standings.perRound[id]?.[lastRoundId]
    const notPlayed = (d: typeof dayA) => !d || d.empty
    const over = lastRound?.status === 'finished'
    // Each side on its own when they differ: one match over or not started is not the other's «empatado».
    const side = (d: typeof dayA): MatchSide => (notPlayed(d) ? (over ? 'notPlayed' : 'notOut') : d!.result ? 'done' : 'going')
    const match =
      notPlayed(dayA) && notPlayed(dayB)
        ? msg('countback.matchNone', { day: lastN, over })
        : !notPlayed(dayA) && !notPlayed(dayB) && !!dayA!.result === !!dayB!.result
          ? msg('countback.matchSame', { day: lastN, done: !!dayA!.result, aName: nameOf(aboveId), a, bName: nameOf(id), b })
          : msg('countback.matchSides', { day: lastN, aName: nameOf(aboveId), aSide: side(dayA), a, bName: nameOf(id), bSide: side(dayB), b })
    return {
      title,
      steps: [say('countback.matchPoints'), match, ...(a === b ? [say('countback.matchShare')] : [])],
    }
  }
  const why: Explanation = {
    title,
    steps: cb.steps.map((s) => msg('countback.line', { day: lastN, window: { from: s.from, to: s.to, total: s.total }, aName: nameOf(aboveId), a: s.a, bName: nameOf(id), b: s.b, up })),
  }
  if (cb.result === 0) why.steps.push(msg('countback.equalTo', { hole: lastHole }))
  return why
}
