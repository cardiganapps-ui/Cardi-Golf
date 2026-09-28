/**
 * Shared money helpers for instance games: split a pot by places or by units
 * won, or turn units into direct bets between entrants. All whole pesos; any
 * remainder goes one peso at a time to the first winners in order.
 */
import type { GameConfig } from '../settings/games'
import type { Explanation, Id } from '../types'
import type { PrizeAward } from '../modules/module'
import type { RankGroup } from '../core/ranking'
import { splitPrizes } from '../core/ranking'
import type { GameContext } from './game'

export function fmt(n: number): string {
  const sign = n < 0 ? '−' : ''
  return `${sign}$${Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
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

/** Whole-peso amounts for percent places: floor each, remainder to 1st. */
export function placeAmounts(pot: number, split: number[]): number[] {
  const out = split.map((pct) => Math.floor((pot * pct) / 100))
  const rest = pot - out.reduce((s, x) => s + x, 0)
  if (out.length && rest > 0) out[0]! += rest
  return out
}

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
  return splitPrizes(groups, amounts, name).map((s) => award(ctx, s.item, s.amount, { ...s.why, steps: [`Bote ${fmt(pot)}: ${ctx.config.money.split.map((p) => `${p}%`).join(' / ')}`, ...s.why.steps] }, labelFor(s.item)))
}

/**
 * Pay a pot by units won (skins, birdies, contest wins): each unit is worth
 * pot ÷ units. Pesos left over by the division go to the players with the
 * most units first. Returns nothing when nobody won a unit.
 */
export function payUnits(ctx: GameContext, units: Map<Id, number>, unitName: [string, string], name: (id: Id) => string, pot = ctx.pot): PrizeAward[] {
  const total = [...units.values()].reduce((s, x) => s + x, 0)
  if (pot <= 0 || total <= 0) return []
  const per = pot / total
  const order = [...units.entries()].filter(([, u]) => u > 0).sort((a, b) => b[1] - a[1])
  const base = order.map(([, u]) => Math.floor((pot * u) / total))
  // Floors lose less than a peso each, so the remainder is smaller than the winner count.
  let rest = pot - base.reduce((s, x) => s + x, 0)
  return order.map(([id, u], i) => {
    const extra = rest > 0 ? 1 : 0
    rest -= extra
    const amount = base[i]! + extra
    const unit = u === 1 ? unitName[0] : unitName[1]
    const perText = Number.isInteger(per) ? fmt(per) : `${fmt(Math.floor(per))} y centavos`
    return award(
      ctx,
      id,
      amount,
      {
        title: fmt(amount),
        steps: [`Bote ${fmt(pot)} ÷ ${total} ${total === 1 ? unitName[0] : unitName[1]} = ${perText} c/u`, `${name(id)}: ${u} ${unit} = ${fmt(amount)}${extra ? ' (con $1 de redondeo)' : ''}`],
      },
      `${ctx.config.label}, ${u} ${unit}`,
    )
  })
}

/**
 * Direct bets per unit: every other entrant pays `stake` to the winner of a
 * unit (`reward`), or the player pays every other entrant (`penalty`).
 * Returns one award per (payer, winner) pair, already netted.
 */
export function directUnits(ctx: GameContext, units: Map<Id, number>, mode: 'reward' | 'penalty', unitName: [string, string], name: (id: Id) => string): PrizeAward[] {
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
    return { title: '', steps: [`${name(who)}: ${u} ${u === 1 ? unitName[0] : unitName[1]} × ${fmt(stake)}`] }
  }, name)
}

/** Net a payer→winner map pairwise and turn it into bet awards. */
export function netBets(ctx: GameContext, owed: Map<string, number>, why: (payer: Id, winner: Id) => Explanation, name: (id: Id) => string): PrizeAward[] {
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
    const w = why(payer, winner)
    const back = owed.get(`${winner}|${payer}`) ?? 0
    const steps = [...w.steps]
    if (back > 0) steps.push(`Neto: ${fmt(amount + back)} − ${fmt(back)} que ${name(winner)} le debía = ${fmt(amount)}`)
    out.push(award(ctx, winner, amount, { title: `${name(payer)} paga ${fmt(amount)}`, steps }, `${ctx.config.label}, de ${name(payer)}`, payer))
  }
  return out
}
