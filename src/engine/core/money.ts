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
 *
 * Money the rules leave unassigned is listed in `unassigned.ts`; what the
 * Comité assigns from it comes in as prizes (`moduleId: 'adjustment'`), so
 * every screen that reads the flows reads it, and what it leaves to the
 * house stays with the banker beside the house cut (`toHouse`).
 */
import type { TournamentSettings } from '../settings/schema'
import { label, msg, say, type Msg } from '../messages'
import type { Explanation, Id, PaymentKind, Snapshot } from '../types'
import type { PrizeAward } from '../modules/module'
import type { AuctionState } from '../modules/auction'
import type { GameResultState } from '../games/game'
import { NO_UNASSIGNED, type UnassignedState } from './unassigned'

/** null = the banker. */
export interface Flow {
  from: Id | null
  to: Id | null
  amount: number
  kind: PaymentKind
  /** What it is for: the inscription, a lot, a buyback, a side pot's label, a prize's label. */
  label: Msg
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
  /** What he won, by prize label, in the order the prizes came (each label once, its amounts summed). */
  prizes: Array<{ label: Msg; amount: number }>
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

/** One part of an amount people pay by (MONEY-07). */
export interface MoneyPart {
  label: Msg
  /**
   * Signed from the side that reads it. On a vía-banco line, + is what the
   * payer owes on it and − what nets against it; in a party's position, + is
   * what it still receives and − what it still pays.
   */
  amount: number
  /** The flow's whole amount, when part of it was already paid: `amount` is what is left. */
  of?: number
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
  /** Vía banco only: every flow still due on the accounts it closes, signed from the payer's side. They add up to `amount`. */
  parts?: MoneyPart[]
  /** «¿Cómo se calculó?» of the amount: the parts (vía banco), or both parties' positions and the share between them (sin banco). */
  why: Explanation[]
}

/** What one party still receives (+) or pays (−) once everything due is settled: sin banco pays these out (MONEY-07). */
export interface Position {
  /** null = the bank, standing as itself when no banker holds it. */
  party: Id | null
  amount: number
  /** Signed from the party's side; they add up to `amount`. The banker's include the bank's, in two parts. */
  parts: MoneyPart[]
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
    /** Unassigned money the Comité left to the house (MONEY-05); the banker holds it, like the house cut. */
    toHouse: number
    /** receives − pays − houseCut − toHouse; 0 when everything balances. */
    difference: number
    balanced: boolean
    /** «¿Cómo se calculó?» of the two figures and what is left (MONEY-07). */
    why: Explanation
  }
  /** Sum of every person's net (banker included as a person): must be 0 when balanced. */
  netSum: number
  /** Default settlement, on what is still due: each person squares up with the bank, buybacks and bets go direct. */
  viaBank: Transfer[]
  /** Optional: minimized peer-to-peer transfers on what is still due, the bank's cash held by the banker. */
  peerToPeer: Transfer[]
  /** Every party's position on what is still due, with its parts: what sin banco settles. */
  positions: Position[]
  /** «Por asignar»: what the rules leave to the Comité, and its decisions (MONEY-05). Set by computeTournament. */
  unassigned: UnassignedState
}

/** A part of an amount, signed: + what is owed or received, − what nets against it. */
const partText = (p: MoneyPart): Msg => msg('settle.part', { label: p.label, amount: p.amount, of: p.of ?? null })

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
  /** Unassigned money the Comité's assignments leave to the house. */
  toHouse = 0,
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
        label: say('flow.entry'),
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
      flows.push({ from: id, to: null, amount: g.config.money.buyIn, kind: 'side', label: label(g.config.label), paid: false, final: true, potId: g.config.id, outstanding: g.config.money.buyIn })
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
        label: msg('flow.lot', { lot: lot.lotNumber }),
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
          label: msg('flow.buyback', { pct: lot.buybackPct }),
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

  // «¿Cómo se calculó?» of what people pay by (MONEY-07): an account's part of
  // an amount is each of its flows still due, or what was paid beyond it.
  const names = new Map(players.map((p) => [p.id, p.displayName]))
  /** A party of a money sentence: the person's name, or null for the bank, which the sentence words itself (COPY-08). */
  const nameOf = (id: Id | null) => (id ? (names.get(id) ?? '?') : null)
  /** `sign` 1: from the account's payer's side (what he owes is +). */
  const accountParts = (a: Account, sign: 1 | -1): MoneyPart[] => {
    if (a.due < 0) return [{ label: msg('settle.overpaid', { kind: a.kind }), amount: sign * a.due }]
    return byKey
      .get(accountKey(a.kind, a.from, a.to))!
      .flows.filter((f) => f.outstanding > 0)
      .map((f) => ({ label: f.label, amount: sign * f.outstanding, ...(f.outstanding < f.amount ? { of: f.amount } : {}) }))
  }

  // Per person.
  const people: Record<Id, PersonMoney> = {}
  for (const p of players) {
    people[p.id] = {
      playerId: p.id,
      prizes: [],
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
        const key = JSON.stringify(f.label)
        const won = m.prizes.find((x) => JSON.stringify(x.label) === key)
        if (won) won.amount += f.amount
        else m.prizes.push({ label: f.label, amount: f.amount })
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
  const difference = bankerReceives - bankerPays - houseCut - toHouse
  // The banker is a person too: the bank's surplus/deficit lands on him in the
  // net sum; the house cut (and what the Comité gave the house) is money spent
  // on the group, so it closes the sum.
  netSum += difference + houseCut + toHouse
  const balanced = difference === 0

  // Settlement "vía banco", on what is still due: each person squares up
  // with the bank in one line (what the bank still owes him minus what he
  // still owes the bank), and the line names the accounts it closes.
  const viaBank: Transfer[] = []
  const open = accounts.filter((a) => a.due !== 0)
  const line = (from: Id | null, to: Id | null, amount: number, settles: Account[]): Transfer => {
    // From the payer's side: what he owes first, then what nets against it.
    const parts = settles.flatMap((a) => accountParts(a, a.from === from ? 1 : -1)).sort((x, y) => Number(x.amount < 0) - Number(y.amount < 0))
    // The banker with his own bank is his money in or out of what he holds, never a payment to himself.
    const bankerSelf = !!bankerId && ((from === bankerId && to === null) || (from === null && to === bankerId))
    const title = amount === 0 ? msg('settle.squared', { from: nameOf(from), to: nameOf(to) }) : msg('settle.pays', { from: nameOf(from), to: nameOf(to), amount, bankerSelf })
    return { from, to, amount, settles, final: settles.every((a) => a.final), parts, why: [{ title, steps: [...parts.map(partText), amount === 0 ? say('settle.nets') : msg('settle.total', { amount })] }] }
  }
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
  const positionParts = new Map<Id | null, MoneyPart[]>(players.map((p) => [p.id, []]))
  let bankCollects = 0
  let bankPays = 0
  for (const a of open) {
    if (a.from === null) bankPays += a.due
    else if (positions.has(a.from)) {
      positions.set(a.from, positions.get(a.from)! - a.due)
      positionParts.get(a.from)!.push(...accountParts(a, -1))
    }
    if (a.to === null) bankCollects += a.due
    else if (positions.has(a.to)) {
      positions.set(a.to, positions.get(a.to)! + a.due)
      positionParts.get(a.to)!.push(...accountParts(a, 1))
    }
  }
  const bankPosition = bankCollects - bankPays
  const bankParts: MoneyPart[] = [
    { label: say('settle.bankCollects'), amount: bankCollects },
    { label: say('settle.bankPays'), amount: -bankPays },
  ].filter((x) => x.amount !== 0)
  const bankParty = bankerId && positions.has(bankerId) ? bankerId : null
  positions.set(bankParty, (positions.get(bankParty) ?? 0) + bankPosition)
  positionParts.set(bankParty, [...(positionParts.get(bankParty) ?? []), ...bankParts])
  const positionList: Position[] = [...positions]
    .map(([party, amount]) => ({ party, amount, parts: positionParts.get(party) ?? [] }))
    .filter((x) => x.amount !== 0 || x.parts.length > 0)
  const positionOf = new Map(positionList.map((x) => [x.party, x]))
  const positionWhy = (party: Id | null): Explanation => {
    const x = positionOf.get(party)!
    return { title: x.amount < 0 ? msg('settle.owesTotal', { name: nameOf(party), amount: -x.amount }) : msg('settle.getsTotal', { name: nameOf(party), amount: x.amount }), steps: x.parts.map(partText) }
  }
  // Each minimized transfer, explained by both positions and the share of the payer's debt it carries.
  const explainP2P = (list: Transfer[]): Transfer[] =>
    list.map((tr) => ({
      ...tr,
      why: [positionWhy(tr.from), positionWhy(tr.to), { title: say('settle.ruleTitle'), steps: [say('settle.rule'), msg('settle.share', { from: nameOf(tr.from), total: -positionOf.get(tr.from)!.amount, amount: tr.amount, to: nameOf(tr.to) })] }],
    }))

  // The bank's two figures, by what moves them: one line per kind of money (the inscriptions, the lots) or per pot.
  const bankIn = new Map<string, { what: Msg; amount: number }>()
  const bankOut = new Map<string, { what: Msg; amount: number }>()
  const add = (m: Map<string, { what: Msg; amount: number }>, key: string, what: () => Msg, n: number) => {
    const line = m.get(key)
    if (line) line.amount += n
    else m.set(key, { what: what(), amount: n })
  }
  const entryCount = flows.filter((f) => f.kind === 'entry').length
  const lotCount = flows.filter((f) => f.kind === 'calcutta').length
  for (const f of flows) {
    if (f.to === null) {
      if (f.kind === 'entry') add(bankIn, 'entries', () => msg('settle.entries', { n: entryCount, fee: settings.entryFee }), f.amount)
      else if (f.kind === 'calcutta') add(bankIn, 'lots', () => msg('settle.lots', { n: lotCount }), f.amount)
      else add(bankIn, `label:${JSON.stringify(f.label)}`, () => f.label, f.amount)
    }
    if (f.from === null) {
      if (f.potId === 'calcutta') add(bankOut, 'calcutta', () => say('settle.calcuttaShares'), f.amount)
      else if (!f.potId || f.potId === 'main') add(bankOut, 'main', () => say('settle.mainPrizes'), f.amount)
      else {
        const pot = games[f.potId]?.config.label
        const what = pot != null ? label(pot) : f.label
        add(bankOut, `label:${JSON.stringify(what)}`, () => what, f.amount)
      }
    }
  }
  const bankWhy: Explanation = {
    title: say('settle.bankTitle'),
    steps: [
      say('settle.gross'),
      ...[...bankIn.values()].map((x) => msg('settle.bankIn', x)),
      msg('settle.bankInTotal', { amount: bankerReceives }),
      ...[...bankOut.values()].map((x) => msg('settle.bankOut', x)),
      msg('settle.bankOutTotal', { amount: bankerPays }),
      ...(houseCut > 0 ? [msg('settle.houseCut', { amount: houseCut })] : []),
      ...(toHouse > 0 ? [msg('settle.toHouse', { amount: toHouse })] : []),
      difference === 0 ? say('settle.squares') : difference > 0 ? msg('settle.left', { amount: difference }) : msg('settle.short', { amount: -difference }),
    ],
  }

  return {
    flows,
    accounts,
    people,
    banker: { playerId: bankerId, receives: bankerReceives, pays: bankerPays, houseCut, toHouse, difference, balanced, why: bankWhy },
    netSum: Math.round(netSum),
    viaBank,
    peerToPeer: tournamentFinal || balanced ? explainP2P(minimizeTransfers(positions)) : [],
    positions: positionList,
    unassigned: NO_UNASSIGNED,
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
    if (amount > 0) out.push({ from: d.id, to: c.id, amount, why: [] })
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
/**
 * A debt the bank collects now, as «Quién debe qué» lists it: still due, from
 * a person, and an entry, a Calcutta purchase, a buyback, a side pot or a bet
 * already decided (a bet still in play is no debt yet).
 */
export function collectible(a: Account): boolean {
  return a.due > 0 && a.from !== null && (a.kind === 'entry' || a.kind === 'calcutta' || a.kind === 'buyback' || a.kind === 'side' || (a.kind === 'bet' && a.final))
}

/**
 * What a person still has to pay today, on the same accounts «Quién debe qué»
 * lists (COPY-03): the figure next to «Pone» that says whether the money is in.
 */
export function stillOwes(accounts: readonly Account[], playerId: Id): number {
  return accounts.reduce((n, a) => (a.from === playerId && collectible(a) ? n + a.due : n), 0)
}

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
