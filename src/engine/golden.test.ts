/**
 * Golden: the first tournament (all six modules, a Calcutta, payments) must
 * compute exactly the same prizes and money across engine refactors. The
 * snapshot was written before the games/pots foundation landed.
 *
 * Deliberate changes: 2026-10-01 (MONEY-01) the settlement runs on what is
 * still due. p1 paid his entry, so «Vía banco» asks him for $800, not
 * $3,300 («Sin banco» is unchanged: p1 is the banker and paid himself).
 * Which accounts a line closes is covered in core/settlement.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from './computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from './settings/presets'
import { fillRound, makeFirstTournament } from './testing/fixtures'

function finishedFirstTournament() {
  const snap = makeFirstTournament()
  fillRound(snap, 'r1', 11)
  fillRound(snap, 'r2', 12)
  snap.rounds.forEach((r) => (r.status = 'finished'))
  snap.tournament.status = 'finished'
  snap.players.forEach((p, i) => {
    const owner = snap.players[(i + 1) % 12]!.id
    snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 250 + 250 * (i % 4), ownerId: owner, soldAt: '' })
  })
  snap.calcuttaBuybacks.push({ lotId: 'lot1', pct: 50, amount: 125, paid: false })
  snap.payments.push({ id: 'pay1', fromPlayerId: 'p1', toPlayerId: null, amount: 2500, kind: 'entry', paid: true, note: null })
  for (let i = 0; i < 20; i++) {
    const pending = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS).flags.pendingSnakeTiebreaks
    if (!pending.length) break
    for (const q of pending) snap.snakeTiebreaks.push({ roundId: q.roundId, groupId: q.groupId, hole: q.hole, lastHoledPlayerId: q.candidates[0]! })
  }
  return snap
}

describe('golden: first tournament', () => {
  it('prizes and money are unchanged', () => {
    const st = computeTournament(finishedFirstTournament(), FIRST_TOURNAMENT_SETTINGS)
    const prizes = st.prizes.map((p) => ({ moduleId: p.moduleId, label: p.label, playerId: p.playerId, amount: p.amount, final: p.final }))
    const flows = st.money.flows.map((f) => ({ from: f.from, to: f.to, amount: f.amount, kind: f.kind, label: f.label, paid: f.paid }))
    const people = Object.values(st.money.people).map((m) => ({ id: m.playerId, prizesTotal: m.prizesTotal, calcuttaShares: m.calcuttaShares, paid: m.paid, receives: m.receives, net: m.net }))
    expect({ prizes, flows, people, banker: { playerId: st.money.banker.playerId, receives: st.money.banker.receives, pays: st.money.banker.pays, difference: st.money.banker.difference, balanced: st.money.banker.balanced }, viaBank: st.money.viaBank.map(({ from, to, amount }) => ({ from, to, amount })), peerToPeer: st.money.peerToPeer, warnings: st.flags.warnings }).toMatchSnapshot()
  })
})
