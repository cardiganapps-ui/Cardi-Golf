import { describe, expect, it } from 'vitest'
import { computeTournament } from '../../computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from '../../settings/presets'
import { makeFirstTournament, score } from '../../testing/fixtures'
import type { Snapshot } from '../../types'
import { assignSlots, payoutsToOwners } from './index'
import type { ModuleContext } from '../module'
import { computeCore } from '../../core/compute'

const S = FIRST_TOURNAMENT_SETTINGS

/** Sell every lot for $1,000 to a fixed owner map → pot $12,000. */
function sellAll(snap: Snapshot, ownerOf: (pid: string) => string = (pid) => pid, price = 1000) {
  snap.players.forEach((p, i) => {
    snap.calcuttaLots.push({
      id: `lot${i + 1}`,
      playerId: p.id,
      lotNumber: i + 1,
      status: 'sold',
      price,
      ownerId: ownerOf(p.id),
      soldAt: '2027-04-08T20:00:00Z',
    })
  })
}

/** Give every player a full 2-round card with `totalPoints(pid)` points (par-based, so no countback ties unless equal). */
function scoreEveryone(snap: Snapshot, totalPoints: (pid: string) => number) {
  const holes = snap.courses[0]!.tees[0]!.holes
  for (const p of snap.players) {
    const target = totalPoints(p.id) // over 36 holes
    // Day 1 = floor(target/2), Day 2 = ceil(target/2), spread as 2s with 3s/1s on the front nine.
    for (const [ri, rid] of ['r1', 'r2'].entries()) {
      const dayPts = ri === 0 ? Math.floor(target / 2) : Math.ceil(target / 2)
      const pr = computeCore(snap, S).rounds[rid]![p.id]!
      let remaining = dayPts
      for (let h = 1; h <= 18; h++) {
        const hole = holes[h - 1]!
        const sr = pr.holes[h - 1]!.strokesReceived
        const left = 18 - h
        const pts = Math.max(0, Math.min(4, remaining - 2 * left))
        const takeMax = Math.min(4, remaining - left * 0) // no more than remaining
        const use = Math.min(Math.max(pts, remaining - left * 4 > 0 ? remaining - left * 4 : 0), takeMax)
        const chosen = Math.min(remaining, Math.max(use, remaining > 2 * left ? Math.min(remaining - 2 * left, 4) : 0))
        remaining -= chosen
        snap.scores.push(score(rid, p.id, h, hole.par + sr + 2 - chosen))
      }
    }
  }
  snap.rounds.forEach((r) => (r.status = 'finished'))
}

function ctxFor(snap: Snapshot): ModuleContext {
  const core = computeCore(snap, S)
  return { snapshot: snap, settings: S, core, tournamentFinal: true, roundFinal: { r1: true, r2: true } }
}

describe('La Calcutta', () => {
  it('pot $12,000 → slots $6,600 / $2,400 / $1,200 / $1,200 / $600', () => {
    const snap = makeFirstTournament()
    sellAll(snap)
    const ctx = ctxFor(snap)
    // Hand ranking: p1 (A) champion, p4 (B) 2nd, p7 (C) 3rd, p10 (D) 4th, ..., p12 last.
    const order = ['p1', 'p4', 'p7', 'p10', 'p2', 'p5', 'p8', 'p11', 'p3', 'p6', 'p9', 'p12']
    const groups = order.map((id, i) => ({ position: i + 1, members: [id] }))
    const slots = assignSlots(ctx, 12000, groups)
    expect(slots.map((s) => [s.label, s.amount, s.playerIds[0]])).toEqual([
      ['Campeón', 6600, 'p1'],
      ['Subcampeón', 2400, 'p4'],
      ['Mejor C', 1200, 'p7'],
      ['Mejor D', 1200, 'p10'],
      ['La Cuchara de Palo', 600, 'p12'],
    ])
  })

  it('champion is a C player and 3rd is also C → Best C goes to the 3rd-place player', () => {
    const snap = makeFirstTournament()
    sellAll(snap)
    const ctx = ctxFor(snap)
    const order = ['p7', 'p1', 'p8', 'p10', 'p2', 'p4', 'p5', 'p11', 'p3', 'p6', 'p9', 'p12']
    const groups = order.map((id, i) => ({ position: i + 1, members: [id] }))
    const slots = assignSlots(ctx, 12000, groups)
    const by = Object.fromEntries(slots.map((s) => [s.label, s.playerIds]))
    expect(by['Campeón']).toEqual(['p7'])
    expect(by['Mejor C']).toEqual(['p8'])
  })

  it('runner-up is a D player → Best D goes to the next-best D', () => {
    const snap = makeFirstTournament()
    sellAll(snap)
    const ctx = ctxFor(snap)
    const order = ['p1', 'p10', 'p7', 'p11', 'p2', 'p4', 'p5', 'p8', 'p3', 'p6', 'p9', 'p12']
    const groups = order.map((id, i) => ({ position: i + 1, members: [id] }))
    const by = Object.fromEntries(assignSlots(ctx, 12000, groups).map((s) => [s.label, s.playerIds]))
    expect(by['Subcampeón']).toEqual(['p10'])
    expect(by['Mejor D']).toEqual(['p11'])
  })

  it('champion owned 50% by X and 50% by himself after buyback → X $3,300, champion $3,300', () => {
    const snap = makeFirstTournament()
    sellAll(snap, (pid) => (pid === 'p1' ? 'p2' : pid))
    snap.calcuttaBuybacks.push({ lotId: 'lot1', pct: 50, amount: 500, paid: true })
    const ctx = ctxFor(snap)
    const order = ['p1', 'p4', 'p7', 'p10', 'p2', 'p5', 'p8', 'p11', 'p3', 'p6', 'p9', 'p12']
    const groups = order.map((id, i) => ({ position: i + 1, members: [id] }))
    const state = computeTournament(snap, S)
    const lots = state.modules.auction!.lots
    expect(lots[0]!.owners).toEqual([
      { ownerId: 'p2', pct: 50, paid: 500 },
      { ownerId: 'p1', pct: 50, paid: 500 },
    ])
    const payouts = payoutsToOwners(lots, assignSlots(ctx, 12000, groups), 12000)
    expect(payouts.p2!.lines.find((l) => l.playerId === 'p1')!.amount).toBe(3300)
    expect(payouts.p1!.lines.find((l) => l.playerId === 'p1')!.amount).toBe(3300)
  })

  it('two tied for 1st after full countback → each gets (55% + 20%) / 2 = 37.5%', () => {
    const snap = makeFirstTournament()
    sellAll(snap)
    const ctx = ctxFor(snap)
    const groups = [
      { position: 1, members: ['p1', 'p4'] },
      ...['p7', 'p10', 'p2', 'p5', 'p8', 'p11', 'p3', 'p6', 'p9', 'p12'].map((id, i) => ({ position: i + 3, members: [id] })),
    ]
    const slots = assignSlots(ctx, 12000, groups)
    expect(slots[0]!.label).toBe('Campeón + Subcampeón')
    expect(slots[0]!.share).toBeCloseTo(0.75)
    expect(slots[0]!.playerIds).toEqual(['p1', 'p4'])
    const payouts = payoutsToOwners(snap.calcuttaLots.map((l) => ({
      lotId: l.id, playerId: l.playerId, lotNumber: l.lotNumber, status: 'sold' as const, price: 1000, ownerId: l.ownerId,
      buybackPct: 0, buybackAmount: 0, owners: [{ ownerId: l.playerId, pct: 100, paid: 1000 }], currentBid: null,
    })), slots, 12000)
    expect(payouts.p1!.amount).toBe(4500)
    expect(payouts.p4!.amount).toBe(4500)
  })

  it('rounding remainder goes to the champion’s owners and payouts sum exactly to the pot', () => {
    const snap = makeFirstTournament()
    // Pot $11,750 (odd numbers): 11 × $1,000 + $750.
    sellAll(snap)
    snap.calcuttaLots[11]!.price = 750
    const ctx = ctxFor(snap)
    const order = ['p1', 'p4', 'p7', 'p10', 'p2', 'p5', 'p8', 'p11', 'p3', 'p6', 'p9', 'p12']
    const groups = order.map((id, i) => ({ position: i + 1, members: [id] }))
    const lots = computeTournament(snap, S).modules.auction!.lots
    const pot = 11750
    const payouts = payoutsToOwners(lots, assignSlots(ctx, pot, groups), pot)
    const total = Object.values(payouts).reduce((s, p) => s + p.amount, 0)
    expect(total).toBe(pot)
    // 0.55 × 11750 = 6462.5 → 6462 + remainder
    expect(payouts.p1!.lines.some((l) => l.slotLabel === 'Redondeo')).toBe(true)
  })

  it('end to end from scores: live payouts, portfolios and the balance flag', () => {
    const snap = makeFirstTournament()
    sellAll(snap, (pid) => (pid === 'p12' ? 'p1' : pid))
    const pts: Record<string, number> = {
      p1: 80, p2: 60, p3: 58, p4: 72, p5: 62, p6: 56, p7: 70, p8: 64, p9: 55, p10: 68, p11: 61, p12: 50,
    }
    scoreEveryone(snap, (pid) => pts[pid]!)
    const state = computeTournament(snap, S)
    const a = state.modules.auction!
    expect(a.pot).toBe(12000)
    expect(a.balanced).toBe(true)
    expect(Object.values(a.payouts).reduce((s, p) => s + p.amount, 0)).toBe(12000)
    const rows = state.modules.individual!.rows
    expect(rows[0]!.playerId).toBe('p1')
    expect(rows.at(-1)!.playerId).toBe('p12')
    // p1 owns p12 (last place) too: champion $6,600 + Cuchara $600.
    expect(a.payouts.p1!.amount).toBe(7200)
    const pf = a.portfolios.find((p) => p.ownerId === 'p1')!
    expect(pf.invested).toBe(2000)
    expect(pf.value).toBe(7200)
    expect(pf.roi).toBeCloseTo(2.6)
  })

  it('holdings count self-owned lots toward the limit when the setting says so', () => {
    const snap = makeFirstTournament()
    sellAll(snap, (pid) => (['p1', 'p2', 'p3'].includes(pid) ? 'p4' : pid))
    const a = computeTournament(snap, S).modules.auction!
    expect(a.holdings.p4).toBe(4) // p1, p2, p3 + himself
    const s2 = structuredClone(S)
    s2.auction.selfOwnedCountsTowardMax = false
    expect(computeTournament(snap, s2).modules.auction!.holdings.p4).toBe(3)
  })
})
