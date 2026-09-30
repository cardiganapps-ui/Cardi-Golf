// UX-12: after every debt is marked paid (the RUNBOOK's Calcutta-night collection), what does "vía banco" tell the banker to do?
import { describe, expect, it } from 'vitest'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { FIRST_TOURNAMENT_SETTINGS as S } from '/home/user/Cardi-Golf/src/engine/settings/presets'
import { fillRound, makeFirstTournament } from '/home/user/Cardi-Golf/src/engine/testing/fixtures'

describe('vía banco after up-front collection', () => {
  it('still charges entries and purchases that were already paid', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 11)
    fillRound(snap, 'r2', 12)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    snap.tournament.status = 'finished'
    snap.players.forEach((p, i) => {
      const owner = snap.players[(i + 1) % 12]!.id
      snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 250 + 250 * (i % 4), ownerId: owner, soldAt: '' })
    })
    for (let i = 0; i < 20; i++) {
      const pending = computeTournament(snap, S).flags.pendingSnakeTiebreaks
      if (!pending.length) break
      for (const q of pending) snap.snakeTiebreaks.push({ roundId: q.roundId, groupId: q.groupId, hole: q.hole, lastHoledPlayerId: q.candidates[0]! })
    }
    const before = computeTournament(snap, S).money
    // Calcutta night: every entry and every hammer price collected and marked "Pagado".
    let n = 0
    for (const f of before.flows) if (f.kind === 'entry' || f.kind === 'calcutta') snap.payments.push({ id: `pay${++n}`, fromPlayerId: f.from, toPlayerId: null, amount: f.amount, kind: f.kind, paid: true, note: null })
    const after = computeTournament(snap, S).money
    const owedAfter = after.flows.filter((f) => !f.paid && (f.kind === 'entry' || f.kind === 'calcutta'))
    const playerToBank = after.viaBank.filter((t) => t.from && t.to === null)
    const bankOut = after.viaBank.filter((t) => t.from === null).reduce((s, t) => s + t.amount, 0)
    console.log(JSON.stringify({ owedAfter: owedAfter.length, viaBankUnchanged: JSON.stringify(before.viaBank) === JSON.stringify(after.viaBank), playerToBankRows: playerToBank.length, playerToBankTotal: playerToBank.reduce((s, t) => s + t.amount, 0), bankPaysOutViaBank: bankOut, bankerPaysGross: after.banker.pays }))
    expect(owedAfter.length).toBe(0) // nothing left to collect…
    expect(JSON.stringify(after.viaBank)).toBe(JSON.stringify(before.viaBank)) // …yet vía banco did not change
    expect(playerToBank.length).toBeGreaterThan(0) // players are asked to pay the bank again
    expect(bankOut).toBeLessThan(after.banker.pays) // and the bank pays out less than it owes
  })
})
