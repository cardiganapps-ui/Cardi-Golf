/**
 * Shared money helpers for instance games: split a pot by places or by units
 * won, or turn units into direct bets between entrants. All whole pesos; any
 * remainder goes one peso at a time to the first winners in order.
 */
import type { GameConfig } from '../settings/games'
import type { Explanation, Id } from '../types'
import type { PrizeAward } from '../modules/module'
import type { RankGroup } from '../core/ranking'
import { splitPrizes, splitWhole } from '../core/ranking'
import { percentPlaces } from '../settings/prizeCheck'
import { pesos } from '../core/pesos'
import type { GameContext } from './game'
import { t, unitWord } from '../../i18n/es-MX'
import { msg, type GameUnit, type Msg } from '../messages'

/** The engine's peso formatter (core/pesos.ts), under the name the games use. */
export const fmt = pesos

/**
 * A game's money in words (COPY-14): «el bote de $1,600» when its entrants put it in, «el premio de $1,600 (sale de
 * la bolsa)» when it comes from the inscriptions. A «bote» is only ever what a game's own entrants paid.
 */
export function potWords(config: GameConfig, pot: number): string {
  return config.money.source === 'side' ? `el bote de ${fmt(pot)}` : `el premio de ${fmt(pot)} (sale de la bolsa)`
}

/** The same at the start of a sentence: «El bote de $1,600». */
export function PotWords(config: GameConfig, pot: number): string {
  const w = potWords(config, pot)
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/** A split by places in words: «60% al 1.º y 40% al 2.º». */
export function splitWords(split: number[]): string {
  return t.common.andList(split.map((p, i) => `${p}% al ${i + 1}.º`))
}

/** The pot a game's money config funds. */
export function gamePot(config: GameConfig, entrants: number): number {
  if (config.money.source === 'main') return config.money.amount
  if (config.money.source === 'side') return config.money.buyIn * entrants
  return 0
}

/** Where a game's prizes come from, for `PrizeAward.potId`. */
export function potIdOf(config: GameConfig): string {
  return config.money.source === 'side' ? config.id : 'main'
}

/** Whole-peso amounts for percent places: floor each, remainder to 1st (the prize check's own rule). */
export const placeAmounts = percentPlaces

function award(ctx: GameContext, playerId: Id, amount: number, why: Explanation, label: string, payerId?: Id): PrizeAward {
  return {
    moduleId: ctx.config.type,
    gameId: ctx.config.id,
    potId: payerId ? undefined : potIdOf(ctx.config),
    payerId,
    label,
    playerId,
    amount,
    final: ctx.final,
    why,
  }
}

/** Pay a pot by places to ranked groups (ties split the places they occupy). */
export function payPlaces(ctx: GameContext, groups: RankGroup<Id>[], name: (id: Id) => string, labelFor: (id: Id) => string, pot = ctx.pot): PrizeAward[] {
  if (pot <= 0) return []
  const amounts = placeAmounts(pot, ctx.config.money.split)
  const head = msg('game.places', { pot, side: ctx.config.money.source === 'side', split: ctx.config.money.split })
  return splitPrizes(groups, amounts, name).map((s) => award(ctx, s.item, s.amount, { ...s.why, steps: [head, ...s.why.steps] }, labelFor(s.item)))
}

/**
 * Pay a pot by units won (skins, birdies, contest wins): each unit is worth
 * pot ÷ units. Pesos left over by the division go to the players with the
 * most units first. Returns nothing when nobody won a unit.
 */
export function payUnits(ctx: GameContext, units: Map<Id, number>, unit: GameUnit, name: (id: Id) => string, pot = ctx.pot): PrizeAward[] {
  const total = [...units.values()].reduce((s, x) => s + x, 0)
  if (pot <= 0 || total <= 0) return []
  const per = pot / total
  const order = [...units.entries()].filter(([, u]) => u > 0).sort((a, b) => b[1] - a[1])
  // Floors lose less than a peso each, so the remainder is smaller than the winner count: one each, most units first.
  const shares = splitWhole(pot, order.map(([, u]) => u), { of: total })
  const side = ctx.config.money.source === 'side'
  return order.map(([id, u], i) => {
    const { amount, rounding } = shares[i]!
    return award(
      ctx,
      id,
      amount,
      {
        title: msg('amount', { amount }),
        steps: [msg('game.unitsPot', { pot, side, total, unit, per }), msg('game.unitsWon', { name: name(id), units: u, unit, amount, rounding })],
      },
      `${ctx.config.label}, ${u} ${unitWord(unit, u)}`,
    )
  })
}

/**
 * A side pot nobody won goes back to who paid it (MONEY-10): once the game is
 * over, each entrant gets the buy-in back. Kept with the bank it was money
 * nobody could claim. A pot funded from the inscriptions stays unassigned
 * instead, with a warning (`unwonWarning`): the Comité decides.
 */
export function refundUnwon(ctx: GameContext, unit: GameUnit): PrizeAward[] {
  if (!ctx.final || ctx.config.money.source !== 'side' || ctx.pot <= 0) return []
  const buyIn = ctx.config.money.buyIn
  return ctx.entrants.map((id) => award(ctx, id, buyIn, { title: msg('amount', { amount: buyIn }), steps: [msg('game.refund', { unit, buyIn })] }, `${ctx.config.label}, entrada devuelta`))
}

/** The warning for a pot from the inscriptions that nobody won, once the game is over. */
export function unwonWarning(ctx: GameContext, unit: GameUnit): Msg[] {
  if (!ctx.final || ctx.config.money.source !== 'main' || ctx.pot <= 0) return []
  return [msg('game.unwon', { label: ctx.config.label, unit, pot: ctx.pot })]
}

/**
 * Direct bets per unit: every other entrant pays `stake` to the winner of a
 * unit (`reward`), or the player pays every other entrant (`penalty`).
 * Returns one award per (payer, winner) pair, already netted.
 */
export function directUnits(ctx: GameContext, units: Map<Id, number>, mode: 'reward' | 'penalty', unit: GameUnit, name: (id: Id) => string): PrizeAward[] {
  const stake = ctx.config.money.stake
  if (stake <= 0) return []
  const owed = new Map<string, number>() // "payer|winner" → pesos
  for (const [id, u] of units) {
    if (u <= 0) continue
    for (const other of ctx.entrants) {
      if (other === id) continue
      const [payer, winner] = mode === 'reward' ? [other, id] : [id, other]
      owed.set(`${payer}|${winner}`, (owed.get(`${payer}|${winner}`) ?? 0) + u * stake)
    }
  }
  return netBets(ctx, owed, (payer, winner) => {
    const u = mode === 'reward' ? units.get(winner) ?? 0 : units.get(payer) ?? 0
    const who = mode === 'reward' ? winner : payer
    return [msg('bet.units', { name: name(who), units: u, unit, stake })]
  }, name)
}

/** Net a payer→winner map pairwise and turn it into bet awards. */
export function netBets(ctx: GameContext, owed: Map<string, number>, why: (payer: Id, winner: Id) => Msg[], name: (id: Id) => string): PrizeAward[] {
  const out: PrizeAward[] = []
  const seen = new Set<string>()
  for (const [k, amt] of owed) {
    const [a, b] = k.split('|') as [Id, Id]
    const pairKey = [a, b].sort().join('|')
    if (seen.has(pairKey)) continue
    seen.add(pairKey)
    const net = amt - (owed.get(`${b}|${a}`) ?? 0)
    if (net === 0) continue
    const [payer, winner] = net > 0 ? [a, b] : [b, a]
    const amount = Math.abs(net)
    const back = owed.get(`${winner}|${payer}`) ?? 0
    const steps = [...why(payer, winner)]
    if (back > 0) steps.push(msg('bet.net', { gross: amount + back, back, winner: name(winner), amount }))
    out.push(award(ctx, winner, amount, { title: msg('bet.pays', { payer: name(payer), amount }), steps }, `${ctx.config.label}, de ${name(payer)}`, payer))
  }
  return out
}
