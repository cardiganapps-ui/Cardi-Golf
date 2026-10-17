/**
 * Event pots: count birdies (or better), eagles (or better), or three-putts
 * for every entrant. Birdies and eagles win: the pot is split by count, or
 * every other entrant pays `stake` per event. Three-putts cost: the player
 * pays `stake` to every other entrant per three-putt.
 */
import type { GameOf } from '../../settings/games'
import type { Id } from '../../types'
import type { GameImpl } from '../game'
import { msg, say, type Msg } from '../../messages'
import { directUnits, payUnits, potNote, refundUnwon, unwonWarning } from '../payout'
import { moneyByPlayer, namer, rankedUnits, roundNumberOf } from '../util'

type Cfg = GameOf<'eventPot'>

export interface EventPotState {
  counts: Record<Id, number>
  /** Every event, in round and hole order. */
  events: Array<{ playerId: Id; roundId: Id; hole: number }>
}

export const eventPotGame: GameImpl<EventPotState, Cfg> = {
  type: 'eventPot',
  defaultLabel: 'Birdies',
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
    const unit = ctx.config.options.event
    if (ctx.config.money.source === 'direct')
      return directUnits(ctx, units, unit === 'threePutt' ? 'penalty' : 'reward', unit, name)
    const paid = payUnits(ctx, units, unit, name)
    return paid.length ? paid : refundUnwon(ctx, unit)
  },
  warnings(state, ctx) {
    return Object.values(state.counts).some((c) => c > 0) ? [] : unwonWarning(ctx, ctx.config.options.event)
  },
  board(state, ctx) {
    const unit = ctx.config.options.event
    const money = moneyByPlayer(eventPotGame.prizes(state, ctx))
    const rows = rankedUnits(Object.entries(state.counts)).map(({ id, units: c, label }) => ({
      playerIds: [id],
      pos: label,
      figure: msg('board.units', { n: c, unit }),
      money: money.get(id) ?? 0,
    }))
    const multi = ctx.roundIds.length > 1
    const log = state.events.map((e) => ({
      playerIds: [e.playerId],
      pos: null,
      label: msg('board.hole', { day: multi ? roundNumberOf(ctx, e.roundId) : null, hole: e.hole }),
      figure: msg('board.unit', { unit }),
    }))
    const notes: Msg[] = []
    const { event, basis } = ctx.config.options
    if (ctx.config.money.source === 'direct')
      notes.push(msg('board.eventStake', { unit, stake: ctx.config.money.stake }))
    else if (ctx.pot > 0) notes.push(potNote(ctx.config, ctx.pot, { unit }))
    if (event !== 'threePutt') notes.push(msg('board.eventRule', { net: basis === 'net', eagle: event === 'eagle' }))
    return { sections: [{ rows }, { title: say('board.byHole'), rows: log }], notes }
  },
}
