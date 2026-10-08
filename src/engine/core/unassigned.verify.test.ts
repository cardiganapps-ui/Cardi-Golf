/**
 * The verifier's adversarial checks on #104 (MONEY-05), round 2: money is
 * conserved under every change after an assignment, Dinero and the «Cerrar
 * torneo» gate read the same «play is over» flag (V1, V3), and snake money an
 * unanswered tiebreak holds never shares a line with money the Comité
 * assigns (V4).
 */
import { describe, expect, it } from 'vitest'
import { computeTournament, type TournamentState } from '../computeTournament'
import { closeCheck } from '../close'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import type { TournamentSettings } from '../settings/schema'
import { fillRound, makeFirstTournament, makePlayer, makeRound, makeSnapshot, PAR_72, score } from '../testing/fixtures'
import type { MoneyAdjustment, Snapshot } from '../types'
import { proRata } from './unassigned'
import { FIXTURE_NAMES, getFixture } from '../../dev/fixtures'

const S = FIRST_TOURNAMENT_SETTINGS
const PARS = PAR_72.map(([p]) => p)
const run = (snap: Snapshot, settings = snap.tournament.settings as TournamentSettings) => computeTournament(snap, settings)
let serial = 0
function call(sourceKey: string, rows: Array<Pick<MoneyAdjustment, 'kind' | 'toPlayerId' | 'amount'>>, reason = 'Decidido'): MoneyAdjustment[] {
  serial++
  const createdAt = `2027-04-12T09:${String(serial % 60).padStart(2, '0')}:00+00:00`
  const callId = `v${String(serial).padStart(4, '0')}`
  return rows.map((r, i) => ({ id: `${callId}-${i}`, callId, sourceKey, reason, createdAt, createdBy: 'org', voidedAt: null, voidReason: null, ...r }))
}
const twoPutts = (snap: Snapshot) => snap.scores.forEach((s) => (s.putts = Math.min(2, s.strokes ?? 2)))
/** Every snake tiebreak answered (the first candidate holed out last); an answer can bring the group's next tie up. */
function answerAll(snap: Snapshot, settings: TournamentSettings) {
  for (let pending = computeTournament(snap, settings).flags.pendingSnakeTiebreaks; pending.length; pending = computeTournament(snap, settings).flags.pendingSnakeTiebreaks) {
    for (const p of pending) snap.snakeTiebreaks.push({ roundId: p.roundId, groupId: p.groupId, hole: p.hole, lastHoledPlayerId: p.candidates[0]! })
  }
}

const keyed = (st: TournamentState) => Object.fromEntries(st.money.unassigned.buckets.map((b) => [b.key, b.remaining]))

/** Conservation: what the bank received = what it pays + house + still unassigned; people + bank net to zero; sin banco zero-sum. */
function conserved(st: TournamentState) {
  const b = st.money.banker
  expect(b.receives - b.pays - b.houseCut - b.toHouse, 'bank identity').toBe(b.difference)
  expect(st.money.netSum, 'netSum').toBe(0)
  const net = new Map<string | null, number>()
  for (const tr of st.money.peerToPeer) {
    net.set(tr.from, (net.get(tr.from) ?? 0) - tr.amount)
    net.set(tr.to, (net.get(tr.to) ?? 0) + tr.amount)
  }
  expect([...net.values()].reduce((s, x) => s + x, 0)).toBe(0)
  // Only paid assignments move money.
  const applied = st.money.unassigned.assignments.filter((a) => a.status === 'applied').reduce((s, a) => s + a.total, 0)
  const moved = st.prizes.filter((p) => p.moduleId === 'adjustment').reduce((s, p) => s + p.amount, 0) + b.toHouse
  expect(moved, 'only applied assignments move').toBe(applied)
}

function cancelledDay2(): Snapshot {
  const snap = makeFirstTournament()
  fillRound(snap, 'r1', 1)
  twoPutts(snap)
  snap.rounds[0]!.status = 'finished'
  snap.rounds[1]!.status = 'cancelled'
  return snap
}

describe('V1: Dinero (closing, not final) and the gate (forced final) agree', () => {
  it('a one-round tournament cancelled by the weather: Dinero lists the money the gate blocks on', () => {
    const settings: TournamentSettings = { ...structuredClone(DEFAULT_SETTINGS), rounds: 1, entryFee: 1000, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [2500, 1500] } }
    const snap = makeSnapshot({ settings, players: 4, rounds: 1 })
    snap.rounds[0]!.status = 'cancelled'
    const dinero = run(snap, settings)
    const gate = closeCheck(snap, settings, { openRejected: 0 })
    const gateUnassigned = gate.blockers.find((b) => b.kind === 'unassigned')
    // If the gate blocks on money, Dinero must list it so the Comité can assign it.
    if (gateUnassigned) expect(dinero.money.unassigned.total, `gate says ${gateUnassigned.text}`).toBeGreaterThan(0)
    expect(dinero.money.unassigned.total).toBe(4000)
  })

  it('two-day event, day 2 cancelled: same buckets in Dinero and in the gate', () => {
    const snap = cancelledDay2()
    const dinero = run(snap, S)
    const final = run({ ...snap, tournament: { ...snap.tournament, status: 'finished' } }, S)
    expect(keyed(final)).toEqual(keyed(dinero))
  })

  it('day 1 finished and day 2 not created yet: nothing is «por asignar» between days', () => {
    const snap = makeFirstTournament()
    snap.rounds = [snap.rounds[0]!]
    snap.groups = snap.groups.filter((g) => g.roundId === 'r1')
    fillRound(snap, 'r1', 1)
    twoPutts(snap)
    snap.rounds[0]!.status = 'finished'
    const st = run(snap, S)
    expect(st.tournamentFinal).toBe(false)
    expect(st.money.unassigned.closing, `buckets: ${JSON.stringify(keyed(st))}`).toBe(false)
    // The gate agrees: nothing about money, only the day to create.
    expect(closeCheck(snap, S, { openRejected: 0 }).blockers.map((b) => b.kind)).toEqual(['missingRounds', 'unsignedCards'])
  })
})

describe('V2: mutate after assigning — no double pay, flagged, conserved', () => {
  it('cancelled day 2 refunded pro rata, then day 2 un-cancelled and played', () => {
    const snap = cancelledDay2()
    const st0 = run(snap, S)
    const adj: MoneyAdjustment[] = []
    for (const b of st0.money.unassigned.buckets) adj.push(...call(b.key, proRata(b.remaining, b.contributors!).map((c) => ({ kind: 'refund' as const, toPlayerId: c.playerId, amount: c.amount }))))
    snap.moneyAdjustments = adj
    const st1 = run(snap, S)
    expect(st1.money.unassigned.total).toBe(0)
    conserved(st1)
    // Mark everything paid (MONEY-01), as the banker would on Sunday.
    for (const a of st1.money.accounts) if (a.due > 0) snap.payments.push({ id: `pay-${a.kind}-${a.from}-${a.to}`, kind: a.kind, fromPlayerId: a.from, toPlayerId: a.to, amount: a.owed, paid: true, note: null })
    const st2 = run(snap, S)
    expect(st2.money.viaBank.filter((t) => t.amount > 0)).toEqual([])
    // Now the round comes back and is played.
    snap.rounds[1]!.status = 'finished'
    fillRound(snap, 'r2', 9)
    twoPutts(snap)
    const st3 = run(snap, S)
    conserved(st3)
    expect(st3.money.unassigned.assignments.every((a) => a.status !== 'applied')).toBe(true)
    expect(st3.prizes.filter((p) => p.moduleId === 'adjustment')).toEqual([])
    // The refunds already handed over must now come back: someone owes the bank.
    const owedBack = st3.money.accounts.filter((a) => a.kind === 'payout' && a.due < 0).reduce((s, a) => s - a.due, 0)
    expect(owedBack).toBeGreaterThan(0)
    const gate = closeCheck(snap, S, { openRejected: 0 })
    expect(gate.blockers.map((b) => b.kind)).toContain('badAssignments')
  })

  it('a Calcutta bucket refunded, then the missing lot sold late', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 1)
    fillRound(snap, 'r2', 2)
    twoPutts(snap)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    snap.players.forEach((p, i) => {
      if (p.tier !== 'D') snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 1000, ownerId: p.id, soldAt: '' })
      else snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'pending', price: null, ownerId: null, soldAt: null })
    })
    const st0 = run(snap, S)
    const b = st0.money.unassigned.buckets.find((x) => x.key === 'calcutta')!
    snap.moneyAdjustments = call('calcutta', proRata(b.remaining, b.contributors!).map((c) => ({ kind: 'refund', toPlayerId: c.playerId, amount: c.amount })))
    conserved(run(snap, S))
    // A D lot sold late (pot grows, slot filled).
    const d = snap.calcuttaLots.find((l) => l.status === 'pending')!
    Object.assign(d, { status: 'sold', price: 2000, ownerId: 'p1' })
    const st2 = run(snap, S)
    conserved(st2)
    const statuses = st2.money.unassigned.assignments.map((a) => a.status)
    // Either still fits or flagged; never both the new slot and the full refund beyond the pot.
    const calcuttaOut = st2.prizes.filter((p) => p.potId === 'calcutta').reduce((s, p) => s + p.amount, 0)
    expect(calcuttaOut, `statuses ${statuses}`).toBeLessThanOrEqual(st2.modules.auction!.pot)
  })

  it('void after marked paid: exact prior state, the player owes it back', () => {
    const snap = cancelledDay2()
    const before = run(snap, S)
    snap.moneyAdjustments = call('bestRound', [{ kind: 'award', toPlayerId: 'p5', amount: 1200 }])
    const mid = run(snap, S)
    const acct = mid.money.accounts.find((a) => a.kind === 'payout' && a.to === 'p5')!
    snap.payments.push({ id: 'payp5', kind: 'payout', fromPlayerId: null, toPlayerId: 'p5', amount: acct.owed, paid: true, note: null })
    snap.moneyAdjustments = snap.moneyAdjustments.map((a) => ({ ...a, voidedAt: '2027-04-13T00:00:00+00:00', voidReason: 'error' }))
    const after = run(snap, S)
    expect(keyed(after)).toEqual(keyed(before))
    expect(after.money.people.p5!.prizesTotal).toBe(before.money.people.p5!.prizesTotal)
    const a2 = after.money.accounts.find((a) => a.kind === 'payout' && a.to === 'p5')!
    expect(a2.due).toBe(-1200)
    conserved(after)
  })

  it('a score corrected so a place beyond the field becomes filled after the Comité assigned it', () => {
    const settings: TournamentSettings = { ...structuredClone(DEFAULT_SETTINGS), rounds: 1, entryFee: 1500, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [3000, 1500, 1000, 500] } }
    const players = Array.from({ length: 4 }, (_, i) => makePlayer(i + 1, { baseHcp: 0 }))
    const snap = makeSnapshot({ settings, players, rounds: [makeRound(1)] })
    // p4 never played: the 4th place is nobody's.
    for (let i = 1; i <= 3; i++) for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', `p${i}`, h, PARS[h - 1]! + (h <= i ? 1 : 0)))
    snap.rounds[0]!.status = 'finished'
    snap.tournament.status = 'finished'
    const st0 = run(snap, settings)
    expect(keyed(st0)).toEqual({ individual: 500 })
    snap.moneyAdjustments = call('individual', [{ kind: 'award', toPlayerId: 'p3', amount: 500 }])
    conserved(run(snap, settings))
    // p4's card turns up.
    for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', 'p4', h, PARS[h - 1]! + 2))
    const st2 = run(snap, settings)
    conserved(st2)
    const indiv = st2.prizes.filter((p) => p.moduleId === 'individual' || (p.moduleId === 'adjustment' && p.sourceKey === 'individual')).reduce((s, p) => s + p.amount, 0)
    expect(indiv).toBe(6000)
    expect(st2.money.unassigned.assignments.map((a) => a.status)).toEqual(['orphan'])
  })

  it('house + award + refund mix, partially voided, the bank still adds up', () => {
    const snap = cancelledDay2()
    snap.moneyAdjustments = [
      ...call('snake', [{ kind: 'house', toPlayerId: null, amount: 800 }]),
      ...call('snake', [{ kind: 'award', toPlayerId: 'p2', amount: 1000 }]),
      ...call('bestRound', proRata(1200, snap.players.map((p) => ({ playerId: p.id, amount: 2500 }))).map((c) => ({ kind: 'refund' as const, toPlayerId: c.playerId, amount: c.amount }))),
    ]
    const st = run(snap, S)
    expect(st.money.unassigned.total).toBe(0)
    expect(st.money.banker.difference).toBe(0)
    conserved(st)
    // Void the house one only.
    snap.moneyAdjustments = snap.moneyAdjustments.map((a) => (a.kind === 'house' ? { ...a, voidedAt: 'x', voidReason: 'no' } : a))
    const st2 = run(snap, S)
    expect(keyed(st2)).toEqual({ snake: 800 })
    expect(st2.money.banker.difference).toBe(800)
    conserved(st2)
  })

  it('no banker: sin banco carries the house money with the bank', () => {
    const snap = cancelledDay2()
    snap.tournament.bankerPlayerId = null
    snap.moneyAdjustments = [...call('snake', [{ kind: 'house', toPlayerId: null, amount: 1800 }]), ...call('bestRound', [{ kind: 'award', toPlayerId: 'p7', amount: 1200 }])]
    const st = run(snap, S)
    conserved(st)
    expect(st.money.unassigned.total).toBe(0)
  })

  it('an over-assignment followed by a smaller valid one: order by time, not by id', () => {
    const snap = cancelledDay2()
    const a = call('bestRound', [{ kind: 'award', toPlayerId: 'p2', amount: 1200 }])
    const b = call('bestRound', [{ kind: 'award', toPlayerId: 'p3', amount: 1200 }])
    // Give the later call an id that sorts first.
    b.forEach((r) => (r.id = 'a-first'))
    snap.moneyAdjustments = [...b, ...a]
    const st = run(snap, S)
    expect(st.money.unassigned.assignments.map((x) => [x.rows[0]!.toPlayerId, x.status])).toEqual([
      ['p2', 'applied'],
      ['p3', 'over'],
    ])
    conserved(st)
  })
})


describe('V3: every dev fixture, play over: assign what Dinero lists, then the gate passes on money', () => {
  for (const name of FIXTURE_NAMES) {
    it(name, () => {
      const f = getFixture(name)!
      const snap: Snapshot = structuredClone(f.snapshot)
      const settings = snap.tournament.settings as TournamentSettings
      // Play over: every round finished (cancel those with no scores), tournament not yet Terminado.
      for (const r of snap.rounds) r.status = snap.scores.some((s) => s.roundId === r.id) ? 'finished' : 'cancelled'
      if (snap.tournament.status === 'finished') snap.tournament.status = 'live'
      const dinero = run(snap, settings)
      const adj: MoneyAdjustment[] = []
      for (const b of dinero.money.unassigned.buckets) adj.push(...call(b.key, [{ kind: 'house', toPlayerId: null, amount: b.remaining }]))
      snap.moneyAdjustments = adj
      // Snake money a tiebreak holds is answered, not assigned.
      answerAll(snap, settings)
      const after = run(snap, settings)
      conserved(after)
      expect(after.money.unassigned.total).toBe(0)
      expect(after.money.unassigned.heldTotal).toBe(0)
      const gate = closeCheck(snap, settings, { openRejected: 0 })
      const money = gate.blockers.filter((b) => b.kind === 'unassigned' || b.kind === 'badAssignments')
      expect(money.map((b) => b.text), `Dinero listed ${JSON.stringify(keyed(dinero))}`).toEqual([])
      // And once Terminado, the books stay balanced.
      const fin = run({ ...snap, tournament: { ...snap.tournament, status: 'finished' } }, settings)
      conserved(fin)
      expect(fin.money.banker.difference).toBe(0)
    })
  }
})

describe('V4: one line, two causes', () => {
  /** Day 1 played with an unanswered tiebreak in group 1 (p1 and p10 three-putt the 18th), day 2 rained out. */
  function tiebreakAndRain(): Snapshot {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 3)
    twoPutts(snap)
    for (const s of snap.scores) if (s.hole === 18 && (s.playerId === 'p1' || s.playerId === 'p10')) Object.assign(s, { strokes: Math.max(s.strokes ?? 0, 4), putts: 3 })
    snap.rounds[0]!.status = 'finished'
    snap.rounds[1]!.status = 'cancelled'
    return snap
  }
  const answer = (snap: Snapshot) => snap.snakeTiebreaks.push({ roundId: 'r1', groupId: 'r1g1', hole: 18, lastHoledPlayerId: 'p10' })
  /** What the snake's line pays (its own prizes and the Comité's), what it still lists, and what it holds: always its budget, 3 groups × 2 days × $600. */
  function snakeLine(st: TournamentState) {
    const out = st.prizes.filter((p) => p.moduleId === 'snake' || (p.moduleId === 'adjustment' && p.sourceKey === 'snake')).reduce((s, p) => s + p.amount, 0)
    const house = st.money.unassigned.assignments.filter((a) => a.status === 'applied' && a.sourceKey === 'snake').flatMap((a) => a.rows).filter((r) => r.kind === 'house').reduce((s, r) => s + r.amount, 0)
    return out + house + (keyed(st).snake ?? 0) + st.money.unassigned.heldTotal
  }

  it('the cancelled day is «por asignar»; the tiebreak’s group money is held apart, with the answer as the way out', () => {
    const st = run(tiebreakAndRain(), S)
    expect(keyed(st)).toEqual({ bestRound: 1200, snake: 1800 })
    expect(st.money.unassigned.held.map((h) => [h.key, h.amount, h.note])).toEqual([['snake:r1:r1g1', 600, 'Responde el desempate del hoyo 18 («¿Quién embocó al último?») en Comité, sección Tarjetas.']])
    expect(snakeLine(st)).toBe(3600)
    conserved(st)
  })

  it('what Dinero offers, refunded; then the tiebreak answered: the refund stays paid and the group is paid once', () => {
    const snap = tiebreakAndRain()
    const st0 = run(snap, S)
    const b = st0.money.unassigned.buckets.find((x) => x.key === 'snake')!
    snap.moneyAdjustments = call('snake', proRata(b.remaining, b.contributors!).map((c) => ({ kind: 'refund' as const, toPlayerId: c.playerId, amount: c.amount })))
    expect(keyed(run(snap, S))).toEqual({ bestRound: 1200 })
    answer(snap)
    const st = run(snap, S)
    conserved(st)
    expect(st.money.unassigned.assignments.map((a) => [a.total, a.status])).toEqual([[1800, 'applied']])
    expect(st.money.unassigned.held).toEqual([])
    // p4 survived group 1: the snake's $200, and his $150 of the rained-out day. Nothing twice.
    const p4 = st.prizes.filter((p) => p.playerId === 'p4' && (p.moduleId === 'snake' || p.sourceKey === 'snake')).map((p) => [p.label, p.amount])
    expect(p4).toEqual([
      ['La Víbora, día 1, grupo 1', 200],
      ['La Víbora, devolución', 150],
    ])
    expect(snakeLine(st)).toBe(3600)
  })

  it('the verifier’s order (an award, then a refund «de más», voided): answering changes no line and no decision', () => {
    const snap = tiebreakAndRain()
    // The Comité gives $600 of the line to three players, then tries to refund all $1,800 of it.
    const award = call('snake', [
      { kind: 'award', toPlayerId: 'p4', amount: 200 },
      { kind: 'award', toPlayerId: 'p7', amount: 200 },
      { kind: 'award', toPlayerId: 'p10', amount: 200 },
    ])
    const refund = call('snake', proRata(1800, snap.players.map((p) => ({ playerId: p.id, amount: 2500 }))).map((c) => ({ kind: 'refund' as const, toPlayerId: c.playerId, amount: c.amount })))
    snap.moneyAdjustments = [...award, ...refund]
    let st = run(snap, S)
    expect(st.money.unassigned.assignments.map((a) => [a.total, a.status])).toEqual([
      [600, 'applied'],
      [1800, 'over'],
    ])
    // The award is the rained-out day's money: it says so, and group 1's $600 is still held.
    const prize = st.prizes.find((p) => p.moduleId === 'adjustment' && p.playerId === 'p4')!
    expect(prize.why.steps[0]).toBe('La Víbora: $1,800 sin asignar')
    expect(st.money.unassigned.heldTotal).toBe(600)
    // The flagged refund voided, as the app says.
    snap.moneyAdjustments = [...award, ...refund.map((r) => ({ ...r, voidedAt: '2027-04-13T00:00:00+00:00', voidReason: 'De más' }))]
    st = run(snap, S)
    const before = { keyed: keyed(st), status: st.money.unassigned.assignments.map((a) => [a.total, a.status]) }
    expect(before).toEqual({ keyed: { bestRound: 1200, snake: 1200 }, status: [[600, 'applied']] })
    expect(snakeLine(st)).toBe(3600)
    answer(snap)
    st = run(snap, S)
    conserved(st)
    // The answer pays group 1 from its own held money: no line and no decision moves.
    expect({ keyed: keyed(st), status: st.money.unassigned.assignments.map((a) => [a.total, a.status]) }).toEqual(before)
    expect(st.money.unassigned.held).toEqual([])
    expect(snakeLine(st)).toBe(3600)
    expect(st.money.banker.difference).toBe(st.money.unassigned.total)
  })
})
