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
import { ordinal } from '../../../i18n/es-MX'
import { flattenRanks, rankBy, type RankGroup } from '../../core/ranking'
import { toParText } from '../../formats/format'
import type { GameOf } from '../../settings/games'
import type { Id } from '../../types'
import type { BoardSection, GameContext, GameImpl } from '../game'
import { fmt, payPlaces } from '../payout'
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
  const better = points ? (a: number, b: number) => b - a : (a: number, b: number) => a - b
  const final = ctx.tournamentFinal || rids.every((rid) => ctx.roundFinal[rid])
  // To par over the holes played is fair while the round is on. At the end a
  // strokes prize goes to a full card: one hole at birdie must not beat 18 at
  // even (MONEY-02). Points need no rule, missing holes already score nothing.
  const holes = rids.reduce((sum, rid) => sum + (ctx.snapshot.rounds.find((r) => r.id === rid)?.holes ?? 18), 0)
  const played = ctx.entrants.filter((id) => vals.get(id)!.thru > 0)
  const missing = (id: Id) => (!points && final ? Math.max(0, holes - vals.get(id)!.thru) : 0)
  const incomplete = played.filter((id) => missing(id) > 0)
  // More holes played first, then the score: one hole at −1 is not a better card than 17 at +1.
  const groups = rankBy(played, (a, b) => missing(a) - missing(b) || better(vals.get(a)!.value, vals.get(b)!.value), (a, b) => order.get(a)! - order.get(b)!)
  const rows = flattenRanks(groups).map((r) => ({ playerId: r.item, label: r.label, ...vals.get(r.item)! }))
  return { roundId, rows, groups, final, incomplete, holes }
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
    const n = state.tables.length
    if (!n) return []
    const base = Math.floor(ctx.pot / n)
    return state.tables.flatMap((tb, i) => {
      const pot = base + (i === 0 ? ctx.pot - base * n : 0)
      const day = tb.roundId ? `Día ${roundNumberOf(ctx, tb.roundId)}, ` : ''
      const label = (id: Id) => `${ctx.config.label}, ${day}${ordinal(tb.rows.find((r) => r.playerId === id)?.label ?? '')}`
      return payPlaces({ ...ctx, final: tb.final }, tb.groups, name, label, pot)
    })
  },
  board(state, ctx) {
    const money = moneyByPlayer(lowScoreGame.prizes(state, ctx))
    const fig = (v: number) => (ctx.config.options.basis === 'points' ? `${v} pts` : toParText(v))
    const sections: BoardSection[] = state.tables.map((tb) => ({
      title: tb.roundId && state.tables.length > 1 ? `Día ${roundNumberOf(ctx, tb.roundId)}` : undefined,
      rows: tb.rows.map((r) => ({ playerIds: [r.playerId], pos: r.label, figure: fig(r.value), sub: `${r.thru} hoyos`, money: money.get(r.playerId) ?? 0 })),
    }))
    const what = ctx.config.options.basis === 'points' ? 'Más puntos Stableford' : `La tarjeta ${ctx.config.options.basis === 'net' ? 'neta' : 'gross'} más baja contra el par`
    const notes = [`${what}${ctx.config.options.scope === 'perRound' ? ', por día' : ''}.`]
    const names = namer(ctx)
    for (const tb of state.tables) {
      if (!tb.incomplete.length) continue
      const day = tb.roundId && state.tables.length > 1 ? `Día ${roundNumberOf(ctx, tb.roundId)}: ` : ''
      const who = tb.incomplete.map((id) => `${names(id)} (${tb.rows.find((r) => r.playerId === id)?.thru ?? 0} de ${tb.holes})`).join(', ')
      notes.push(`${day}tarjeta incompleta, hoyos jugados: ${who}. Queda${tb.incomplete.length === 1 ? '' : 'n'} después de las tarjetas completas.`)
    }
    if (ctx.pot > 0) notes.push(`Bote ${fmt(ctx.pot)}: ${ctx.config.money.split.map((p) => `${p}%`).join(' / ')}.`)
    return { sections, notes }
  },
}
