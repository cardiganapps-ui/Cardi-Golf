/**
 * Money (§11): entries and Calcutta purchases go to the banker; buybacks are
 * peer to peer; the banker pays prizes and Calcutta shares. Everything is a
 * `Flow`; `payments` rows only mark what has actually been paid.
 */
import type { TournamentSettings } from '../settings/schema'
import type { Id, Payment, PaymentKind, Snapshot } from '../types'
import type { PrizeAward } from '../modules/module'
import type { AuctionState } from '../modules/auction'

/** null = the banker. */
export interface Flow {
  from: Id | null
  to: Id | null
  amount: number
  kind: PaymentKind
  label: string
  paid: boolean
  final: boolean
}

export interface PersonMoney {
  playerId: Id
  /** By category label → amount. */
  prizes: Record<string, number>
  prizesTotal: number
  calcuttaShares: number
  buybacksReceived: number
  entry: number
  calcuttaPurchases: number
  buybacksPaid: number
  paid: number
  receives: number
  net: number
}

export interface Transfer {
  from: Id | null
  to: Id | null
  amount: number
}

export interface MoneyState {
  flows: Flow[]
  people: Record<Id, PersonMoney>
  banker: {
    playerId: Id | null
    /** Entries + hammer prices. */
    receives: number
    /** Prizes + Calcutta payouts. */
    pays: number
    /** receives − pays; 0 when everything balances. */
    difference: number
    balanced: boolean
  }
  /** Sum of every person's net (banker included as a person): must be 0 when balanced. */
  netSum: number
  /** Default settlement: the banker pays each winner. */
  viaBank: Transfer[]
  /** Optional: minimized peer-to-peer transfers, for when not everyone paid ahead. */
  peerToPeer: Transfer[]
}

function isPaid(payments: Payment[], kind: PaymentKind, from: Id | null, to: Id | null, amount: number): boolean {
  const total = payments
    .filter((p) => p.paid && p.kind === kind && p.fromPlayerId === from && p.toPlayerId === to)
    .reduce((s, p) => s + p.amount, 0)
  return total >= amount && amount > 0
}

export function computeMoney(
  snapshot: Snapshot,
  settings: TournamentSettings,
  prizes: PrizeAward[],
  auction: AuctionState | undefined,
  tournamentFinal: boolean,
): MoneyState {
  const flows: Flow[] = []
  const payments = snapshot.payments
  const players = [...snapshot.players].sort((a, b) => a.sortOrder - b.sortOrder)

  // Entries.
  if (settings.entryFee > 0) {
    for (const p of players) {
      flows.push({
        from: p.id,
        to: null,
        amount: settings.entryFee,
        kind: 'entry',
        label: 'Inscripción',
        paid: isPaid(payments, 'entry', p.id, null, settings.entryFee),
        final: true,
      })
    }
  }

  // Calcutta purchases and buybacks.
  if (auction) {
    for (const lot of auction.lots) {
      if (lot.status !== 'sold' || !lot.ownerId) continue
      flows.push({
        from: lot.ownerId,
        to: null,
        amount: lot.price,
        kind: 'calcutta',
        label: `Calcutta · lote ${lot.lotNumber}`,
        paid: isPaid(payments, 'calcutta', lot.ownerId, null, lot.price),
        final: true,
      })
      if (lot.buybackPct > 0 && lot.ownerId !== lot.playerId) {
        const bb = snapshot.calcuttaBuybacks.find((b) => b.lotId === lot.lotId)
        flows.push({
          from: lot.playerId,
          to: lot.ownerId,
          amount: lot.buybackAmount,
          kind: 'buyback',
          label: `Recompra ${lot.buybackPct}%`,
          paid: bb?.paid ?? isPaid(payments, 'buyback', lot.playerId, lot.ownerId, lot.buybackAmount),
          final: true,
        })
      }
    }
  }

  // Payouts: prizes (all modules, including the auction's owner payouts).
  for (const pr of prizes) {
    if (pr.amount <= 0) continue
    flows.push({
      from: null,
      to: pr.playerId,
      amount: pr.amount,
      kind: 'payout',
      label: pr.label,
      paid: false,
      final: pr.final,
    })
  }
  // A single "payout" payment row per person marks all their payouts paid.
  const payoutPaid = new Map<Id, number>()
  for (const p of payments) if (p.paid && p.kind === 'payout' && p.fromPlayerId === null && p.toPlayerId) {
    payoutPaid.set(p.toPlayerId, (payoutPaid.get(p.toPlayerId) ?? 0) + p.amount)
  }
  const owedPayout = new Map<Id, number>()
  for (const f of flows) if (f.kind === 'payout' && f.to) owedPayout.set(f.to, (owedPayout.get(f.to) ?? 0) + f.amount)
  for (const f of flows) {
    if (f.kind === 'payout' && f.to) f.paid = (payoutPaid.get(f.to) ?? 0) >= (owedPayout.get(f.to) ?? 0) && (owedPayout.get(f.to) ?? 0) > 0
  }

  // Per person.
  const people: Record<Id, PersonMoney> = {}
  for (const p of players) {
    people[p.id] = {
      playerId: p.id,
      prizes: {},
      prizesTotal: 0,
      calcuttaShares: 0,
      buybacksReceived: 0,
      entry: 0,
      calcuttaPurchases: 0,
      buybacksPaid: 0,
      paid: 0,
      receives: 0,
      net: 0,
    }
  }
  for (const f of flows) {
    if (f.from && people[f.from]) {
      const m = people[f.from]!
      if (f.kind === 'entry') m.entry += f.amount
      else if (f.kind === 'calcutta') m.calcuttaPurchases += f.amount
      else if (f.kind === 'buyback') m.buybacksPaid += f.amount
      m.paid += f.amount
    }
    if (f.to && people[f.to]) {
      const m = people[f.to]!
      if (f.kind === 'buyback') m.buybacksReceived += f.amount
      else if (f.kind === 'payout') {
        m.prizes[f.label] = (m.prizes[f.label] ?? 0) + f.amount
        if (f.label.startsWith(settings.modules.auction.label)) m.calcuttaShares += f.amount
        else m.prizesTotal += f.amount
      }
      m.receives += f.amount
    }
  }
  let netSum = 0
  for (const m of Object.values(people)) {
    m.net = m.receives - m.paid
    netSum += m.net
  }

  // Banker.
  const bankerReceives = flows.filter((f) => f.to === null).reduce((s, f) => s + f.amount, 0)
  const bankerPays = flows.filter((f) => f.from === null).reduce((s, f) => s + f.amount, 0)
  const bankerId = snapshot.tournament.bankerPlayerId
  const difference = bankerReceives - bankerPays
  // The banker is a person too: the bank's surplus/deficit lands on him in the net sum.
  netSum += difference
  const balanced = difference === 0

  // Settlement "vía banco": each person's balance against the bank.
  const viaBank: Transfer[] = []
  for (const p of players) {
    const m = people[p.id]!
    const fromBank = m.prizesTotal + m.calcuttaShares
    const toBank = m.entry + m.calcuttaPurchases
    const bal = fromBank - toBank
    if (bal > 0) viaBank.push({ from: null, to: p.id, amount: bal })
    else if (bal < 0) viaBank.push({ from: p.id, to: null, amount: -bal })
  }
  for (const f of flows) if (f.kind === 'buyback') viaBank.push({ from: f.from, to: f.to, amount: f.amount })

  return {
    flows,
    people,
    banker: { playerId: bankerId, receives: bankerReceives, pays: bankerPays, difference, balanced },
    netSum: Math.round(netSum),
    viaBank,
    peerToPeer: tournamentFinal || balanced ? minimizeTransfers(people) : [],
  }
}

/** Greedy: the largest debtor pays the largest creditor until everyone is square. */
export function minimizeTransfers(people: Record<Id, PersonMoney>): Transfer[] {
  const debtors = Object.values(people)
    .filter((m) => m.net < 0)
    .map((m) => ({ id: m.playerId, amt: -m.net }))
    .sort((a, b) => b.amt - a.amt)
  const creditors = Object.values(people)
    .filter((m) => m.net > 0)
    .map((m) => ({ id: m.playerId, amt: m.net }))
    .sort((a, b) => b.amt - a.amt)
  const out: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!
    const c = creditors[j]!
    const amount = Math.min(d.amt, c.amt)
    if (amount > 0) out.push({ from: d.id, to: c.id, amount })
    d.amt -= amount
    c.amt -= amount
    if (d.amt === 0) i++
    if (c.amt === 0) j++
  }
  return out
}
