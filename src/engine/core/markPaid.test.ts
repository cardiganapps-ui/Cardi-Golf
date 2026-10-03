/**
 * «Ya pagaron» (UX-21): a payment marked by mistake can be taken back, and
 * taking it back writes nothing but its own row. Each case marks, then
 * un-marks (or undoes), and expects the money from before the first tap:
 * the same flows, the same accounts and dues, the same settlement.
 *
 * `server` is `set_payment_paid` (0010_admin_safety.sql) and the buyback flag
 * written out by hand, so the engine's own model of a write
 * (`applyPaidWrites`, what Dinero shows before the reload) is checked against
 * it instead of against itself.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../computeTournament'
import { getFixture } from '../../dev/fixtures'
import { parseSettings } from '../settings/schema'
import type { Id, PaymentKind, Snapshot } from '../types'
import { applyPaidWrites, markPaidWrites, restorePaidWrites, unmarkPaidWrites, type Account, type MoneyState, type PaidWrite } from './money'

/** One row per (kind, from, to): the upsert replaces amount, paid and note. A buyback is `update ... set paid where lot_id`. */
function server(snap: Snapshot, writes: PaidWrite[]) {
  for (const w of writes) {
    if ('lotId' in w) {
      for (const b of snap.calcuttaBuybacks) if (b.lotId === w.lotId) b.paid = w.paid
      continue
    }
    const row = snap.payments.find((p) => p.kind === w.kind && p.fromPlayerId === w.from && p.toPlayerId === w.to)
    if (row) {
      row.amount = w.amount
      row.paid = w.paid
      row.note = null
    } else snap.payments.push({ id: `srv${snap.payments.length + 1}`, kind: w.kind, fromPlayerId: w.from, toPlayerId: w.to, amount: w.amount, paid: w.paid, note: null })
  }
}

function setup(name: 'full12-live' | 'full12-finished') {
  const snap = structuredClone(getFixture(name)!.snapshot)
  const settings = parseSettings(snap.tournament.settings)
  return { snap, money: (): MoneyState => computeTournament(snap, settings).money }
}

const account = (m: MoneyState, kind: PaymentKind, from: Id | null, to: Id | null = null) => m.accounts.find((a) => a.kind === kind && a.from === from && a.to === to)!
/** The rows a write may not touch: every payment on another key, and every buyback on another lot. */
const others = (snap: Snapshot, a: Account) => ({
  payments: snap.payments.filter((p) => !(p.kind === a.kind && p.fromPlayerId === a.from && p.toPlayerId === a.to)),
  buybacks: snap.calcuttaBuybacks.filter((b) => b.lotId !== a.lotId),
})
/** What Dinero lists: «Quién debe qué» (still due) and «Ya pagaron» (something recorded). */
const owedList = (m: MoneyState) => m.accounts.filter((a) => a.due > 0 && a.from !== null).map((a) => `${a.kind}|${a.from}|${a.to}`)
const paidList = (m: MoneyState) => m.accounts.filter((a) => a.paid > 0).map((a) => `${a.kind}|${a.from}|${a.to}`)

describe('«Marcar pagado», then «Pagado» tapped off in «Ya pagaron» (UX-21)', () => {
  it('an entry fee comes back exactly as it was', () => {
    const { snap, money } = setup('full12-live')
    const before = money()
    const entry = account(before, 'entry', 'p11')
    expect(entry).toMatchObject({ owed: 2500, paid: 0, due: 2500 })
    const untouched = structuredClone(others(snap, entry))

    server(snap, markPaidWrites([entry]))
    const marked = money()
    expect(account(marked, 'entry', 'p11')).toMatchObject({ paid: 2500, due: 0 })
    expect(owedList(marked)).not.toContain('entry|p11|null')
    expect(paidList(marked)).toContain('entry|p11|null')

    const writes = unmarkPaidWrites([account(marked, 'entry', 'p11')])
    // The same write as the mark, on the same key, with paid false; nothing else.
    expect(writes).toEqual([{ kind: 'entry', from: 'p11', to: null, amount: 2500, paid: false }])
    server(snap, writes)
    expect(money()).toEqual(before)
    expect(others(snap, entry)).toEqual(untouched)
  })

  it('a Calcutta purchase of three lots comes back exactly as it was', () => {
    const { snap, money } = setup('full12-live')
    const before = money()
    const lots = before.flows.filter((f) => f.kind === 'calcutta' && f.from === 'p11')
    expect(lots.length).toBe(3)
    const purchase = account(before, 'calcutta', 'p11')
    expect(purchase).toMatchObject({ owed: lots.reduce((s, f) => s + f.amount, 0), paid: 0 })
    const untouched = structuredClone(others(snap, purchase))

    server(snap, markPaidWrites([purchase]))
    const marked = money()
    expect(marked.flows.filter((f) => f.kind === 'calcutta' && f.from === 'p11').every((f) => f.paid)).toBe(true)
    expect(paidList(marked)).toContain('calcutta|p11|null')

    server(snap, unmarkPaidWrites([account(marked, 'calcutta', 'p11')]))
    expect(money()).toEqual(before)
    expect(others(snap, purchase)).toEqual(untouched)
  })

  it('a buyback is taken back on its lot, and only there', () => {
    const { snap, money } = setup('full12-live')
    const before = money()
    const buyback = before.accounts.find((a) => a.kind === 'buyback' && a.due > 0)!
    const untouched = structuredClone(others(snap, buyback))
    server(snap, markPaidWrites([buyback]))
    const marked = money()
    const paid = marked.accounts.find((a) => a.kind === 'buyback' && a.from === buyback.from && a.to === buyback.to)!
    expect(paid.due).toBe(0)
    expect(unmarkPaidWrites([paid])).toEqual([{ lotId: buyback.lotId, paid: false }])
    server(snap, unmarkPaidWrites([paid]))
    expect(money()).toEqual(before)
    expect(others(snap, buyback)).toEqual(untouched)
  })

  it('a vía-banco line marked by mistake: each account it closed shows in «Ya pagaron», and taking them back restores the line', () => {
    const { snap, money } = setup('full12-finished')
    const before = money()
    const line = before.viaBank.find((t) => t.to === 'p3' && t.from === null)!
    expect(line.settles!.length).toBeGreaterThan(1)
    server(snap, markPaidWrites(line.settles!))
    const marked = money()
    expect(marked.viaBank.some((t) => t.to === 'p3' && t.from === null)).toBe(false)
    const back = line.settles!.map((a) => account(marked, a.kind, a.from, a.to))
    for (const a of back) expect(paidList(marked)).toContain(`${a.kind}|${a.from}|${a.to}`)
    server(snap, unmarkPaidWrites(back))
    expect(money()).toEqual(before)
  })
})

describe('«Deshacer» puts back exactly what the tap changed', () => {
  it('after «Marcar pagado» on a partly paid purchase: back to the lot already paid, not to nothing', () => {
    const { snap, money } = setup('full12-live')
    const [first] = money().flows.filter((f) => f.kind === 'calcutta' && f.from === 'p11')
    // The owner paid his first lot on the night; the other two are still due.
    server(snap, [{ kind: 'calcutta', from: 'p11', to: null, amount: first!.amount, paid: true }])
    const before = money()
    const partly = account(before, 'calcutta', 'p11')
    expect(partly.paid).toBe(first!.amount)
    expect(partly.due).toBeGreaterThan(0)
    server(snap, markPaidWrites([partly]))
    expect(account(money(), 'calcutta', 'p11').due).toBe(0)
    server(snap, restorePaidWrites([partly]))
    expect(money()).toEqual(before)
  })

  it('after taking a payment back: the payment is recorded again, as it was', () => {
    const { snap, money } = setup('full12-live')
    const before = money()
    const paid = account(before, 'entry', 'p1')
    expect(paid).toMatchObject({ paid: 2500, due: 0 })
    server(snap, unmarkPaidWrites([paid]))
    expect(account(money(), 'entry', 'p1')).toMatchObject({ paid: 0, due: 2500 })
    expect(owedList(money())).toContain('entry|p1|null')
    server(snap, restorePaidWrites([paid]))
    expect(money()).toEqual(before)
  })

  it('a buyback paid before the mistake is paid again', () => {
    const { snap, money } = setup('full12-live')
    const before = money()
    const paid = before.accounts.find((a) => a.kind === 'buyback' && a.paid > 0)!
    server(snap, unmarkPaidWrites([paid]))
    expect(money().accounts.find((a) => a.kind === 'buyback' && a.from === paid.from && a.to === paid.to)!.due).toBe(paid.owed)
    server(snap, restorePaidWrites([paid]))
    expect(money()).toEqual(before)
  })
})

describe('what Dinero shows before the reload is what the server will hold', () => {
  it('applyPaidWrites leaves the snapshot the server leaves, over random marks, un-marks and undos', () => {
    let seed = 7
    const r = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    const a = setup('full12-finished')
    const b = setup('full12-finished')
    for (let step = 0; step < 200; step++) {
      const accounts = a.money().accounts
      const pick = accounts[Math.floor(r() * accounts.length)]!
      const x = r()
      const writes = x < 0.4 ? markPaidWrites([pick]) : x < 0.8 ? unmarkPaidWrites([pick]) : restorePaidWrites([pick])
      server(a.snap, writes)
      applyPaidWrites(b.snap, writes)
      const rows = (s: Snapshot) => s.payments.map(({ id: _id, ...p }) => p)
      expect(rows(b.snap), `step ${step}`).toEqual(rows(a.snap))
      expect(b.snap.calcuttaBuybacks, `step ${step}`).toEqual(a.snap.calcuttaBuybacks)
    }
    expect(b.money()).toEqual(a.money())
    // Hundreds of recomputes of a 12-player tournament: give it room on a loaded machine (and under the coverage `npm test` measures).
  }, 20_000)
})
