/**
 * Low score: lowest gross or net (to par), or most Stableford points, over
 * the game's rounds (`overall`) or per round (`perRound`, the pot is split
 * evenly between rounds). Paid by places with the game's percent split; ties
 * share the places they occupy.
 *
 * A picked-up hole counts as net double bogey (par + strokes received + 2),
 * the same cap Stableford uses. Standings compare "to par" over the holes
 * played so far, so players on different holes line up fairly.
 */
import {
  flattenRanks,
  isFinal,
  rankField,
  splitEven,
  unfilledPlaces,
  unfilledWarning,
  type RankGroup,
} from '../../core/ranking'
import { msg, type Msg } from '../../messages'
import type { GameOf } from '../../settings/games'
import type { Id } from '../../types'
import type { BoardSection, GameContext, GameImpl } from '../game'
import { payPlaces, placeAmounts, potNote } from '../payout'
import { moneyByPlayer, namer, roundNumberOf } from '../util'

type Cfg = GameOf<'lowScore'>

export interface LowScoreRow {
  playerId: Id
  label: string
  /** To par (gross/net, lower is better) or points (higher is better). */
  value: number
  thru: number
}

export interface LowScoreTable {
  /** null = overall. */
  roundId: Id | null
  rows: LowScoreRow[]
  groups: RankGroup<Id>[]
  final: boolean
  /** Final, on strokes, and short of the holes: ranked after every complete card (MONEY-02). */
  incomplete: Id[]
  /** Holes a complete card has over these rounds. */
  holes: number
}

export interface LowScoreState {
  tables: LowScoreTable[]
}

function playerValue(ctx: GameContext<Cfg>, rids: Id[], id: Id): { value: number; thru: number } {
  const basis = ctx.config.options.basis
  let value = 0
  let thru = 0
  for (const rid of rids) {
    for (const h of ctx.core.rounds[rid]?.[id]?.holes ?? []) {
      if (!h.played) continue
      thru++
      if (basis === 'points') value += h.points
      else {
        const gross = h.pickedUp || h.gross == null ? h.par + h.strokesReceived + 2 : h.gross
        value += (basis === 'gross' ? gross : gross - h.strokesReceived) - h.par
      }
    }
  }
  return { value, thru }
}

function table(ctx: GameContext<Cfg>, rids: Id[], roundId: Id | null): LowScoreTable {
  const order = new Map(ctx.entrants.map((id, i) => [id, i]))
  const vals = new Map(ctx.entrants.map((id) => [id, playerValue(ctx, rids, id)]))
  const points = ctx.config.options.basis === 'points'
  // A table over no rounds at all reads as final: it has nothing left to play.
  const final = isFinal(ctx, 'roundsOrTournament', rids, true)
  // To par over the holes played is fair while the round is on. At the end a
  // strokes prize goes to a full card: one hole at birdie must not beat 18 at
  // even (MONEY-02). Points need no rule, missing holes already score nothing.
  const holes = rids.reduce((sum, rid) => sum + (ctx.snapshot.rounds.find((r) => r.id === rid)?.holes ?? 18), 0)
  const played = ctx.entrants.filter((id) => vals.get(id)!.thru > 0)
  const missing = (id: Id) => (!points && final ? Math.max(0, holes - vals.get(id)!.thru) : 0)
  const incomplete = played.filter((id) => missing(id) > 0)
  // More holes played first, then the score: one hole at −1 is not a better card than 17 at +1. Ties share (no countback).
  const groups = rankField(played, {
    keys: [(id) => -missing(id), (id) => (points ? vals.get(id)!.value : -vals.get(id)!.value)],
    ties: 'share',
    order: (a, b) => order.get(a)! - order.get(b)!,
  })
  const rows = flattenRanks(groups).map((r) => ({ playerId: r.item, label: r.label, ...vals.get(r.item)! }))
  return { roundId, rows, groups, final, incomplete, holes }
}

/** Per round, the pot splits evenly between the tables, the rounding pesos to the first. */
function tablePots(state: LowScoreState, ctx: GameContext<Cfg>): number[] {
  return splitEven(ctx.pot, state.tables.length, 'first').map((s) => s.amount)
}

export const lowScoreGame: GameImpl<LowScoreState, Cfg> = {
  type: 'lowScore',
  defaultLabel: 'Low neto',
  compute(ctx) {
    if (ctx.config.options.scope === 'perRound') return { tables: ctx.roundIds.map((rid) => table(ctx, [rid], rid)) }
    return { tables: [table(ctx, ctx.roundIds, null)] }
  },
  prizes(state, ctx) {
    const name = namer(ctx)
    const pots = tablePots(state, ctx)
    return state.tables.flatMap((tb, i) => {
      const pot = pots[i]!
      const day = tb.roundId ? roundNumberOf(ctx, tb.roundId) : null
      const part = (id: Id) => msg('part.dayPlace', { day, place: tb.rows.find((r) => r.playerId === id)?.label ?? '' })
      return payPlaces({ ...ctx, final: tb.final }, tb.groups, name, part, pot)
    })
  },
  warnings(state, ctx) {
    // Once the tournament is over: a place with a prize that no entrant with a card filled (MONEY-09).
    if (!ctx.tournamentFinal || ctx.pot <= 0 || !state.tables.length) return []
    const pots = tablePots(state, ctx)
    return state.tables.flatMap((tb, i) => {
      const pot = pots[i]!
      return unfilledWarning(
        ctx.config.label,
        unfilledPlaces(tb.groups, placeAmounts(pot, ctx.config.money.split)),
        tb.rows.length,
        'player',
        tb.roundId ? roundNumberOf(ctx, tb.roundId) : null,
      )
    })
  },
  board(state, ctx) {
    const money = moneyByPlayer(lowScoreGame.prizes(state, ctx))
    const fig = (v: number): Msg =>
      ctx.config.options.basis === 'points' ? msg('pts', { n: v }) : msg('board.toPar', { n: v })
    const sections: BoardSection[] = state.tables.map((tb) => ({
      title:
        tb.roundId && state.tables.length > 1 ? msg('board.day', { day: roundNumberOf(ctx, tb.roundId) }) : undefined,
      rows: tb.rows.map((r) => ({
        playerIds: [r.playerId],
        pos: r.label,
        figure: fig(r.value),
        sub: msg('board.holes', { n: r.thru }),
        money: money.get(r.playerId) ?? 0,
      })),
    }))
    const notes: Msg[] = [
      msg('board.lowRule', { basis: ctx.config.options.basis, perRound: ctx.config.options.scope === 'perRound' }),
    ]
    const names = namer(ctx)
    for (const tb of state.tables) {
      if (!tb.incomplete.length) continue
      const day = tb.roundId && state.tables.length > 1 ? roundNumberOf(ctx, tb.roundId) : null
      notes.push(
        msg('board.lowIncomplete', {
          day,
          who: tb.incomplete.map((id) => ({
            name: names(id),
            thru: tb.rows.find((r) => r.playerId === id)?.thru ?? 0,
          })),
          holes: tb.holes,
        }),
      )
    }
    if (ctx.pot > 0) notes.push(potNote(ctx.config, ctx.pot, { places: ctx.config.money.split }))
    return { sections, notes }
  },
}
