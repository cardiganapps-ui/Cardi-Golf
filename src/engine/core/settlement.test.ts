/**
 * The settlement runs on what is still due (MONEY-01), «Pagado» on a line
 * sticks because it records every account the line closes (MONEY-04), and
 * «Sin banco» collects the house cut (MONEY-12).
 *
 * The expectations are worked out from the inputs each test builds, not from
 * the engine's own accounts, so a wrong account would not grade itself.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { getFixture } from '../../dev/fixtures'
import { DEFAULT_SETTINGS } from '../settings/presets'
import { parseSettings, type TournamentSettings } from '../settings/schema'
import { makeSnapshot } from '../testing/fixtures'
import type { PrizeAward } from '../modules/module'
import type { AuctionState } from '../modules/auction'
import type { Id, PaymentKind, Snapshot } from '../types'
import { computeMoney, markPaidWrites, restorePaidWrites, type MoneyState, type PaidWrite, type Transfer } from './money'

const why = { title: '', steps: [] }

function prize(playerId: Id, amount: number, opts: Partial<PrizeAward> = {}): PrizeAward {
  return { moduleId: 'individual', label: 'Individual, 1º', playerId, amount, final: true, why, ...opts }
}

function settings(over: Partial<TournamentSettings> = {}): TournamentSettings {
  return { ...DEFAULT_SETTINGS, ...over }
}

function pay(snap: Snapshot, kind: PaymentKind, from: Id | null, to: Id | null, amount: number) {
  snap.payments.push({ id: `pay${snap.payments.length + 1}`, kind, fromPlayerId: from, toPlayerId: to, amount, paid: true, note: null })
}

/** What the screen does with a write: `set_payment_paid` upserts on (kind, from, to); buybacks are marked on the lot. */
function apply(snap: Snapshot, writes: PaidWrite[]) {
  for (const w of writes) {
    if ('lotId' in w) {
      snap.calcuttaBuybacks.find((b) => b.lotId === w.lotId)!.paid = w.paid
      continue
    }
    const row = snap.payments.find((p) => p.kind === w.kind && p.fromPlayerId === w.from && p.toPlayerId === w.to)
    if (row) Object.assign(row, { amount: w.amount, paid: w.paid })
    else snap.payments.push({ id: `pay${snap.payments.length + 1}`, kind: w.kind, fromPlayerId: w.from, toPlayerId: w.to, amount: w.amount, paid: w.paid, note: null })
  }
}

const lines = (ts: Transfer[]) => ts.map((t) => [t.from, t.to, t.amount])

/** Each party's net across the transfers (received − paid); null is the bank. */
function netOf(ts: Transfer[]) {
  const net = new Map<Id | null, number>()
  for (const t of ts) {
    net.set(t.from, (net.get(t.from) ?? 0) - t.amount)
    net.set(t.to, (net.get(t.to) ?? 0) + t.amount)
  }
  return net
}

/** Four players, $1,000 entry each, p1 wins the whole $4,000 pot. No banker, so the bank stands on its own. */
function fourPlayers(over: Partial<TournamentSettings> = {}) {
  const s = settings({ entryFee: 1000, ...over })
  const snap = makeSnapshot({ players: 4, rounds: 1, settings: s })
  snap.tournament.bankerPlayerId = null
  return { s, snap }
}

const money = (snap: Snapshot, s: TournamentSettings, prizes: PrizeAward[], auction?: AuctionState): MoneyState => computeMoney(snap, s, prizes, auction, true)

describe('settlement on what is still due (MONEY-01)', () => {
  it('every entry paid: vía banco only pays the winner his gross prize', () => {
    const { s, snap } = fourPlayers()
    for (const p of snap.players) pay(snap, 'entry', p.id, null, 1000)
    const m = money(snap, s, [prize('p1', 4000)])
    // Before the fix: Banco→p1 $3,000 and p2, p3, p4 → Banco $1,000 each, again.
    expect(lines(m.viaBank)).toEqual([[null, 'p1', 4000]])
  })

  it('nothing paid: vía banco is each person against the bank, as before', () => {
    const { s, snap } = fourPlayers()
    const m = money(snap, s, [prize('p1', 4000)])
    expect(lines(m.viaBank)).toEqual([
      [null, 'p1', 3000],
      ['p2', null, 1000],
      ['p3', null, 1000],
      ['p4', null, 1000],
    ])
  })

  it('some paid: only what each one still owes, netted against what he wins', () => {
    const { s, snap } = fourPlayers()
    pay(snap, 'entry', 'p1', null, 1000)
    pay(snap, 'entry', 'p3', null, 1000)
    const m = money(snap, s, [prize('p1', 2500), prize('p2', 1500, { label: 'Individual, 2º' })])
    expect(lines(m.viaBank)).toEqual([
      [null, 'p1', 2500],
      [null, 'p2', 500],
      ['p4', null, 1000],
    ])
  })

  it('a winner who has not paid yet gets his prizes minus his entry, in one line that closes both', () => {
    const { s, snap } = fourPlayers()
    const m = money(snap, s, [prize('p1', 4000)])
    const line = m.viaBank.find((t) => t.to === 'p1')!
    expect(line.settles!.map((a) => [a.kind, a.from, a.to, a.due])).toEqual([
      ['entry', 'p1', null, 1000],
      ['payout', null, 'p1', 4000],
    ])
  })

  it('a buyback already paid is not asked for again', () => {
    const s = settings({ entryFee: 0 })
    const snap = makeSnapshot({ players: 2, rounds: 1, settings: s })
    snap.calcuttaBuybacks.push({ lotId: 'lot1', pct: 50, amount: 500, paid: true })
    const auction = { lots: [{ lotId: 'lot1', playerId: 'p1', lotNumber: 1, status: 'sold', price: 1000, ownerId: 'p2', buybackPct: 50, buybackAmount: 500 }] } as unknown as AuctionState
    const paid = money(snap, s, [], auction)
    expect(paid.viaBank.filter((t) => t.from && t.to)).toEqual([])
    snap.calcuttaBuybacks[0]!.paid = false
    expect(lines(money(snap, s, [], auction).viaBank.filter((t) => t.from && t.to))).toEqual([['p1', 'p2', 500]])
  })

  it('bets already paid are not asked for again; the rest still net per pair', () => {
    const s = settings({ entryFee: 0 })
    const snap = makeSnapshot({ players: 2, rounds: 1, settings: s })
    const bets = [prize('p2', 300, { payerId: 'p1', moduleId: 'skins', label: 'Skins' }), prize('p1', 100, { payerId: 'p2', moduleId: 'skins', label: 'Nassau' })]
    expect(lines(money(snap, s, bets).viaBank)).toEqual([['p1', 'p2', 200]])
    pay(snap, 'bet', 'p1', 'p2', 300)
    expect(lines(money(snap, s, bets).viaBank)).toEqual([['p2', 'p1', 100]])
  })

  it('a prize corrected down after it was paid asks for the difference back', () => {
    const { s, snap } = fourPlayers({ entryFee: 0 })
    pay(snap, 'payout', null, 'p1', 1000)
    expect(lines(money(snap, s, [prize('p1', 600)]).viaBank)).toEqual([['p1', null, 400]])
    // And a prize that moved to someone else entirely.
    expect(lines(money(snap, s, [prize('p2', 1000)]).viaBank)).toEqual([
      ['p1', null, 1000],
      [null, 'p2', 1000],
    ])
  })

  it('the design fixture: paid entries and the paid buyback drop out (the panel repro)', () => {
    const fx = getFixture('full12-finished')!
    const st = computeTournament(fx.snapshot, parseSettings(fx.snapshot.tournament.settings))
    const m = st.money
    // Bruno (p2) paid his entry and won nothing: nothing left between him and
    // the bank (his unpaid buyback to p6 is settled between them).
    expect(m.viaBank.some((t) => (t.from === 'p2' && t.to === null) || (t.from === null && t.to === 'p2'))).toBe(false)
    expect(lines(m.viaBank.filter((t) => t.from === 'p2'))).toEqual([['p2', 'p6', 500]])
    // Camilo (p3): $11,000 in prizes + $2,200 of Calcutta, minus the $3,000 lot he has not paid.
    expect(lines(m.viaBank.filter((t) => t.to === 'p3' && t.from === null))).toEqual([[null, 'p3', 10200]])
    // Every buyback marked paid on its lot is gone from the list.
    for (const bb of fx.snapshot.calcuttaBuybacks.filter((b) => b.paid)) {
      expect(m.viaBank.some((t) => t.settles?.some((a) => a.lotId === bb.lotId))).toBe(false)
    }
  })
})

describe('«Marcar pagado» sticks (MONEY-04)', () => {
  it('marking every line paid empties vía banco and leaves every flow paid', () => {
    const fx = getFixture('full12-finished')!
    const snap = structuredClone(fx.snapshot)
    const s = parseSettings(snap.tournament.settings)
    const before = computeTournament(snap, s).money
    expect(before.viaBank.length).toBeGreaterThan(0)
    for (const line of before.viaBank) apply(snap, markPaidWrites(line.settles!))
    const after = computeTournament(snap, s).money
    expect(after.viaBank).toEqual([])
    expect(after.flows.filter((f) => !f.paid)).toEqual([])
    // The statement does not move: marking money paid changes no one's net.
    expect(Object.values(after.people).map((p) => p.net)).toEqual(Object.values(before.people).map((p) => p.net))
  })

  it('the undo puts the line back exactly', () => {
    const { s, snap } = fourPlayers()
    pay(snap, 'entry', 'p2', null, 1000)
    const prizes = [prize('p1', 4000)]
    const before = money(snap, s, prizes)
    const line = before.viaBank.find((t) => t.to === 'p1')!
    apply(snap, markPaidWrites(line.settles!))
    expect(money(snap, s, prizes).viaBank.some((t) => t.to === 'p1')).toBe(false)
    apply(snap, restorePaidWrites(line.settles!))
    expect(money(snap, s, prizes).viaBank).toEqual(before.viaBank)
  })

  it('a line with a provisional prize cannot be marked', () => {
    const { s, snap } = fourPlayers()
    const m = money(snap, s, [prize('p1', 4000, { final: false })])
    expect(m.viaBank.find((t) => t.to === 'p1')!.final).toBe(false)
    expect(m.viaBank.find((t) => t.from === 'p2')!.final).toBe(true)
  })
})

describe('sin banco on what is still due', () => {
  it('collects the house cut instead of leaving one loser short (MONEY-12)', () => {
    const { s, snap } = fourPlayers({ houseCut: 400 })
    const m = money(snap, s, [prize('p4', 3600)])
    // Before: p1→p4 1,000, p2→p4 1,000, p3→p4 600, and nobody paid the house.
    const net = netOf(m.peerToPeer)
    for (const id of ['p1', 'p2', 'p3']) expect(net.get(id)).toBe(-1000)
    expect(net.get('p4')).toBe(2600)
    expect(net.get(null)).toBe(400)
  })

  it('with a banker, he holds the house cut', () => {
    const { s, snap } = fourPlayers({ houseCut: 400 })
    snap.tournament.bankerPlayerId = 'p4'
    const net = netOf(money(snap, s, [prize('p4', 3600)]).peerToPeer)
    for (const id of ['p1', 'p2', 'p3']) expect(net.get(id)).toBe(-1000)
    expect(net.get('p4')).toBe(3000)
    expect(net.has(null)).toBe(false)
  })

  it('money already with the bank is handed out by the bank, not asked for again', () => {
    const { s, snap } = fourPlayers()
    for (const p of snap.players) pay(snap, 'entry', p.id, null, 1000)
    const m = money(snap, s, [prize('p1', 4000)])
    expect(lines(m.peerToPeer)).toEqual([[null, 'p1', 4000]])
  })
})

/** A small deterministic PRNG so the property cases are the same on every run. */
function rng(seed: number) {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 4294967296
  }
}

describe('settlement properties', () => {
  it('on random tournaments and random payment states, nothing is charged twice and every line closes', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed)
      const n = 2 + Math.floor(r() * 9)
      const fee = [0, 500, 1000, 2500][Math.floor(r() * 4)]!
      const houseCut = fee > 0 && r() < 0.3 ? 100 * Math.floor(r() * 5) : 0
      const s = settings({ entryFee: fee, houseCut })
      const snap = makeSnapshot({ players: n, rounds: 1, settings: s })
      const ids = snap.players.map((p) => p.id)
      const pick = () => ids[Math.floor(r() * n)]!
      snap.tournament.bankerPlayerId = r() < 0.5 ? pick() : null

      // The pot, split into prizes so the bank balances.
      const prizes: PrizeAward[] = []
      let left = fee * n - houseCut
      while (left > 0) {
        const amt = Math.min(left, 100 * (1 + Math.floor(r() * 20)))
        prizes.push(prize(pick(), amt, { label: `Premio ${prizes.length + 1}` }))
        left -= amt
      }
      // A Calcutta: some lots sold, some bought back; the pot paid back out as shares.
      const lots: Array<Record<string, unknown>> = []
      let pot = 0
      for (const id of ids) {
        if (r() < 0.5) continue
        const owner = pick()
        const price = 250 * (1 + Math.floor(r() * 6))
        const pct = owner !== id && r() < 0.4 ? 50 : 0
        const lotId = `lot-${id}`
        lots.push({ lotId, playerId: id, lotNumber: lots.length + 1, status: 'sold', price, ownerId: owner, buybackPct: pct, buybackAmount: (price * pct) / 100 })
        if (pct) snap.calcuttaBuybacks.push({ lotId, pct, amount: (price * pct) / 100, paid: r() < 0.5 })
        pot += price
      }
      if (pot > 0) prizes.push(prize(pick(), pot, { potId: 'calcutta', moduleId: 'auction', label: 'Calcutta' }))
      // A few direct bets.
      for (let b = 0; b < 3; b++) {
        const [from, to] = [pick(), pick()]
        if (from !== to && r() < 0.5) prizes.push(prize(to, 50 * (1 + Math.floor(r() * 10)), { payerId: from, moduleId: 'skins', label: `Apuesta ${b}` }))
      }
      const auction = { lots } as unknown as AuctionState

      // Random payment state on every key: nothing, in full, partly, or overpaid.
      const keyOwed = new Map<string, { kind: PaymentKind; from: Id | null; to: Id | null; owed: number }>()
      const add = (kind: PaymentKind, from: Id | null, to: Id | null, amount: number) => {
        const k = `${kind}|${from}|${to}`
        const e = keyOwed.get(k) ?? { kind, from, to, owed: 0 }
        e.owed += amount
        keyOwed.set(k, e)
      }
      if (fee > 0) for (const id of ids) add('entry', id, null, fee)
      for (const l of lots) add('calcutta', l.ownerId as Id, null, l.price as number)
      for (const p of prizes) add(p.payerId ? 'bet' : 'payout', p.payerId ?? null, p.playerId, p.amount)
      const paidOn = new Map<string, number>()
      for (const [k, e] of keyOwed) {
        const x = r()
        const amount = x < 0.4 ? 0 : x < 0.7 ? e.owed : x < 0.9 ? Math.floor(e.owed / 2) : e.owed + 100
        if (amount > 0) pay(snap, e.kind, e.from, e.to, amount)
        paidOn.set(k, amount)
      }

      // The oracle: what each party is still owed, straight from the inputs.
      const expected = new Map<Id | null, number>(ids.map((id) => [id, 0]))
      expected.set(null, 0)
      const move = (from: Id | null, to: Id | null, due: number) => {
        expected.set(from, expected.get(from)! - due)
        expected.set(to, expected.get(to)! + due)
      }
      for (const [k, e] of keyOwed) move(e.from, e.to, e.owed - paidOn.get(k)!)
      for (const l of lots) {
        const bb = snap.calcuttaBuybacks.find((b) => b.lotId === l.lotId)
        if (bb && !bb.paid) move(l.playerId as Id, l.ownerId as Id, bb.amount)
      }

      const m = money(snap, s, prizes, auction)
      const ctx = `seed ${seed}`

      // Vía banco: each party ends exactly square, and no account is in two lines.
      const via = netOf(m.viaBank)
      for (const [id, due] of expected) expect(via.get(id) ?? 0, `${ctx}: vía banco for ${id}`).toBe(due)
      const seen = new Set<string>()
      for (const t of m.viaBank) {
        expect(t.amount, ctx).toBeGreaterThan(0)
        expect(Number.isInteger(t.amount), ctx).toBe(true)
        for (const a of t.settles!) {
          const k = `${a.kind}|${a.from}|${a.to}`
          expect(seen.has(k), `${ctx}: ${k} charged twice`).toBe(false)
          seen.add(k)
        }
      }

      // Sin banco: the same positions, the banker carrying the bank's.
      const p2p = netOf(m.peerToPeer)
      const banker = snap.tournament.bankerPlayerId
      for (const [id, due] of expected) {
        if (id === null && banker) continue
        const want = banker && id === banker ? due + expected.get(null)! : due
        expect(p2p.get(id) ?? 0, `${ctx}: sin banco for ${id}`).toBe(want)
      }

      // Marking every line paid closes everything.
      for (const t of m.viaBank) apply(snap, markPaidWrites(t.settles!))
      const after = money(snap, s, prizes, auction)
      expect(after.viaBank, ctx).toEqual([])
      expect(after.peerToPeer, ctx).toEqual([])
    }
  })
})
