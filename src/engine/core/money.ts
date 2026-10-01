/**
 * Money (§11): entries, side-pot buy-ins and Calcutta purchases go to the
 * banker; buybacks and direct bets are peer to peer; the banker pays prizes,
 * side-pot prizes and Calcutta shares. Everything is a `Flow`; `payments`
 * rows only mark what has actually been paid.
 *
 * Flows sharing a payment key (kind, from, to) form one `Account`: what is
 * owed on it, what has been recorded as paid, and what is still due. The
 * statement per person (`people`) is gross; the settlement (`viaBank`,
 * `peerToPeer`) runs only on what is still due, so money paid on Calcutta
 * night is never asked for again on Sunday (MONEY-01).
 */
import type { TournamentSettings } from '../settings/schema'
import type { Id, PaymentKind, Snapshot } from '../types'
import type { PrizeAward } from '../modules/module'
import type { AuctionState } from '../modules/auction'
import type { GameResultState } from '../games/game'

/** null = the banker. */
export interface Flow {
  from: Id | null
  to: Id | null
  amount: number
  kind: PaymentKind
  label: string
  paid: boolean
  final: boolean
  /** The pot a payout comes from or a buy-in goes to: `main`, `calcutta` or a game id. */
  potId?: string
  /** What is still owed on this flow once its key's payments are applied, oldest flow first. */
  outstanding: number
  /** The lot a buyback belongs to: buybacks are marked on the lot. */
  lotId?: string
  /** The lot number of a Calcutta purchase, for the copy. */
  lotNumber?: number
}

/**
 * Every flow with one payment key, which is how `payments` rows are stored:
 * one row per (kind, from, to) holding the total paid on it.
 */
export interface Account {
  kind: PaymentKind
  from: Id | null
  to: Id | null
  /** Everything owed on the key. «Pagado» records this amount. */
  owed: number
  /** What has been recorded as paid. Above 0, the account is listed in «Ya pagaron», where it can be taken back. */
  paid: number
  /** owed − paid, owed by `from` to `to`. Negative when overpaid: `to` gives the difference back. */
  due: number
  /** Every flow on the key is final. */
  final: boolean
  /** Buybacks are marked on the lot, not in `payments`. */
  lotId?: string
}

export interface PersonMoney {
  playerId: Id
  /** By category label → amount. */
  prizes: Record<string, number>
  prizesTotal: number
  calcuttaShares: number
  buybacksReceived: number
  /** Direct bets won (net per opponent). */
  betsReceived: number
  entry: number
  /** Buy-ins to side pots. */
  sidePots: number
  calcuttaPurchases: number
  buybacksPaid: number
  /** Direct bets lost (net per opponent). */
  betsPaid: number
  paid: number
  receives: number
  net: number
}

export interface Transfer {
  from: Id | null
  to: Id | null
  /** 0 on a vía-banco line whose accounts cancel out: nothing changes hands, the line only closes them. */
  amount: number
  /**
   * Vía banco only: the accounts this line closes. Marking the line paid
   * records each one as paid in full (MONEY-04), so the line goes away.
   */
  settles?: Account[]
  /** Every account in the line is final, so it can be marked paid. */
  final?: boolean
}

export interface MoneyState {
  flows: Flow[]
  /** One per payment key with anything owed or paid, in flow order. */
  accounts: Account[]
  people: Record<Id, PersonMoney>
  banker: {
    playerId: Id | null
    /** Entries + side-pot buy-ins + hammer prices. */
    receives: number
    /** Prizes + side-pot prizes + Calcutta payouts. */
    pays: number
    /** Kept out of the main pot for the house (`settings.houseCut`). */
    houseCut: number
    /** receives − pays − houseCut; 0 when everything balances. */
    difference: number
    balanced: boolean
  }
  /** Sum of every person's net (banker included as a person): must be 0 when balanced. */
  netSum: number
  /** Default settlement, on what is still due: each person squares up with the bank, buybacks and bets go direct. */
  viaBank: Transfer[]
  /** Optional: minimized peer-to-peer transfers on what is still due, the bank's cash held by the banker. */
  peerToPeer: Transfer[]
}

/** The payment kinds the settlement reads; `other` is a note, not a debt. */
const SETTLED_KINDS: ReadonlySet<PaymentKind> = new Set<PaymentKind>(['entry', 'side', 'calcutta', 'buyback', 'payout', 'bet'])
const accountKey = (kind: PaymentKind, from: Id | null, to: Id | null) => `${kind}|${from ?? ''}|${to ?? ''}`

export function computeMoney(
  snapshot: Snapshot,
  settings: TournamentSettings,
  prizes: PrizeAward[],
  auction: AuctionState | undefined,
  tournamentFinal: boolean,
  games: Record<string, GameResultState> = {},
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
        paid: false,
        final: true,
        outstanding: settings.entryFee,
      })
    }
  }

  // Side pots: each entrant pays the game's buy-in.
  for (const g of Object.values(games)) {
    if (g.config.money.source !== 'side' || g.config.money.buyIn <= 0) continue
    for (const id of g.entrants) {
      flows.push({ from: id, to: null, amount: g.config.money.buyIn, kind: 'side', label: g.config.label, paid: false, final: true, potId: g.config.id, outstanding: g.config.money.buyIn })
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
        label: `Calcutta, lote ${lot.lotNumber}`,
        paid: false,
        final: true,
        outstanding: lot.price,
        lotNumber: lot.lotNumber,
      })
      if (lot.buybackPct > 0 && lot.ownerId !== lot.playerId) {
        flows.push({
          from: lot.playerId,
          to: lot.ownerId,
          amount: lot.buybackAmount,
          kind: 'buyback',
          label: `Recompra ${lot.buybackPct}%`,
          paid: false,
          final: true,
          outstanding: lot.buybackAmount,
          lotId: lot.lotId,
        })
      }
    }
  }

  // Payouts: prizes (all modules, including the auction's owner payouts).
  for (const pr of prizes) {
    if (pr.amount <= 0) continue
    flows.push({
      from: pr.payerId ?? null,
      to: pr.playerId,
      amount: pr.amount,
      kind: pr.payerId ? 'bet' : 'payout',
      label: pr.label,
      paid: false,
      final: pr.final,
      potId: pr.payerId ? pr.gameId : (pr.potId ?? 'main'),
      outstanding: pr.amount,
    })
  }
  // Accounts: one per payment key. A payments row holds the total paid on its
  // key (an owner with three lots pays once), and it covers the key's flows
  // oldest first, so a lot bought after paying shows as the only one due.
  const byKey = new Map<string, Account & { flows: Flow[] }>()
  const account = (kind: PaymentKind, from: Id | null, to: Id | null) => {
    const k = accountKey(kind, from, to)
    let a = byKey.get(k)
    if (!a) byKey.set(k, (a = { kind, from, to, owed: 0, paid: 0, due: 0, final: true, flows: [] }))
    return a
  }
  for (const f of flows) {
    const a = account(f.kind, f.from, f.to)
    a.owed += f.amount
    a.final &&= f.final
    a.flows.push(f)
    if (f.lotId) a.lotId = f.lotId
  }
  for (const p of payments) {
    if (p.paid && SETTLED_KINDS.has(p.kind)) account(p.kind, p.fromPlayerId, p.toPlayerId).paid += p.amount
  }
  for (const a of byKey.values()) {
    // A buyback is marked on its lot; the lot's flag wins over any payments row.
    const bb = a.lotId ? snapshot.calcuttaBuybacks.find((b) => b.lotId === a.lotId) : undefined
    if (bb) a.paid = bb.paid ? a.owed : 0
    a.due = a.owed - a.paid
    let left = Math.max(0, a.paid)
    for (const f of a.flows) {
      const cover = Math.min(left, f.amount)
      left -= cover
      f.outstanding = f.amount - cover
      f.paid = f.amount > 0 && f.outstanding === 0
    }
  }
  const accounts: Account[] = [...byKey.values()].filter((a) => a.owed !== 0 || a.paid !== 0).map(({ flows: _flows, ...a }) => a)

  // Per person.
  const people: Record<Id, PersonMoney> = {}
  for (const p of players) {
    people[p.id] = {
      playerId: p.id,
      prizes: {},
      prizesTotal: 0,
      calcuttaShares: 0,
      buybacksReceived: 0,
      betsReceived: 0,
      entry: 0,
      sidePots: 0,
      calcuttaPurchases: 0,
      buybacksPaid: 0,
      betsPaid: 0,
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
      else if (f.kind === 'side') m.sidePots += f.amount
      else if (f.kind === 'bet') m.betsPaid += f.amount
      m.paid += f.amount
    }
    if (f.to && people[f.to]) {
      const m = people[f.to]!
      if (f.kind === 'buyback') m.buybacksReceived += f.amount
      else if (f.kind === 'bet') m.betsReceived += f.amount
      else if (f.kind === 'payout') {
        m.prizes[f.label] = (m.prizes[f.label] ?? 0) + f.amount
        if (f.potId === 'calcutta') m.calcuttaShares += f.amount
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
  const houseCut = settings.entryFee > 0 && players.length > 0 ? settings.houseCut : 0
  const difference = bankerReceives - bankerPays - houseCut
  // The banker is a person too: the bank's surplus/deficit lands on him in the
  // net sum; the house cut is money spent on the group, so it closes the sum.
  netSum += difference + houseCut
  const balanced = difference === 0

  // Settlement "vía banco", on what is still due: each person squares up
  // with the bank in one line (what the bank still owes him minus what he
  // still owes the bank), and the line names the accounts it closes.
  const viaBank: Transfer[] = []
  const open = accounts.filter((a) => a.due !== 0)
  const line = (from: Id | null, to: Id | null, amount: number, settles: Account[]): Transfer => ({ from, to, amount, settles, final: settles.every((a) => a.final) })
  for (const p of players) {
    const settles = open.filter((a) => (a.from === p.id && a.to === null) || (a.from === null && a.to === p.id))
    const bal = settles.reduce((s, a) => s + (a.from === null ? a.due : -a.due), 0)
    if (bal > 0) viaBank.push(line(null, p.id, bal, settles))
    else if (bal < 0) viaBank.push(line(p.id, null, -bal, settles))
    // Prizes still owed that exactly cover his debts: no cash moves, but the
    // line is how both accounts get closed.
    else if (settles.length) viaBank.push(line(p.id, null, 0, settles))
  }
  for (const a of open) if (a.kind === 'buyback' && a.from && a.to) viaBank.push(a.due > 0 ? line(a.from, a.to, a.due, [a]) : line(a.to, a.from, -a.due, [a]))
  // Direct bets settle between the two players, netted across every game.
  const betNet = new Map<string, { net: number; settles: Account[] }>()
  for (const a of open) {
    if (a.kind !== 'bet' || !a.from || !a.to) continue
    const [x, y] = [a.from, a.to].sort() as [Id, Id]
    const pair = betNet.get(`${x}|${y}`) ?? { net: 0, settles: [] }
    pair.net += a.from === x ? a.due : -a.due
    pair.settles.push(a)
    betNet.set(`${x}|${y}`, pair)
  }
  for (const [k, { net, settles }] of betNet) {
    const [x, y] = k.split('|') as [Id, Id]
    if (net > 0) viaBank.push(line(x, y, net, settles))
    else if (net < 0) viaBank.push(line(y, x, -net, settles))
    else viaBank.push(line(x, y, 0, settles))
  }

  // "Sin banco": everyone's position on what is still due, with the bank as
  // one more party. Its position is what it still has to collect minus what
  // it still has to pay, which already counts the cash it holds and leaves it
  // the house cut and anything unassigned. The banker holds the bank, so his
  // position includes it; with no banker the bank appears as itself.
  const positions = new Map<Id | null, number>(players.map((p) => [p.id, 0]))
  let bankPosition = 0
  for (const a of open) {
    if (a.from === null) bankPosition -= a.due
    else if (positions.has(a.from)) positions.set(a.from, positions.get(a.from)! - a.due)
    if (a.to === null) bankPosition += a.due
    else if (positions.has(a.to)) positions.set(a.to, positions.get(a.to)! + a.due)
  }
  if (bankerId && positions.has(bankerId)) positions.set(bankerId, positions.get(bankerId)! + bankPosition)
  else positions.set(null, bankPosition)

  return {
    flows,
    accounts,
    people,
    banker: { playerId: bankerId, receives: bankerReceives, pays: bankerPays, houseCut, difference, balanced },
    netSum: Math.round(netSum),
    viaBank,
    peerToPeer: tournamentFinal || balanced ? minimizeTransfers(positions) : [],
  }
}

/**
 * Greedy: the largest debtor pays the largest creditor until everyone is
 * square. `positions` is what each party should still receive (negative:
 * pay); null is the bank. Ties keep the map's order.
 */
export function minimizeTransfers(positions: ReadonlyMap<Id | null, number>): Transfer[] {
  const all = [...positions].map(([id, amt]) => ({ id, amt }))
  const debtors = all
    .filter((m) => m.amt < 0)
    .map((m) => ({ id: m.id, amt: -m.amt }))
    .sort((a, b) => b.amt - a.amt)
  const creditors = all
    .filter((m) => m.amt > 0)
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

/**
 * One write that records an account as paid: a `payments` row upserted on
 * its key (`set_payment_paid`), or a buyback marked on its lot.
 */
export type PaidWrite = { lotId: Id; paid: boolean } | { kind: PaymentKind; from: Id | null; to: Id | null; amount: number; paid: boolean }

/**
 * What «Marcar pagado» records for a settlement line or a checklist row:
 * each account paid in full, so it is no longer due (MONEY-04). An account
 * that only holds money to give back (owed 0) is cleared. The screen and
 * the tests both use this, so they cannot disagree on what a tap means.
 */
export function markPaidWrites(settles: readonly Account[]): PaidWrite[] {
  return settles.map((a) => (a.lotId ? { lotId: a.lotId, paid: true } : { kind: a.kind, from: a.from, to: a.to, amount: Math.max(0, a.owed), paid: a.owed > 0 }))
}

/**
 * The undo of `markPaidWrites`, and of `unmarkPaidWrites`: each account back
 * to what it held before (pass the accounts as they were before the tap).
 */
export function restorePaidWrites(settles: readonly Account[]): PaidWrite[] {
  return settles.map((a) => (a.lotId ? { lotId: a.lotId, paid: a.paid > 0 } : { kind: a.kind, from: a.from, to: a.to, amount: Math.max(0, a.paid), paid: a.paid > 0 }))
}

/**
 * «Pagado» tapped off in «Ya pagaron» (UX-21): the same write as «Marcar
 * pagado», with paid false, on each account's own key (or its lot, for a
 * buyback). The amount stays as recorded; an unpaid row counts for nothing.
 * Nothing else is written, so a payment marked from an empty key comes back
 * exactly as it was before the mark.
 */
export function unmarkPaidWrites(paid: readonly Account[]): PaidWrite[] {
  return paid.map((a) => (a.lotId ? { lotId: a.lotId, paid: false } : { kind: a.kind, from: a.from, to: a.to, amount: Math.max(0, a.paid), paid: false }))
}

/**
 * What the server does with each write, applied to a snapshot: a `payments`
 * row upserted on (kind, from, to), its amount, paid flag and note replaced
 * (`set_payment_paid`); a buyback marked on its lot. Dinero shows a write
 * with this as soon as the server confirms it, before the reload does.
 */
export function applyPaidWrites(snapshot: Snapshot, writes: readonly PaidWrite[]): void {
  for (const w of writes) {
    if ('lotId' in w) {
      const bb = snapshot.calcuttaBuybacks.find((b) => b.lotId === w.lotId)
      if (bb) bb.paid = w.paid
      continue
    }
    const row = snapshot.payments.find((p) => p.kind === w.kind && p.fromPlayerId === w.from && p.toPlayerId === w.to)
    if (row) Object.assign(row, { amount: w.amount, paid: w.paid, note: null })
    else snapshot.payments.push({ id: `local:${accountKey(w.kind, w.from, w.to)}`, kind: w.kind, fromPlayerId: w.from, toPlayerId: w.to, amount: w.amount, paid: w.paid, note: null })
  }
}
