/**
 * The Calcutta (§5.9): pot = sum of hammer prices, paid out by slot from the
 * final individual ranking. Each player cashes at most one slot (the highest),
 * tier slots pass down, ties at a slot split the combined slots, each slot's
 * money goes to the player's owners by ownership percentage, whole pesos,
 * rounding remainder to the champion's owners.
 */
import type { AuctionPayoutSlot } from '../../settings/schema'
import type { CalcuttaLot, Explanation, Id } from '../../types'
import type { GameModule, ModuleContext, PrizeAward } from '../module'
import { rankIndividual } from '../individual'

export interface Ownership {
  ownerId: Id
  /** 0–100. */
  pct: number
  /** What this owner paid for this share (hammer price × pct, or the buyback amount). */
  paid: number
}

export interface LotState {
  lotId: Id
  playerId: Id
  lotNumber: number
  status: CalcuttaLot['status']
  price: number
  ownerId: Id | null
  /** The player's own share bought back after the hammer (0–buybackMaxPct). */
  buybackPct: number
  buybackAmount: number
  owners: Ownership[]
  /** Owner who cashes if this player wins something, before splitting. */
  currentBid: { amount: number; bidderId: Id } | null
}

export interface SlotResult {
  slot: AuctionPayoutSlot
  label: string
  share: number
  /** Players filling the slot (several when tied). */
  playerIds: Id[]
  /** Pot × share (before rounding to owners). */
  amount: number
  why: Explanation
}

export interface OwnerPayout {
  ownerId: Id
  amount: number
  /** Which player(s) earned it. */
  lines: Array<{ playerId: Id; slotLabel: string; amount: number; pct: number }>
}

export interface OwnerPortfolio {
  ownerId: Id
  /** Players owned with their share. */
  holdings: Array<{ playerId: Id; pct: number; paid: number }>
  invested: number
  /** Live "valor si terminara ahora". */
  value: number
  roi: number | null
}

export interface AuctionState {
  lots: LotState[]
  pot: number
  soldCount: number
  /** For the console: who may still bid (limit not reached) and how many they hold. */
  holdings: Record<Id, number>
  slots: SlotResult[]
  /** ownerId → payout (live or final, see `final`). */
  payouts: Record<Id, OwnerPayout>
  portfolios: OwnerPortfolio[]
  /** Payout total equals the pot (always true once anything is sold and ranked). */
  balanced: boolean
  final: boolean
}

/** Cents-safe: 12000 × 0.55 = 6600.000000000001 → 6600. */
const money = (x: number) => Math.round(x * 100) / 100

function slotLabel(slot: AuctionPayoutSlot, ctx: ModuleContext): string {
  switch (slot.slot) {
    case 'place':
      return slot.place === 1 ? 'Campeón' : slot.place === 2 ? 'Subcampeón' : `${slot.place}º lugar`
    case 'bestOfTier':
      return `Mejor ${slot.tier}`
    case 'lastPlace':
      return ctx.settings.labels.lastPlace
  }
}

export function buildLots(ctx: ModuleContext): LotState[] {
  const { snapshot, settings } = ctx
  const lots: LotState[] = []
  for (const lot of [...snapshot.calcuttaLots].sort((a, b) => a.lotNumber - b.lotNumber)) {
    const bids = snapshot.calcuttaBids.filter((b) => b.lotId === lot.id).sort((a, b) => b.amount - a.amount || a.createdAt.localeCompare(b.createdAt))
    const top = bids[0]
    const buyback = snapshot.calcuttaBuybacks.find((b) => b.lotId === lot.id)
    const price = lot.status === 'sold' ? (lot.price ?? 0) : (top?.amount ?? settings.auction.openingBid)
    const ownerId = lot.status === 'sold' ? lot.ownerId : (top?.bidderId ?? lot.playerId)
    const buybackPct = lot.status === 'sold' ? Math.min(buyback?.pct ?? 0, settings.auction.buybackMaxPct) : 0
    const buybackAmount = Math.round((price * buybackPct) / 100)
    const owners: Ownership[] = []
    if (lot.status === 'sold' && ownerId) {
      if (buybackPct > 0 && ownerId !== lot.playerId) {
        owners.push({ ownerId, pct: 100 - buybackPct, paid: price - buybackAmount })
        owners.push({ ownerId: lot.playerId, pct: buybackPct, paid: buybackAmount })
      } else {
        owners.push({ ownerId, pct: 100, paid: price })
      }
    }
    lots.push({
      lotId: lot.id,
      playerId: lot.playerId,
      lotNumber: lot.lotNumber,
      status: lot.status,
      price,
      ownerId: lot.status === 'sold' ? lot.ownerId : null,
      buybackPct,
      buybackAmount,
      owners,
      currentBid: top ? { amount: top.amount, bidderId: top.bidderId } : null,
    })
  }
  return lots
}

/** Number of players each owner holds (self-owned counts per setting). */
export function ownerHoldings(lots: LotState[], ctx: ModuleContext): Record<Id, number> {
  const out: Record<Id, number> = {}
  for (const l of lots) {
    if (l.status !== 'sold' || !l.ownerId) continue
    if (l.ownerId === l.playerId && !ctx.settings.auction.selfOwnedCountsTowardMax) continue
    out[l.ownerId] = (out[l.ownerId] ?? 0) + 1
  }
  return out
}

/** Assign slots from the ranking. Exported for tests with a hand-made ranking. */
export function assignSlots(
  ctx: ModuleContext,
  pot: number,
  groups: Array<{ position: number; members: Id[] }>,
): SlotResult[] {
  const { settings, snapshot } = ctx
  const tierOf = new Map(snapshot.players.map((p) => [p.id, p.tier]))
  const nameOf = (id: Id) => snapshot.players.find((p) => p.id === id)?.displayName ?? id
  const cashed = new Set<Id>()
  const results: SlotResult[] = []
  // Highest share first: a player cashes the highest slot he qualifies for.
  const slots = [...settings.auction.payout].sort((a, b) => b.share - a.share)
  // Place slots are handled together per tie group: a group occupying places
  // p..p+k−1 takes the combined shares of those places, split evenly.
  const placeSlots = slots.filter((s): s is Extract<AuctionPayoutSlot, { slot: 'place' }> => s.slot === 'place')
  const placeDone = new Set<AuctionPayoutSlot>()
  for (const slot of slots) {
    if (placeDone.has(slot)) continue
    if (slot.slot === 'place') {
      const g = groups.find((x) => x.position <= slot.place && slot.place < x.position + x.members.length)
      if (!g) continue
      const covered = placeSlots.filter((s) => g.position <= s.place && s.place < g.position + g.members.length)
      const share = covered.reduce((s, x) => s + x.share, 0)
      const members = g.members.filter((m) => !cashed.has(m))
      if (!members.length) continue
      for (const c of covered) placeDone.add(c)
      const label = covered.length === 1 ? slotLabel(slot, ctx) : covered.map((c) => slotLabel(c, ctx)).join(' + ')
      const steps =
        members.length === 1
          ? [`${nameOf(members[0]!)} termina ${g.position}º: ${Math.round(share * 100)}% del pozo`]
          : [
              `Empate a ${members.length} en el ${g.position}º: ${covered.map((c) => `${Math.round(c.share * 100)}%`).join(' + ')} = ${Math.round(share * 100)}%`,
              `${Math.round(share * 100)}% ÷ ${members.length} = ${(share / members.length) * 100}% cada uno`,
            ]
      results.push({ slot, label, share, playerIds: members, amount: money(pot * share), why: { title: label, steps } })
      for (const m of members) cashed.add(m)
      continue
    }
    if (slot.slot === 'bestOfTier') {
      const g = groups.find((x) => x.members.some((m) => tierOf.get(m) === slot.tier && !cashed.has(m)))
      if (!g) continue
      const members = g.members.filter((m) => tierOf.get(m) === slot.tier && !cashed.has(m))
      const label = slotLabel(slot, ctx)
      const steps = [`Mejor de la categoría ${slot.tier} que no cobra otro slot: ${members.map(nameOf).join(', ')} (${g.position}º)`]
      if (members.length > 1) steps.push(`Empate: se reparte entre ${members.length}`)
      results.push({ slot, label, share: slot.share, playerIds: members, amount: money(pot * slot.share), why: { title: label, steps } })
      for (const m of members) cashed.add(m)
      continue
    }
    if (slot.slot === 'lastPlace') {
      const g = groups.at(-1)
      if (!g) continue
      const members = g.members.filter((m) => !cashed.has(m))
      if (!members.length) continue
      const label = slotLabel(slot, ctx)
      const steps = [`Último lugar: ${members.map(nameOf).join(', ')}`]
      if (members.length > 1) steps.push(`Empate: se reparte entre ${members.length}`)
      results.push({ slot, label, share: slot.share, playerIds: members, amount: money(pot * slot.share), why: { title: label, steps } })
      for (const m of members) cashed.add(m)
    }
  }
  return results
}

/** Distribute slot money to owners in whole pesos; remainder to the champion's owners. */
export function payoutsToOwners(lots: LotState[], slots: SlotResult[], pot: number): Record<Id, OwnerPayout> {
  const out: Record<Id, OwnerPayout> = {}
  const add = (ownerId: Id, line: OwnerPayout['lines'][number]) => {
    const o = (out[ownerId] ??= { ownerId, amount: 0, lines: [] })
    o.amount += line.amount
    o.lines.push(line)
  }
  let distributed = 0
  let championOwner: Id | null = null
  for (const s of slots) {
    const perPlayer = s.amount / s.playerIds.length
    for (const pid of s.playerIds) {
      const lot = lots.find((l) => l.playerId === pid && l.status === 'sold')
      const owners = lot?.owners.length ? lot.owners : [{ ownerId: pid, pct: 100, paid: 0 }]
      for (const o of owners) {
        const amount = Math.floor((perPlayer * o.pct) / 100)
        distributed += amount
        add(o.ownerId, { playerId: pid, slotLabel: s.label, amount, pct: o.pct })
        if (s.slot.slot === 'place' && s.slot.place === 1 && championOwner == null) championOwner = o.ownerId
      }
    }
  }
  const remainder = Math.round(pot - distributed)
  if (remainder > 0 && slots.length) {
    const target = championOwner ?? slots[0]!.playerIds[0]!
    add(target, { playerId: target, slotLabel: 'Redondeo', amount: remainder, pct: 0 })
  }
  return out
}

export const auctionModule: GameModule<AuctionState> = {
  id: 'auction',
  defaultLabel: 'La Calcutta',
  compute(ctx) {
    const lots = buildLots(ctx)
    const sold = lots.filter((l) => l.status === 'sold')
    const pot = sold.reduce((s, l) => s + l.price, 0)
    const holdings = ownerHoldings(lots, ctx)
    const anyScores = Object.values(ctx.core.totals).some((t) => t.thru > 0)
    const groups = anyScores || ctx.tournamentFinal ? rankIndividual(ctx) : []
    const slots = pot > 0 && groups.length ? assignSlots(ctx, pot, groups) : []
    const payouts = payoutsToOwners(lots, slots, pot)
    const paidOut = Object.values(payouts).reduce((s, p) => s + p.amount, 0)
    const portfolios: OwnerPortfolio[] = []
    const byOwner = new Map<Id, OwnerPortfolio>()
    for (const l of sold) {
      for (const o of l.owners) {
        const pf = byOwner.get(o.ownerId) ?? { ownerId: o.ownerId, holdings: [], invested: 0, value: 0, roi: null }
        pf.holdings.push({ playerId: l.playerId, pct: o.pct, paid: o.paid })
        pf.invested += o.paid
        byOwner.set(o.ownerId, pf)
      }
    }
    for (const pf of byOwner.values()) {
      pf.value = payouts[pf.ownerId]?.amount ?? 0
      pf.roi = pf.invested > 0 ? Math.round(((pf.value - pf.invested) / pf.invested) * 1000) / 1000 : null
      portfolios.push(pf)
    }
    portfolios.sort((a, b) => b.value - a.value)
    return {
      lots,
      pot,
      soldCount: sold.length,
      holdings,
      slots,
      payouts,
      portfolios,
      balanced: slots.length === 0 || paidOut === pot,
      final: ctx.tournamentFinal,
    }
  },
  prizes(state, ctx) {
    const label = ctx.settings.modules.auction.label
    const out: PrizeAward[] = []
    for (const p of Object.values(state.payouts)) {
      for (const line of p.lines) {
        out.push({
          moduleId: 'auction',
          label: `${label} · ${line.slotLabel}`,
          playerId: p.ownerId,
          amount: line.amount,
          final: state.final,
          why: {
            title: `$${line.amount}`,
            steps: line.pct ? [`${line.pct}% de ${ctx.snapshot.players.find((x) => x.id === line.playerId)?.displayName ?? line.playerId}`] : ['Resto del redondeo al dueño del campeón'],
          },
        })
      }
    }
    return out
  },
}
