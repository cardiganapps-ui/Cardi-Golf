/**
 * Apuesta libre: anything the group bets on that the app cannot score (who
 * eats the most tacos, first to lose a ball in the water). The Comité marks
 * the winners and their shares (`game_results`).
 *
 * Money: a pot is split among the winners by share; direct bets make every
 * entrant who did not win pay `stake` to each winner.
 */
import type { GameOf } from '../../settings/games'
import type { Id } from '../../types'
import type { GameImpl } from '../game'
import { label, msg, type Msg } from '../../messages'
import { directUnits, payUnits, potNote } from '../payout'
import { moneyByPlayer, namer } from '../util'

type Cfg = GameOf<'custom'>

export interface CustomState {
  /** Winner → share weight. Empty until the Comité decides. */
  winners: Record<Id, number>
  decided: boolean
}

export const customGame: GameImpl<CustomState, Cfg> = {
  type: 'custom',
  defaultLabel: 'Apuesta libre',
  compute(ctx) {
    const inGame = new Set(ctx.entrants)
    const winners: Record<Id, number> = {}
    for (const r of ctx.snapshot.gameResults)
      if (r.gameId === ctx.config.id && inGame.has(r.playerId) && r.share > 0) winners[r.playerId] = r.share
    return { winners, decided: Object.keys(winners).length > 0 }
  },
  prizes(state, ctx) {
    if (!state.decided) return []
    const name = namer(ctx)
    const c = { ...ctx, final: true }
    if (ctx.config.money.source === 'direct') {
      // Every entrant who did not win pays the stake to each winner.
      const units = new Map(Object.keys(state.winners).map((id) => [id, 1]))
      const losers = ctx.entrants.filter((id) => !units.has(id))
      return directUnits({ ...c, entrants: [...losers, ...units.keys()] }, units, 'reward', 'bet', name).filter(
        (p) => !p.payerId || !units.has(p.payerId),
      )
    }
    // Shares may be fractional: scale to whole units first.
    const units = new Map(Object.entries(state.winners).map(([id, s]) => [id, Math.round(s * 100)]))
    return payUnits(c, units, 'part', name, c.pot, () => null)
  },
  board(state, ctx) {
    const money = moneyByPlayer(customGame.prizes(state, ctx))
    const rows = Object.keys(state.winners).map((id) => ({
      playerIds: [id],
      pos: '1',
      figure: msg('board.decidedWin', {}),
      money: money.get(id) ?? 0,
    }))
    const notes: Msg[] = []
    if (ctx.config.options.description) notes.push(label(ctx.config.options.description))
    notes.push(msg('board.customDecided', { decided: state.decided }))
    if (ctx.config.money.source === 'direct') notes.push(msg('board.customStake', { stake: ctx.config.money.stake }))
    else if (ctx.pot > 0) notes.push(potNote(ctx.config, ctx.pot, 'winners'))
    return { sections: [{ rows }], notes }
  },
}
