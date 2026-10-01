/**
 * Money and rule edge cases found in the 2026-09-28 sweep (docs/audit-2026-09-28.md,
 * engine items): each test is the scenario that used to be wrong.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from './computeTournament'
import { computeCore } from './core/compute'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from './settings/presets'
import { checkPrizePool } from './settings/prizeCheck'
import { safeParseSettings, type TournamentSettings } from './settings/schema'
import { fillRound, makeFirstTournament, makePlayer, makeRound, makeSnapshot, score } from './testing/fixtures'
import type { Snapshot } from './types'

const S = FIRST_TOURNAMENT_SETTINGS

function sellAll(snap: Snapshot, price = 1000) {
  snap.players.forEach((p, i) => snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price, ownerId: p.id, soldAt: '' }))
}

describe('Calcutta slots nobody can fill', () => {
  it('stay with the banker and are flagged, never paid as "Redondeo"', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 1)
    fillRound(snap, 'r2', 2)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    // Every D player ties for last by giving them the same terrible card.
    for (const pid of ['p10', 'p11', 'p12']) {
      snap.scores = snap.scores.filter((s) => s.playerId !== pid)
      for (const rid of ['r1', 'r2']) for (let h = 1; h <= 18; h++) snap.scores.push(score(rid, pid, h, 12, 2))
    }
    sellAll(snap)
    const st = computeTournament(snap, S)
    const a = st.modules.auction!
    // Best D is paid (the three tied D players share it); last place then has nobody left.
    const lastPlace = a.slots.find((s) => s.slot.slot === 'lastPlace')!
    expect(lastPlace.unfilled).toBe(true)
    expect(lastPlace.playerIds).toEqual([])
    expect(a.unfilled).toBe(lastPlace.amount)
    const paid = Object.values(a.payouts).reduce((s, p) => s + p.amount, 0)
    expect(paid + a.unfilled).toBe(a.pot)
    expect(a.balanced).toBe(true)
    const rounding = Object.values(a.payouts).flatMap((p) => p.lines).filter((l) => l.slotLabel === 'Redondeo')
    expect(rounding.reduce((s, l) => s + l.amount, 0)).toBeLessThan(12)
    expect(st.flags.warnings.some((w) => w.includes('sin asignar'))).toBe(true)
    // The auction pays out exactly the pot minus the unassigned slot; nothing else moves.
    expect(st.prizes.filter((p) => p.moduleId === 'auction').reduce((s, p) => s + p.amount, 0)).toBe(a.pot - a.unfilled)
  })

  it('a payout slot naming a tier the tournament does not have is rejected by the schema', () => {
    const settings = structuredClone(S)
    settings.tiers = ['1', '2', '3', '4']
    const r = safeParseSettings(settings)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.join('.').startsWith('auction.payout'))).toBe(true)
    const pairing = structuredClone(S)
    pairing.modules.pairs.pairing = [['A', 'Z']]
    expect(safeParseSettings(pairing).success).toBe(false)
  })

  it('the default settings can turn the auction on without tiers', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.modules.auction.enabled = true
    expect(safeParseSettings(settings).success).toBe(true)
  })
})

describe('Menos putts', () => {
  it('a picked-up hole counts at least the setting even when putts were entered', () => {
    const snap = makeSnapshot({ players: 2, rounds: 1, settings: S })
    for (let h = 1; h <= 18; h++) {
      snap.scores.push(score('r1', 'p1', h, 4, 2))
      snap.scores.push(score('r1', 'p2', h, 4, 2))
    }
    // p1 picks up on hole 1 having entered 2 putts: counts 3 (§18.1), so p2 wins.
    const s = snap.scores.find((x) => x.playerId === 'p1' && x.hole === 1)!
    s.pickedUp = true
    s.strokes = null
    const fp = computeTournament(snap, S).modules.fewestPutts!
    expect(fp.rows.find((r) => r.playerId === 'p1')!.putts).toBe(37)
    expect(fp.rows[0]!.playerId).toBe('p2')
    expect(fp.prizes.p2!.amount).toBe(S.prizes.fewestPutts)
    expect(fp.prizes.p1).toBeUndefined()
  })

  it('a player who withdrew after nine holes does not lead on fewest putts', () => {
    const snap = makeSnapshot({ players: 3, rounds: 1, settings: S })
    for (const pid of ['p1', 'p2']) for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', pid, h, 4, pid === 'p1' ? 2 : 1))
    for (let h = 1; h <= 9; h++) snap.scores.push(score('r1', 'p3', h, 4, 1))
    const fp = computeTournament(snap, S).modules.fewestPutts!
    expect(fp.rows.map((r) => r.playerId)).toEqual(['p2', 'p1', 'p3'])
    expect(fp.rows[2]!.complete).toBe(false)
    expect(fp.prizes.p2!.amount).toBe(S.prizes.fewestPutts)
    expect(fp.prizes.p3).toBeUndefined()
  })
})

describe('Money', () => {
  it("a multi-lot owner's payment covers his lots oldest first; the rest stays due", () => {
    const snap = makeFirstTournament()
    snap.calcuttaLots.push(
      { id: 'l1', playerId: 'p1', lotNumber: 1, status: 'sold', price: 1000, ownerId: 'p4', soldAt: '' },
      { id: 'l2', playerId: 'p2', lotNumber: 2, status: 'sold', price: 500, ownerId: 'p4', soldAt: '' },
      { id: 'l3', playerId: 'p3', lotNumber: 3, status: 'sold', price: 250, ownerId: 'p4', soldAt: '' },
    )
    snap.payments.push({ id: 'pay1', fromPlayerId: 'p4', toPlayerId: null, amount: 1000, kind: 'calcutta', paid: true, note: null })
    let st = computeTournament(snap, S)
    const lots = () => st.money.flows.filter((f) => f.kind === 'calcutta' && f.from === 'p4')
    expect(lots()).toHaveLength(3)
    expect(lots().map((f) => [f.paid, f.outstanding])).toEqual([
      [true, 0],
      [false, 500],
      [false, 250],
    ])
    expect(st.money.accounts.find((a) => a.kind === 'calcutta' && a.from === 'p4')).toMatchObject({ owed: 1750, paid: 1000, due: 750 })
    snap.payments[0]!.amount = 1750
    st = computeTournament(snap, S)
    expect(lots().every((f) => f.paid)).toBe(true)
  })

  it('pays nobody before a single hole is played', () => {
    const snap = makeFirstTournament()
    snap.tournament.status = 'auction'
    const st = computeTournament(snap, S)
    expect(st.prizes).toEqual([])
    expect(st.modules.individual!.lastPlace).toEqual([])
    expect(Object.keys(st.modules.pairs!.prizes)).toEqual([])
    expect(st.money.banker.pays).toBe(0)
  })

  it('the prize check uses the real group sizes once groups exist', () => {
    const players = Array.from({ length: 11 }, (_, i) => makePlayer(i + 1))
    const snap = makeSnapshot({ players, rounds: 2, settings: S })
    const planned = checkPrizePool(S, { players: 11 })
    expect(planned.lines.find((l) => l.moduleId === 'snake')!.amount).toBe(3600)
    const real = checkPrizePool(S, { players: 11, groupSizes: [[4, 4, 3], [4, 4, 3]] })
    expect(real.lines.find((l) => l.moduleId === 'snake')!.amount).toBe(3200)
    void snap
  })
})

describe('Handicap rules beyond the rules sheet', () => {
  function threeRounds(mode: TournamentSettings['day2Cut']['mode']): Snapshot {
    const settings = structuredClone(S)
    settings.rounds = 3
    settings.day2Cut.mode = mode
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 20 })], rounds: 3, settings })
    const holes = snap.courses[0]!.tees[0]!.holes
    // Day 1: 42 pts (cut 3). Day 2 off 13: 40 pts (cut 2).
    const give = (rid: string, ph: number, birdies: number) => {
      for (let h = 1; h <= 18; h++) {
        const hole = holes[h - 1]!
        const sr = Math.floor(ph / 18) + (hole.strokeIndex <= ph % 18 ? 1 : 0)
        snap.scores.push(score(rid, 'p1', h, hole.par + sr - (h <= birdies ? 1 : 0)))
      }
    }
    give('r1', 16, 6)
    give('r2', 13, 4)
    return snap
  }
  it('round 3 cut comes from round 2 alone by default', () => {
    const snap = threeRounds('previous')
    const core = computeCore(snap, snap.tournament.settings as TournamentSettings)
    expect(core.rounds.r1!.p1!.playingHcp).toBe(16)
    expect(core.rounds.r2!.p1!.playingHcp).toBe(13)
    expect(core.rounds.r3!.p1!.playingHcp).toBe(14)
  })
  it('round 3 cut accumulates in cumulative mode', () => {
    const snap = threeRounds('cumulative')
    const core = computeCore(snap, snap.tournament.settings as TournamentSettings)
    expect(core.rounds.r3!.p1!.playingHcp).toBe(11)
  })

  it('a 9-hole round gives half the playing handicap on the 18-hole stroke indexes', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 20 })], rounds: [makeRound(1, { holes: 9 })], settings: S })
    const core = computeCore(snap, S)
    const pr = core.rounds.r1!.p1!
    // PH 16 → 8 strokes over the nine, on the holes with SI 1–8.
    expect(pr.holes).toHaveLength(9)
    const total = pr.holes.reduce((s, h) => s + h.strokesReceived, 0)
    expect(total).toBe(pr.holes.filter((h) => h.strokeIndex <= 8).length)
    expect(total).toBeLessThanOrEqual(8)
  })
})
