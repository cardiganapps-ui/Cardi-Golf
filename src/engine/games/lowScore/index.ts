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
import { flattenRanks, rankBy, type RankGroup } from '../../core/ranking'
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
  const better = ctx.config.options.basis === 'points' ? (a: number, b: number) => b - a : (a: number, b: number) => a - b
  const played = ctx.entrants.filter((id) => vals.get(id)!.thru > 0)
  const groups = rankBy(played, (a, b) => better(vals.get(a)!.value, vals.get(b)!.value), (a, b) => order.get(a)! - order.get(b)!)
  const rows = flattenRanks(groups).map((r) => ({ playerId: r.item, label: r.label, ...vals.get(r.item)! }))
  const final = ctx.tournamentFinal || rids.every((rid) => ctx.roundFinal[rid])
  return { roundId, rows, groups, final }
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
      const label = (id: Id) => `${ctx.config.label}, ${day}${tb.rows.find((r) => r.playerId === id)?.label ?? ''}º`
      return payPlaces({ ...ctx, final: tb.final }, tb.groups, name, label, pot)
    })
  },
  board(state, ctx) {
    const money = moneyByPlayer(lowScoreGame.prizes(state, ctx))
    const fig = (v: number) => (ctx.config.options.basis === 'points' ? `${v} pts` : v === 0 ? 'E' : v > 0 ? `+${v}` : `${v}`)
    const sections: BoardSection[] = state.tables.map((tb) => ({
      title: tb.roundId && state.tables.length > 1 ? `Día ${roundNumberOf(ctx, tb.roundId)}` : undefined,
      rows: tb.rows.map((r) => ({ playerIds: [r.playerId], pos: r.label, figure: fig(r.value), sub: `${r.thru} hoyos`, money: money.get(r.playerId) ?? 0 })),
    }))
    const what = ctx.config.options.basis === 'points' ? 'Más puntos Stableford' : `Menor score ${ctx.config.options.basis === 'net' ? 'neto' : 'gross'} contra el par`
    const notes = [`${what}${ctx.config.options.scope === 'perRound' ? ', por día' : ''}.`]
    if (ctx.pot > 0) notes.push(`Bote ${fmt(ctx.pot)}: ${ctx.config.money.split.map((p) => `${p}%`).join(' / ')}.`)
    return { sections, notes }
  },
}
