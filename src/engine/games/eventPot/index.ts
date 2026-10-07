/**
 * Event pots: count birdies (or better), eagles (or better), or three-putts
 * for every entrant. Birdies and eagles win: the pot is split by count, or
 * every other entrant pays `stake` per event. Three-putts cost: the player
 * pays `stake` to every other entrant per three-putt.
 */
import type { GameOf } from '../../settings/games'
import type { Id } from '../../types'
import type { GameImpl } from '../game'
import { directUnits, fmt, payUnits, refundUnwon, unwonWarning } from '../payout'
import { moneyByPlayer, namer, plural, rankLabel, roundNumberOf } from '../util'

type Cfg = GameOf<'eventPot'>

export interface EventPotState {
  counts: Record<Id, number>
  /** Every event, in round and hole order. */
  events: Array<{ playerId: Id; roundId: Id; hole: number }>
}

const NAMES: Record<Cfg['options']['event'], [string, string]> = {
  birdie: ['birdie', 'birdies'],
  eagle: ['águila', 'águilas'],
  threePutt: ['tres putts', 'tres putts'],
}

export const eventPotGame: GameImpl<EventPotState, Cfg> = {
  type: 'eventPot',
  defaultLabel: 'Bote de birdies',
  compute(ctx) {
    const { event, basis } = ctx.config.options
    const counts: Record<Id, number> = Object.fromEntries(ctx.entrants.map((id) => [id, 0]))
    const events: EventPotState['events'] = []
    for (const rid of ctx.roundIds) {
      for (const id of ctx.entrants) {
        for (const h of ctx.core.rounds[rid]?.[id]?.holes ?? []) {
          if (!h.played) continue
          let hit = false
          if (event === 'threePutt') hit = (h.putts ?? 0) >= 3
          else if (!h.pickedUp && h.gross != null) {
            const score = basis === 'gross' ? h.gross : h.gross - h.strokesReceived
            hit = score <= h.par - (event === 'eagle' ? 2 : 1)
          }
          if (hit) {
            counts[id]! += 1
            events.push({ playerId: id, roundId: rid, hole: h.hole })
          }
        }
      }
    }
    return { counts, events }
  },
  prizes(state, ctx) {
    const units = new Map(Object.entries(state.counts))
    const name = namer(ctx)
    const unit = NAMES[ctx.config.options.event]
    if (ctx.config.money.source === 'direct') return directUnits(ctx, units, ctx.config.options.event === 'threePutt' ? 'penalty' : 'reward', unit, name)
    const paid = payUnits(ctx, units, unit, name)
    return paid.length ? paid : refundUnwon(ctx, `un ${unit[0]}`)
  },
  warnings(state, ctx) {
    return Object.values(state.counts).some((c) => c > 0) ? [] : unwonWarning(ctx, `un ${NAMES[ctx.config.options.event][0]}`)
  },
  board(state, ctx) {
    const unit = NAMES[ctx.config.options.event]
    const money = moneyByPlayer(eventPotGame.prizes(state, ctx))
    const sorted = Object.entries(state.counts).sort((a, b) => b[1] - a[1])
    const rows = sorted.map(([id, c], i) => ({ playerIds: [id], pos: rankLabel(sorted.map((x) => x[1]), i), figure: plural(c, unit[0], unit[1]), money: money.get(id) ?? 0 }))
    const multi = ctx.roundIds.length > 1
    const log = state.events.map((e) => ({ playerIds: [e.playerId], pos: null, label: `${multi ? `Día ${roundNumberOf(ctx, e.roundId)}, ` : ''}hoyo ${e.hole}`, figure: unit[0] }))
    const notes: string[] = []
    const { event, basis } = ctx.config.options
    if (ctx.config.money.source === 'direct') notes.push(event === 'threePutt' ? `Cada tres putts le cuesta ${fmt(ctx.config.money.stake)} a quien los hace, para cada uno de los demás.` : `Cada ${unit[0]} cobra ${fmt(ctx.config.money.stake)} de cada uno de los demás.`)
    else if (ctx.pot > 0) notes.push(`Bote ${fmt(ctx.pot)}, se reparte por cada ${unit[0]}.`)
    if (event !== 'threePutt') notes.push(`${basis === 'net' ? 'Neto' : 'Gross'}, ${event === 'eagle' ? 'águila' : 'birdie'} o mejor.`)
    return { sections: [{ rows }, { title: 'Hoyo por hoyo', rows: log }], notes }
  },
}
