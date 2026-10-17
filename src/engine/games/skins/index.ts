/**
 * Skins: on each hole the single lowest score (gross or net) among the
 * entrants wins a skin. A tie wins nothing and, with carry-over, the skin
 * rides to the next hole. Holes resolve in number order, one round at a
 * time; a skin still riding after the last hole of a round is not paid.
 *
 * A hole resolves once every entrant has played it (or the round is
 * finished: a hole nobody entered then counts as a tie).
 */
import type { GameOf } from '../../settings/games'
import type { Id } from '../../types'
import type { GameContext, GameImpl } from '../game'
import { msg, say, type Msg } from '../../messages'
import { directUnits, payUnits, refundUnwon, unwonWarning } from '../payout'
import { isFinal } from '../../core/ranking'
import { holeOf, holeScore, moneyByPlayer, namer, rankedUnits, roundHoles, roundNumberOf } from '../util'

type Cfg = GameOf<'skins'>

export interface SkinsHole {
  roundId: Id
  roundNumber: number
  hole: number
  /** Winner, or null for a tie / pending. */
  winnerId: Id | null
  /** Skins at stake on this hole (1 + carried). */
  value: number
  status: 'won' | 'tied' | 'pending'
  best: number | null
}

export interface SkinsState {
  holes: SkinsHole[]
  /** Skins won per entrant. */
  units: Record<Id, number>
  /** Skins still riding at the end of each round (not paid). */
  unclaimed: number
}

export const skinsGame: GameImpl<SkinsState, Cfg> = {
  type: 'skins',
  defaultLabel: 'Skins',
  compute(ctx) {
    const { basis, carryOver } = ctx.config.options
    const holes: SkinsHole[] = []
    const units: Record<Id, number> = Object.fromEntries(ctx.entrants.map((id) => [id, 0]))
    let unclaimed = 0
    for (const rid of ctx.roundIds) {
      const n = roundHoles(ctx, rid)
      const roundFinal = isFinal(ctx, 'roundsOrTournament', [rid])
      let carry = 0
      let blocked = false
      for (let hole = 1; hole <= n; hole++) {
        const value = 1 + carry
        const scores = ctx.entrants.map((id) => ({ id, h: holeOf(ctx, rid, id, hole) }))
        const allIn = scores.every((s) => s.h?.played)
        if (blocked || (!allIn && !roundFinal)) {
          blocked = true
          holes.push({ roundId: rid, roundNumber: roundNumberOf(ctx, rid), hole, winnerId: null, value, status: 'pending', best: null })
          continue
        }
        const valid = scores.map((s) => ({ id: s.id, v: holeScore(s.h, basis) })).filter((s): s is { id: Id; v: number } => s.v != null)
        const best = valid.length ? Math.min(...valid.map((s) => s.v)) : null
        const at = valid.filter((s) => s.v === best)
        if (at.length === 1) {
          units[at[0]!.id] = (units[at[0]!.id] ?? 0) + value
          holes.push({ roundId: rid, roundNumber: roundNumberOf(ctx, rid), hole, winnerId: at[0]!.id, value, status: 'won', best })
          carry = 0
        } else {
          holes.push({ roundId: rid, roundNumber: roundNumberOf(ctx, rid), hole, winnerId: null, value, status: 'tied', best })
          carry = carryOver ? value : 0
        }
      }
      if (!blocked) unclaimed += carry
    }
    return { holes, units, unclaimed }
  },
  prizes(state, ctx) {
    const units = new Map(Object.entries(state.units))
    const name = namer(ctx)
    if (ctx.config.money.source === 'direct') return directUnits(ctx, units, 'reward', 'skin', name)
    const paid = payUnits(ctx, units, 'skin', name)
    return paid.length ? paid : refundUnwon(ctx, 'skin')
  },
  board(state, ctx) {
    const money = moneyByPlayer(skinsGame.prizes(state, ctx))
    const standings = rankedUnits(Object.entries(state.units)).map(({ id, units: u, label }) => ({
      playerIds: [id],
      pos: label,
      figure: msg('board.units', { n: u, unit: 'skin' }),
      money: money.get(id) ?? 0,
    }))
    const log = state.holes
      .filter((h) => h.status === 'won')
      .map((h) => ({
        playerIds: [h.winnerId!],
        pos: null,
        label: msg('board.hole', { day: multiRound(ctx) ? h.roundNumber : null, hole: h.hole }),
        figure: msg('board.units', { n: h.value, unit: 'skin' }),
      }))
    const notes: Msg[] = []
    const riding = lastRiding(state)
    if (riding) notes.push(msg('board.skinsRiding', { n: riding.value, hole: riding.hole }))
    if (state.unclaimed) notes.push(msg('board.skinsUnclaimed', { n: state.unclaimed }))
    notes.push(msg('board.skinsRule', { net: ctx.config.options.basis === 'net', carry: ctx.config.options.carryOver }))
    if (ctx.config.money.source === 'direct') notes.push(msg('board.skinStake', { stake: ctx.config.money.stake }))
    return { sections: [{ rows: standings }, { title: say('board.byHole'), rows: log }], notes }
  },
  warnings(state, ctx) {
    return Object.values(state.units).some((u) => u > 0) ? [] : unwonWarning(ctx, 'skin')
  },
}

function lastRiding(state: SkinsState): SkinsHole | null {
  const pending = state.holes.find((h) => h.status === 'pending')
  return pending && pending.value > 1 ? pending : null
}

function multiRound(ctx: GameContext): boolean {
  return ctx.roundIds.length > 1
}
