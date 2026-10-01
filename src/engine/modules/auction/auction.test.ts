import { describe, expect, it } from 'vitest'
import { computeTournament, type TournamentState } from '../../computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from '../../settings/presets'
import { makeFirstTournament, score } from '../../testing/fixtures'
import type { CalcuttaBuyback, Snapshot } from '../../types'
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

/**
 * QA-03: buybacks other than 50%. At 50% the buyer's and the player's shares
 * are equal, so swapping them or dropping the cap could not show. Every number
 * below is worked by hand from §5.9: the player buys back a share of himself by
 * paying his buyer that share of the hammer price, player to owner, and each
 * slot's money splits by the shares.
 */
describe('La Calcutta: buybacks other than 50% (QA-03)', () => {
  /** Points over 36 holes: p1 (A) champion, p4 (B) runner-up, p7 best C, p10 best D, p12 last; p2 and p5 cash no slot. */
  const POINTS: Record<string, number> = { p1: 80, p2: 60, p3: 58, p4: 72, p5: 62, p6: 56, p7: 70, p8: 64, p9: 55, p10: 68, p11: 61, p12: 50 }

  /** Every lot sold at $1,000 (pot $12,000), the given buybacks stored, both rounds played. */
  function played(ownerOf: (pid: string) => string, buybacks: CalcuttaBuyback[], opts: { settings?: typeof S; edit?: (snap: Snapshot) => void } = {}): TournamentState {
    const snap = makeFirstTournament()
    sellAll(snap, ownerOf)
    opts.edit?.(snap)
    snap.calcuttaBuybacks.push(...buybacks)
    scoreEveryone(snap, (pid) => POINTS[pid]!)
    return computeTournament(snap, opts.settings ?? S)
  }

  const byFirst = (a: Array<string | number | null>, b: Array<string | number | null>) => String(a[0]).localeCompare(String(b[0]))
  const lotOf = (st: TournamentState, playerId: string) => st.modules.auction!.lots.find((l) => l.playerId === playerId)!
  /** What each owner cashes from one player's slot, as [owner, amount, pct], by owner. */
  const shares = (st: TournamentState, playerId: string) =>
    Object.values(st.modules.auction!.payouts)
      .flatMap((p) => p.lines.filter((l) => l.playerId === playerId && l.slotLabel !== 'Redondeo').map((l) => [p.ownerId, l.amount, l.pct]))
      .sort(byFirst)
  const buybackFlows = (st: TournamentState) => st.money.flows.filter((f) => f.kind === 'buyback').map((f) => ({ from: f.from, to: f.to, amount: f.amount, label: f.label, lotId: f.lotId }))
  /** What the bank pays for one Calcutta slot, as [to, amount], by recipient. */
  const slotPaid = (st: TournamentState, slot: string) =>
    st.money.flows
      .filter((f) => f.kind === 'payout' && f.potId === 'calcutta' && f.label === `La Calcutta, ${slot}`)
      .map((f) => [f.to, f.amount])
      .sort(byFirst)
  const purchase = (st: TournamentState, lotNumber: number) => st.money.flows.filter((f) => f.kind === 'calcutta' && f.lotNumber === lotNumber).map((f) => [f.from, f.to, f.amount])

  it('25% of a $1,000 lot: the buyer keeps 75% for $750, the player 25% for $250, and the champion’s $6,600 splits $4,950 / $1,650', () => {
    const st = played((pid) => (pid === 'p1' ? 'p2' : pid), [{ lotId: 'lot1', pct: 25, amount: 250, paid: false }])
    const lot = lotOf(st, 'p1')
    expect([lot.ownerId, lot.price, lot.buybackPct, lot.buybackAmount]).toEqual(['p2', 1000, 25, 250])
    expect(lot.owners).toEqual([
      { ownerId: 'p2', pct: 75, paid: 750 },
      { ownerId: 'p1', pct: 25, paid: 250 },
    ])
    const champion = st.modules.auction!.slots.find((s) => s.label === 'Campeón')!
    expect([champion.playerIds, champion.amount]).toEqual([['p1'], 6600])
    expect(shares(st, 'p1')).toEqual([
      ['p1', 1650, 25],
      ['p2', 4950, 75],
    ])
    // The buyer owes the bank the whole hammer price; the player pays his buyer
    // a quarter of it, directly; the bank pays each one his share of the slot.
    expect(purchase(st, 1)).toEqual([['p2', null, 1000]])
    expect(buybackFlows(st)).toEqual([{ from: 'p1', to: 'p2', amount: 250, label: 'Recompra 25%', lotId: 'lot1' }])
    expect(slotPaid(st, 'Campeón')).toEqual([
      ['p1', 1650],
      ['p2', 4950],
    ])
    expect([st.money.people.p1!.buybacksPaid, st.money.people.p2!.buybacksReceived]).toEqual([250, 250])
    expect([st.money.people.p1!.calcuttaShares, st.money.people.p2!.calcuttaShares]).toEqual([1650, 4950])
    // What each one put in for his share of p1.
    const holding = (owner: string) => st.modules.auction!.portfolios.find((p) => p.ownerId === owner)!.holdings.find((h) => h.playerId === 'p1')
    expect([holding('p2'), holding('p1')]).toEqual([
      { playerId: 'p1', pct: 75, paid: 750 },
      { playerId: 'p1', pct: 25, paid: 250 },
    ])
    expect(st.modules.auction!.balanced).toBe(true)
  })

  it('a custom 30% on the best C: the buyer keeps 70% for $700, the player 30% for $300, and Mejor C’s $1,200 splits $840 / $360', () => {
    const st = played((pid) => (pid === 'p7' ? 'p5' : pid), [{ lotId: 'lot7', pct: 30, amount: 300, paid: false }])
    const lot = lotOf(st, 'p7')
    expect([lot.ownerId, lot.buybackPct, lot.buybackAmount]).toEqual(['p5', 30, 300])
    expect(lot.owners).toEqual([
      { ownerId: 'p5', pct: 70, paid: 700 },
      { ownerId: 'p7', pct: 30, paid: 300 },
    ])
    const bestC = st.modules.auction!.slots.find((s) => s.label === 'Mejor C')!
    expect([bestC.playerIds, bestC.amount]).toEqual([['p7'], 1200])
    expect(shares(st, 'p7')).toEqual([
      ['p5', 840, 70],
      ['p7', 360, 30],
    ])
    expect(buybackFlows(st)).toEqual([{ from: 'p7', to: 'p5', amount: 300, label: 'Recompra 30%', lotId: 'lot7' }])
    expect(slotPaid(st, 'Mejor C')).toEqual([
      ['p5', 840],
      ['p7', 360],
    ])
    expect([st.money.people.p7!.buybacksPaid, st.money.people.p5!.buybacksReceived]).toEqual([300, 300])
  })

  it('a stored 60% is held to the 50% cap: half each, and the player pays $500, not $600', () => {
    // The database takes 0–100; the cap is the engine's to apply.
    const st = played((pid) => (pid === 'p1' ? 'p2' : pid), [{ lotId: 'lot1', pct: 60, amount: 600, paid: false }])
    const lot = lotOf(st, 'p1')
    expect([lot.buybackPct, lot.buybackAmount]).toEqual([50, 500])
    expect(lot.owners).toEqual([
      { ownerId: 'p2', pct: 50, paid: 500 },
      { ownerId: 'p1', pct: 50, paid: 500 },
    ])
    expect(shares(st, 'p1')).toEqual([
      ['p1', 3300, 50],
      ['p2', 3300, 50],
    ])
    expect(buybackFlows(st)).toEqual([{ from: 'p1', to: 'p2', amount: 500, label: 'Recompra 50%', lotId: 'lot1' }])
  })

  it('the cap is the tournament’s setting: under a 25% cap a stored 50% counts as 25%', () => {
    const capped = structuredClone(S)
    capped.auction.buybackMaxPct = 25
    const st = played((pid) => (pid === 'p1' ? 'p2' : pid), [{ lotId: 'lot1', pct: 50, amount: 500, paid: false }], { settings: capped })
    expect(lotOf(st, 'p1').owners).toEqual([
      { ownerId: 'p2', pct: 75, paid: 750 },
      { ownerId: 'p1', pct: 25, paid: 250 },
    ])
    expect(shares(st, 'p1')).toEqual([
      ['p1', 1650, 25],
      ['p2', 4950, 75],
    ])
    expect(buybackFlows(st)).toEqual([{ from: 'p1', to: 'p2', amount: 250, label: 'Recompra 25%', lotId: 'lot1' }])
  })

  it('a self-owned lot with a buyback row keeps one owner: no second share, nothing paid to himself', () => {
    const st = played((pid) => pid, [{ lotId: 'lot1', pct: 50, amount: 500, paid: false }])
    expect(lotOf(st, 'p1').owners).toEqual([{ ownerId: 'p1', pct: 100, paid: 1000 }])
    expect(shares(st, 'p1')).toEqual([['p1', 6600, 100]])
    expect(slotPaid(st, 'Campeón')).toEqual([['p1', 6600]])
    expect(purchase(st, 1)).toEqual([['p1', null, 1000]])
    expect(buybackFlows(st)).toEqual([])
    expect(st.money.accounts.filter((a) => a.kind === 'buyback')).toEqual([])
    expect([st.money.people.p1!.buybacksPaid, st.money.people.p1!.buybacksReceived]).toEqual([0, 0])
  })

  it('a 25% buyback on the champion with an odd pot: each share is floored and the pesos left go to his owners, so the pot pays out exactly', () => {
    // Pot $11,750: the champion's 55% is $6,462.50 → 75% $4,846.875 and 25% $1,615.625, floored.
    const st = played((pid) => (pid === 'p1' ? 'p2' : pid), [{ lotId: 'lot1', pct: 25, amount: 250, paid: false }], {
      edit: (snap) => void (snap.calcuttaLots[11]!.price = 750),
    })
    const a = st.modules.auction!
    expect(a.pot).toBe(11750)
    expect(shares(st, 'p1')).toEqual([
      ['p1', 1615, 25],
      ['p2', 4846, 75],
    ])
    // 4,846 + 1,615 + 2,350 + 1,175 + 1,175 + 587 = 11,748: $2 of rounding.
    const rounding = Object.values(a.payouts).flatMap((p) => p.lines.filter((l) => l.slotLabel === 'Redondeo').map((l) => [p.ownerId, l.amount]))
    expect(rounding).toHaveLength(1)
    expect(['p1', 'p2']).toContain(rounding[0]![0])
    expect(rounding[0]![1]).toBe(2)
    expect(Object.values(a.payouts).reduce((s, p) => s + p.amount, 0)).toBe(11750)
    expect(a.balanced).toBe(true)
  })
})
