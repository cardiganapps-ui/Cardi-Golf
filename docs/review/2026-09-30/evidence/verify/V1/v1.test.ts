/**
 * V1 verifier: independent repro for MONEY-01 / MONEY-04 / COPY-03 / UX-21 / MONEY-07.
 * Pipeline = exactly what the app runs (tournamentStore.compute): parseSettings(snapshot.tournament.settings)
 * then computeTournament. MoneyScreen's own expressions are copied verbatim (cited lines).
 * Run: cd /home/user/Cardi-Golf && npx vitest run --config <this dir>/vitest.config.mts
 */
import { afterAll, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { computeTournament, type TournamentState } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { parseSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import { getFixture } from '/home/user/Cardi-Golf/src/dev/fixtures'
import type { Flow, MoneyState, Transfer } from '/home/user/Cardi-Golf/src/engine/core/money'
import type { Snapshot } from '/home/user/Cardi-Golf/src/engine/types'
import { formatMoney, formatSignedMoney } from '/home/user/Cardi-Golf/src/lib/money'

const DIR = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V1'
const out: Record<string, unknown> = {}
const log: string[] = []
afterAll(() => {
  writeFileSync(`${DIR}/v1.result.json`, JSON.stringify(out, null, 1))
  writeFileSync(`${DIR}/v1.ledger.txt`, log.join('\n'))
})

const run = (snap: Snapshot): TournamentState => computeTournament(snap, parseSettings(snap.tournament.settings))
// MoneyScreen.tsx:64 verbatim
const owedOf = (m: MoneyState) => m.flows.filter((f) => !f.paid && (f.kind === 'entry' || f.kind === 'calcutta' || f.kind === 'buyback' || f.kind === 'side' || (f.kind === 'bet' && f.final)))
// MoneyScreen.tsx:90 verbatim
const payoutPaidOf = (m: MoneyState, playerId: string) => m.flows.filter((f) => f.kind === 'payout' && f.to === playerId).every((f) => f.paid) && m.flows.some((f) => f.kind === 'payout' && f.to === playerId)

/** set_payment_paid (0010:317-333): one row per (kind, from, to); upsert replaces paid AND amount. */
function upsertPayment(snap: Snapshot, kind: Flow['kind'], from: string | null, to: string | null, amount: number, paid: boolean) {
  const i = snap.payments.findIndex((p) => p.kind === kind && p.fromPlayerId === from && p.toPlayerId === to)
  const row = { id: i >= 0 ? snap.payments[i]!.id : `sim-${kind}-${from}-${to}`, fromPlayerId: from, toPlayerId: to, amount, kind, paid, note: null }
  if (i >= 0) snap.payments[i] = row
  else snap.payments.push(row)
}
/** MoneyScreen.tsx:77-87 toggle(f, paid) */
function tapChecklistPagado(snap: Snapshot, st: TournamentState, f: Flow) {
  if (f.kind === 'buyback') {
    const lot = st.modules.auction?.lots.find((l) => l.playerId === f.from && l.ownerId === f.to)
    const bb = snap.calcuttaBuybacks.find((b) => b.lotId === lot?.lotId)
    if (bb) bb.paid = true
  } else {
    const amount = st.money.flows.filter((x) => x.kind === f.kind && x.from === f.from && x.to === f.to).reduce((s, x) => s + x.amount, 0)
    upsertPayment(snap, f.kind, f.from, f.to, amount, true)
  }
}
/** MoneyScreen.tsx:88 togglePayout(tr.to, tr.amount, true) */
const tapViaBankPagado = (snap: Snapshot, tr: Transfer) => upsertPayment(snap, 'payout', null, tr.to, tr.amount, true)

type Wallet = Map<string, number>
const move = (w: Wallet, from: string | null, to: string | null, amt: number) => {
  w.set(from ?? 'BANK', (w.get(from ?? 'BANK') ?? 0) - amt)
  w.set(to ?? 'BANK', (w.get(to ?? 'BANK') ?? 0) + amt)
}
/** Cash that actually moved before Sunday, as the snapshot records it (payments rows paid + buybacks paid). */
function historical(snap: Snapshot, st: TournamentState): Wallet {
  const w: Wallet = new Map()
  for (const p of snap.payments) if (p.paid && p.kind !== 'payout') move(w, p.fromPlayerId, p.toPlayerId, p.amount)
  for (const b of snap.calcuttaBuybacks) {
    if (!b.paid) continue
    const lot = st.modules.auction!.lots.find((l) => l.lotId === b.lotId)!
    // Use the engine's amount (pct × price); the design fixture's lot7 row carries pct 25 with amount 1000 (fixture artifact).
    move(w, lot.playerId, lot.ownerId, lot.buybackAmount)
  }
  return w
}

function report(title: string, snap: Snapshot, st: TournamentState, w: Wallet) {
  const name = (id: string) => snap.players.find((p) => p.id === id)?.displayName ?? id
  const rows = snap.players.map((p) => {
    const target = st.money.people[p.id]!.net
    const got = w.get(p.id) ?? 0
    return { id: p.id, name: name(p.id), wallet: got, trueNet: target, error: got - target }
  })
  const bankTarget = st.money.banker.difference + st.money.banker.houseCut
  const bank = { wallet: w.get('BANK') ?? 0, target: bankTarget, error: (w.get('BANK') ?? 0) - bankTarget }
  log.push(`\n=== ${title} ===`)
  for (const r of rows) log.push(`${r.id.padEnd(4)} ${r.name.padEnd(10)} wallet ${formatSignedMoney(r.wallet).padStart(9)}  true net ${formatSignedMoney(r.trueNet).padStart(9)}  error ${formatSignedMoney(r.error).padStart(9)}`)
  log.push(`BANK            wallet ${formatSignedMoney(bank.wallet).padStart(9)}  target   ${formatSignedMoney(bank.target).padStart(9)}  error ${formatSignedMoney(bank.error).padStart(9)}`)
  const wrong = rows.filter((r) => r.error !== 0).length
  log.push(`players with the wrong wallet: ${wrong}/${rows.length}; Σ|error| players = ${formatMoney(rows.reduce((s, r) => s + Math.abs(r.error), 0))}`)
  return { rows, bank, wrong }
}

function fixture() {
  const fx = getFixture('full12-finished')!
  return structuredClone(fx.snapshot)
}

describe('full12-finished: what the screen says, with the app pipeline', () => {
  it('dumps the per-person ledger, Quién debe qué, Vía banco and Sin banco', () => {
    const snap = fixture()
    const st = run(snap)
    const m = st.money
    const name = (id: string | null) => (id ? (snap.players.find((p) => p.id === id)?.displayName ?? id) : 'Banco')
    log.push(`status=${snap.tournament.status} tournamentFinal=${st.tournamentFinal} banker=${name(snap.tournament.bankerPlayerId)} bank receives ${formatMoney(m.banker.receives)} pays ${formatMoney(m.banker.pays)} difference ${formatMoney(m.banker.difference)} balanced=${m.banker.balanced}`)
    log.push(`flags: pendingSnake=${st.flags.pendingSnakeTiebreaks.length} warnings=${JSON.stringify(st.flags.warnings)}`)
    log.push('\n--- per person (engine PersonMoney) ---')
    for (const p of snap.players) {
      const pm = m.people[p.id]!
      const markedPaid = m.flows.filter((f) => f.from === p.id && f.paid).reduce((s, f) => s + f.amount, 0)
      log.push(`${p.id.padEnd(4)} ${p.displayName.padEnd(10)} entry ${pm.entry} purchases ${pm.calcuttaPurchases} bbPaid ${pm.buybacksPaid} | prizes ${pm.prizesTotal} shares ${pm.calcuttaShares} bbRecv ${pm.buybacksReceived} | "Pagó" ${pm.paid} (flows actually marked paid: ${markedPaid}) recibe ${pm.receives} neto ${pm.net}`)
    }
    const owed = owedOf(m)
    log.push('\n--- Quién debe qué (MoneyScreen.tsx:64) ---')
    for (const f of owed) log.push(`${name(f.from)} paga a ${name(f.to)} ${formatMoney(f.amount)} · ${f.kind}`)
    log.push('\n--- Vía banco (money.viaBank) ---')
    for (const t of m.viaBank) log.push(`${name(t.from)} paga a ${name(t.to)} ${formatMoney(t.amount)}`)
    log.push('\n--- Sin banco (money.peerToPeer) ---')
    for (const t of m.peerToPeer) log.push(`${name(t.from)} paga a ${name(t.to)} ${formatMoney(t.amount)}`)
    log.push('\n--- flows marked paid ---')
    for (const f of m.flows.filter((x) => x.paid)) log.push(`${name(f.from)} → ${name(f.to)} ${formatMoney(f.amount)} ${f.kind} (${f.label})`)
    out.fixtureSummary = {
      bank: m.banker,
      owed: owed.map((f) => ({ from: f.from, to: f.to, amount: f.amount, kind: f.kind })),
      viaBank: m.viaBank,
      peerToPeer: m.peerToPeer,
      people: Object.fromEntries(snap.players.map((p) => [p.id, { name: p.displayName, ...m.people[p.id]!, markedPaid: m.flows.filter((f) => f.from === p.id && f.paid).reduce((s, f) => s + f.amount, 0) }])),
    }
    // The specific claims
    const camilo = m.viaBank.find((t) => t.to === 'p3')
    expect(camilo).toEqual({ from: null, to: 'p3', amount: 7700 })
    expect(m.flows.find((f) => f.kind === 'entry' && f.from === 'p2')!.paid).toBe(true)
    expect(m.viaBank).toContainEqual({ from: 'p2', to: null, amount: 2500 })
  })
})

describe('MONEY-01: a banker following the screen', () => {
  it('S0: nobody paid anything ahead; banker follows Vía banco only → every wallet right (the list IS the no-prepayment settlement)', () => {
    const snap = fixture()
    snap.payments = []
    snap.calcuttaBuybacks.forEach((b) => (b.paid = false))
    const st = run(snap)
    const w: Wallet = new Map()
    for (const t of st.money.viaBank) move(w, t.from, t.to, t.amount)
    out.S0 = report('S0 nothing prepaid, Sunday: Vía banco only', snap, st, w)
    expect((out.S0 as { wrong: number }).wrong).toBe(0)
  })

  it('S0b: nobody paid ahead; banker follows Quién debe qué then Vía banco (both lists on the same screen)', () => {
    const snap = fixture()
    snap.payments = []
    snap.calcuttaBuybacks.forEach((b) => (b.paid = false))
    const st = run(snap)
    const w: Wallet = new Map()
    for (const f of owedOf(st.money)) move(w, f.from, f.to, f.amount)
    for (const t of st.money.viaBank) move(w, t.from, t.to, t.amount)
    out.S0b = report('S0b nothing prepaid, Sunday: Quién debe qué, then Vía banco', snap, st, w)
  })

  it('S1: fixture as recorded (10 entries + some buybacks paid); Sunday: Quién debe qué, then Vía banco', () => {
    const snap = fixture()
    const st = run(snap)
    const w = historical(snap, st)
    for (const f of owedOf(st.money)) move(w, f.from, f.to, f.amount)
    for (const t of st.money.viaBank) move(w, t.from, t.to, t.amount)
    out.S1 = report('S1 recorded state, Sunday: Quién debe qué, then Vía banco', snap, st, w)
  })

  it('S2: fixture as recorded; Sunday: Vía banco only', () => {
    const snap = fixture()
    const st = run(snap)
    const w = historical(snap, st)
    for (const t of st.money.viaBank) move(w, t.from, t.to, t.amount)
    out.S2 = report('S2 recorded state, Sunday: Vía banco only', snap, st, w)
  })

  it('S3: RUNBOOK §1.8 — Thursday everything in Quién debe qué collected and ticked; Sunday: Vía banco', () => {
    const snap = fixture()
    const st0 = run(snap)
    const w = historical(snap, st0)
    // Thursday night: collect each owed row and tap Pagado (as MoneyScreen does), recompute after each tap.
    let st = st0
    for (let guard = 0; guard < 50; guard++) {
      const owed = owedOf(st.money)
      if (!owed.length) break
      const f = owed[0]!
      // cash for the aggregate the tap records (the row shows one flow; the tap records the aggregate for that key)
      const agg = f.kind === 'buyback' ? f.amount : st.money.flows.filter((x) => x.kind === f.kind && x.from === f.from && x.to === f.to && !x.paid).reduce((s, x) => s + x.amount, 0)
      move(w, f.from, f.to, agg)
      tapChecklistPagado(snap, st, f)
      st = run(snap)
    }
    expect(owedOf(st.money)).toEqual([])
    const viaBankBefore = JSON.stringify(st0.money.viaBank)
    const viaBankAfter = JSON.stringify(st.money.viaBank)
    log.push(`\nS3: Vía banco identical before/after every debt ticked Pagado: ${viaBankBefore === viaBankAfter}`)
    log.push(`S3: cash collected by the bank on Thursday: ${formatMoney(w.get('BANK') ?? 0)}; bank "Sale del banco" (gross payouts) ${formatMoney(st.money.banker.pays)}`)
    const bankInList = st.money.viaBank.filter((t) => t.to === null).reduce((s, t) => s + t.amount, 0)
    const bankOutList = st.money.viaBank.filter((t) => t.from === null).reduce((s, t) => s + t.amount, 0)
    log.push(`S3: Vía banco asks people to pay the bank ${formatMoney(bankInList)} more and the bank to pay out ${formatMoney(bankOutList)}`)
    for (const t of st.money.viaBank) move(w, t.from, t.to, t.amount)
    out.S3 = { identicalViaBank: viaBankBefore === viaBankAfter, bankInList, bankOutList, ...report('S3 RUNBOOK: everything collected Thursday; Sunday: Vía banco', snap, st, w) }
    expect(viaBankBefore).toBe(viaBankAfter)
  })

  it('S4 (reference, §11 reading): everything collected Thursday; Sunday: bank pays each winner gross prizes + Calcutta shares', () => {
    const snap = fixture()
    const st0 = run(snap)
    const w = historical(snap, st0)
    let st = st0
    for (let guard = 0; guard < 50; guard++) {
      const owed = owedOf(st.money)
      if (!owed.length) break
      const f = owed[0]!
      const agg = f.kind === 'buyback' ? f.amount : st.money.flows.filter((x) => x.kind === f.kind && x.from === f.from && x.to === f.to && !x.paid).reduce((s, x) => s + x.amount, 0)
      move(w, f.from, f.to, agg)
      tapChecklistPagado(snap, st, f)
      st = run(snap)
    }
    for (const f of st.money.flows) if (f.kind === 'payout') move(w, f.from, f.to, f.amount)
    out.S4 = report('S4 reference: everything collected Thursday; Sunday: bank pays gross payouts', snap, st, w)
    expect((out.S4 as { wrong: number }).wrong).toBe(0)
  })

  it('S5: everything collected Thursday; Sunday: Sin banco', () => {
    const snap = fixture()
    const st0 = run(snap)
    const w = historical(snap, st0)
    let st = st0
    for (let guard = 0; guard < 50; guard++) {
      const owed = owedOf(st.money)
      if (!owed.length) break
      const f = owed[0]!
      const agg = f.kind === 'buyback' ? f.amount : st.money.flows.filter((x) => x.kind === f.kind && x.from === f.from && x.to === f.to && !x.paid).reduce((s, x) => s + x.amount, 0)
      move(w, f.from, f.to, agg)
      tapChecklistPagado(snap, st, f)
      st = run(snap)
    }
    for (const t of st.money.peerToPeer) move(w, t.from, t.to, t.amount)
    out.S5 = report('S5 everything collected Thursday; Sunday: Sin banco', snap, st, w)
  })
})

describe('MONEY-04: Pagado on a vía-banco payout', () => {
  it('recorded fixture state: tap Pagado on every Banco→X row; count rows that show as paid afterwards', () => {
    const snap = fixture()
    const st0 = run(snap)
    const rows = st0.money.viaBank.filter((t) => t.from === null && t.to)
    for (const tr of rows) tapViaBankPagado(snap, tr)
    const st = run(snap)
    const res = rows.map((tr) => {
      const gross = st.money.flows.filter((f) => f.kind === 'payout' && f.to === tr.to).reduce((s, f) => s + f.amount, 0)
      return { to: tr.to, rowAmount: tr.amount, paymentWritten: tr.amount, grossPayouts: gross, showsPaid: payoutPaidOf(st.money, tr.to!) }
    })
    log.push('\n=== MONEY-04 recorded state: Pagado tapped on every Banco→X row ===')
    for (const r of res) log.push(`${r.to}: row ${formatMoney(r.rowAmount)} written ${formatMoney(r.paymentWritten)} gross payouts ${formatMoney(r.grossPayouts)} → shows paid: ${r.showsPaid}`)
    const personToBank = st0.money.viaBank.filter((t) => t.to === null).length
    const peer = st0.money.viaBank.filter((t) => t.from !== null && t.to !== null).length
    log.push(`rows with no Pagado control at all (canMark false): person→Banco ${personToBank}, person→person ${peer}; Sin banco rows ${st0.money.peerToPeer.length}`)
    out.MONEY04 = { rows: res, stuck: res.filter((r) => r.showsPaid).length, of: res.length, noControl: { personToBank, peer, sinBanco: st0.money.peerToPeer.length } }
    expect(res.every((r) => !r.showsPaid)).toBe(true)
  })

  it('the only way it sticks: a winner with no entry and no purchases (net == gross)', () => {
    const snap = fixture()
    const settings = parseSettings(snap.tournament.settings)
    // Counterfactual: a tournament with entry fee 0 and nothing bought would have net == gross.
    const st = run(snap)
    const anyNetEqualsGross = st.money.viaBank.some((t) => t.from === null && t.to && st.money.flows.filter((f) => f.kind === 'payout' && f.to === t.to).reduce((s, f) => s + f.amount, 0) === t.amount)
    log.push(`MONEY-04: entryFee=${settings.entryFee}; any Banco→X row whose net equals gross payouts: ${anyNetEqualsGross}`)
    out.MONEY04b = { entryFee: settings.entryFee, anyNetEqualsGross }
  })
})

describe('COPY-03: "Pagó" vs what is marked paid', () => {
  it('full12-finished: Pagó figure vs flows actually marked paid; share text line', () => {
    const snap = fixture()
    const st = run(snap)
    const lines: string[] = []
    for (const p of snap.players) {
      const pm = st.money.people[p.id]!
      const marked = st.money.flows.filter((f) => f.from === p.id && f.paid).reduce((s, f) => s + f.amount, 0)
      // MoneyScreen.tsx:94 share text, verbatim format
      lines.push(`${p.displayName}: pagó ${formatMoney(pm.paid)}, recibe ${formatMoney(pm.receives)}, neto ${formatSignedMoney(pm.net)}   [actually marked paid: ${formatMoney(marked)}]`)
    }
    log.push('\n=== COPY-03 full12-finished share text vs marked ===', ...lines)
    out.COPY03 = lines
  })

  it('friends8 (platform, live): Pagó includes bet losses that are not final', () => {
    const fx = getFixture('friends8')!
    const snap = structuredClone(fx.snapshot)
    const st = run(snap)
    const rows = snap.players.map((p) => {
      const pm = st.money.people[p.id]!
      const liveBets = st.money.flows.filter((f) => f.kind === 'bet' && f.from === p.id && !f.final).reduce((s, f) => s + f.amount, 0)
      const finalBets = st.money.flows.filter((f) => f.kind === 'bet' && f.from === p.id && f.final).reduce((s, f) => s + f.amount, 0)
      return { id: p.id, name: p.displayName, pago: pm.paid, entry: pm.entry, sidePots: pm.sidePots, betsPaid: pm.betsPaid, liveBetsInPago: liveBets, finalBets }
    })
    log.push('\n=== COPY-03 friends8 (live): Pagó composition ===')
    for (const r of rows) log.push(`${r.id} ${r.name.padEnd(10)} Pagó ${formatMoney(r.pago)} = entry ${r.entry} + side ${r.sidePots} + bets ${r.betsPaid} (of which not final: ${r.liveBetsInPago})`)
    out.COPY03friends8 = rows
  })
})

describe('UX-21: a Pagado tap on Quién debe qué', () => {
  it('after one tap the debt leaves the checklist; the payment row is the only record', () => {
    const snap = fixture()
    const st0 = run(snap)
    const owed0 = owedOf(st0.money)
    const target = owed0.find((f) => f.kind === 'entry')!
    tapChecklistPagado(snap, st0, target)
    const st1 = run(snap)
    const owed1 = owedOf(st1.money)
    const stillListed = owed1.some((f) => f.kind === target.kind && f.from === target.from)
    log.push(`\n=== UX-21: tapped Pagado on ${target.kind} from ${target.from} ${formatMoney(target.amount)}; checklist ${owed0.length} → ${owed1.length} rows; still listed: ${stillListed}`)
    const vb0 = JSON.stringify(st0.money.viaBank)
    const vb1 = JSON.stringify(st1.money.viaBank)
    log.push(`UX-21: Vía banco changed by the tap: ${vb0 !== vb1}`)
    out.UX21 = { target: { kind: target.kind, from: target.from, amount: target.amount }, before: owed0.length, after: owed1.length, stillListed, viaBankChanged: vb0 !== vb1 }
    expect(stillListed).toBe(false)
  })
})
