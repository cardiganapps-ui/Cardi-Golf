/**
 * QA-04 and QA-05: money legs and tie rules outside the first tournament's
 * happy path, each pinned by a hand-worked case. The review's mutation run
 * changed each of these and no test noticed (M06, M07, M13, M14, M16, M17,
 * M23, M24). Every case below fails under its mutant: the expectations are
 * worked out from the inputs, not read back from the engine.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from './computeTournament'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from './settings/presets'
import { checkPrizePool, percentPlaces } from './settings/prizeCheck'
import type { GameConfig } from './settings/games'
import type { TournamentSettings } from './settings/schema'
import { makeGroup, makePlayer, makeRound, makeSnapshot, PAR_72, score } from './testing/fixtures'
import type { Id, Snapshot } from './types'

const PARS = PAR_72.map(([p]) => p)
const run = (snap: Snapshot) => computeTournament(snap, snap.tournament.settings as TournamentSettings)
/** Each party's net across the vía banco lines (received − paid); null is the bank. */
function viaBankNet(lines: Array<{ from: Id | null; to: Id | null; amount: number }>) {
  const net = new Map<Id | null, number>()
  for (const l of lines) {
    net.set(l.from, (net.get(l.from) ?? 0) - l.amount)
    net.set(l.to, (net.get(l.to) ?? 0) + l.amount)
  }
  return Object.fromEntries([...net].filter(([, v]) => v !== 0).map(([k, v]) => [k ?? 'bank', v]))
}
/** Every hole at par for these players in one round. */
function parCards(snap: Snapshot, ids: Id[], roundId = 'r1') {
  for (const id of ids) for (let h = 1; h <= 18; h++) snap.scores.push(score(roundId, id, h, PARS[h - 1]!))
}

describe('settlement legs the fixtures never reach (QA-04)', () => {
  it('a side pot’s buy-ins are asked for in vía banco, and netted against what each one won (M13)', () => {
    // Four players, no entry fee; closest to the pin on the four par 3s, $100 buy-in each: a $400 pot.
    const ctp: GameConfig = { id: 'ctp', type: 'contest', label: 'Más cerca', enabled: true, rounds: 'all', entrants: 'all', options: { kind: 'closest', holes: 'par3' }, money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [100] } }
    const settings: TournamentSettings = { ...DEFAULT_SETTINGS, rounds: 1, entryFee: 0, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [] }, games: [ctp] }
    const snap = makeSnapshot({ settings, players: Array.from({ length: 4 }, (_, i) => makePlayer(i + 1, { baseHcp: 0 })), rounds: [makeRound(1, { status: 'finished' })] })
    parCards(snap, ['p1', 'p2', 'p3', 'p4'])
    // p1 wins holes 3 and 7, p2 holes 11 and 16: $100 a hole.
    snap.holeAwards = [3, 7, 11, 16].map((hole, i) => ({ roundId: 'r1', groupId: null, hole, gameId: 'ctp', playerId: i < 2 ? 'p1' : 'p2' }))
    const st = run(snap)
    expect(st.prizes.filter((p) => p.moduleId === 'contest').reduce((s, p) => s + p.amount, 0)).toBe(400)
    // Nothing paid yet: p3 and p4 owe their $100; p1 and p2 won $200 and owe $100 each, so the bank pays them $100.
    expect(viaBankNet(st.money.viaBank)).toEqual({ p1: 100, p2: 100, p3: -100, p4: -100 })
    expect(st.money.people.p3!.sidePots).toBe(100)
    expect(Object.values(st.money.people).reduce((s, m) => s + m.net, 0)).toBe(0)
  })

  it('a payout paid in part is not «Pagado»: vía banco pays what is left (M14)', () => {
    const settings: TournamentSettings = { ...DEFAULT_SETTINGS, rounds: 1, entryFee: 1000, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [4000] } }
    const snap = makeSnapshot({ settings, players: Array.from({ length: 4 }, (_, i) => makePlayer(i + 1, { baseHcp: 0 })), rounds: [makeRound(1, { status: 'finished' })] })
    parCards(snap, ['p2', 'p3', 'p4'])
    // p1 one under par on the first hole: he wins the $4,000 alone.
    parCards(snap, ['p1'])
    snap.scores.find((x) => x.playerId === 'p1' && x.hole === 1)!.strokes = PARS[0]! - 1
    for (const id of ['p1', 'p2', 'p3', 'p4']) snap.payments.push({ id: `e-${id}`, kind: 'entry', fromPlayerId: id, toPlayerId: null, amount: 1000, paid: true, note: null })
    snap.payments.push({ id: 'po-1', kind: 'payout', fromPlayerId: null, toPlayerId: 'p1', amount: 1500, paid: true, note: null })
    const st = run(snap)
    expect(st.prizes.find((p) => p.moduleId === 'individual')).toMatchObject({ playerId: 'p1', amount: 4000 })
    expect(st.money.viaBank.map((l) => [l.from, l.to, l.amount])).toEqual([[null, 'p1', 2500]])
  })

  it('percent places keep every peso: $1,001 split 50/30/20 is 501 + 300 + 200 (M16)', () => {
    expect(percentPlaces(1001, [50, 30, 20])).toEqual([501, 300, 200])
    expect(percentPlaces(999, [60, 40])).toEqual([600, 399])
    // Seven players at $143 bring $1,001: the percent split pays all of it, so the pool balances.
    const settings: TournamentSettings = { ...DEFAULT_SETTINGS, rounds: 1, entryFee: 143, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [50, 30, 20], stablefordMode: 'percent' } }
    const check = checkPrizePool(settings, { players: 7 })
    expect(check.entryPot).toBe(1001)
    expect(check.balanced).toBe(true)
  })

  it('a pair prize with an odd peso pays both pesos: $1,001 is 501 and 500 (M23)', () => {
    const settings: TournamentSettings = {
      ...FIRST_TOURNAMENT_SETTINGS,
      rounds: 1,
      entryFee: 0,
      modules: { ...FIRST_TOURNAMENT_SETTINGS.modules, bestRound: { ...FIRST_TOURNAMENT_SETTINGS.modules.bestRound, enabled: false }, snake: { ...FIRST_TOURNAMENT_SETTINGS.modules.snake, enabled: false }, fewestPutts: { ...FIRST_TOURNAMENT_SETTINGS.modules.fewestPutts, enabled: false }, auction: { ...FIRST_TOURNAMENT_SETTINGS.modules.auction, enabled: false } },
      prizes: { ...FIRST_TOURNAMENT_SETTINGS.prizes, stableford: [], pairs: [1001] },
    }
    const players = ['A1', 'D1', 'A2', 'D2'].map((id, i) => makePlayer(i + 1, { id, displayName: id, tier: id[0]!, baseHcp: 0 }))
    const snap = makeSnapshot({ settings, players, rounds: [makeRound(1, { status: 'finished' })] })
    snap.pairs = [
      { id: 'pa', name: 'Pareja A', player1Id: 'A1', player2Id: 'D1', kind: 'AD', pickedByHonoree: false, drawnAt: null },
      { id: 'pb', name: 'Pareja B', player1Id: 'A2', player2Id: 'D2', kind: 'AD', pickedByHonoree: false, drawnAt: null },
    ]
    parCards(snap, ['A1', 'D1', 'A2', 'D2'])
    snap.scores.find((x) => x.playerId === 'A1' && x.hole === 1)!.strokes = PARS[0]! - 1
    const pairPrizes = run(snap).prizes.filter((p) => p.moduleId === 'pairs')
    expect(Object.fromEntries(pairPrizes.map((p) => [p.playerId, p.amount]))).toEqual({ A1: 501, D1: 500 })
  })
})

describe('tie rules the fixtures never reach (QA-05)', () => {
  /** Four players, one round, one group; each player's points per hole decided by their strokes. */
  function oneDay(settings: TournamentSettings, edit: (snap: Snapshot) => void) {
    const players = ['A', 'B', 'C', 'D'].map((id, i) => makePlayer(i + 1, { id, displayName: id, baseHcp: 0 }))
    const snap = makeSnapshot({ settings, players, rounds: [makeRound(1, { status: 'finished' })], groups: [makeGroup('r1', 1, ['A', 'B', 'C', 'D'])] })
    parCards(snap, ['A', 'B', 'C', 'D'])
    edit(snap)
    return run(snap)
  }
  const strokes = (snap: Snapshot, id: Id, hole: number, toPar: number) => (snap.scores.find((x) => x.playerId === id && x.hole === hole)!.strokes = PARS[hole - 1]! + toPar)
  const putts = (snap: Snapshot, id: Id, hole: number, n: number) => (snap.scores.find((x) => x.playerId === id && x.hole === hole)!.putts = n)

  it('best round: a tie on the day’s points goes to countback within the day, not to a split (M17)', () => {
    const s: TournamentSettings = { ...FIRST_TOURNAMENT_SETTINGS, rounds: 1 }
    // A birdie on the 2nd and a bogey on the 12th; B a bogey on the 2nd and a birdie on the 12th: 36 points each.
    // Holes 10–18 decide it for B.
    const st = oneDay(s, (snap) => {
      strokes(snap, 'A', 2, -1)
      strokes(snap, 'A', 12, 1)
      strokes(snap, 'B', 2, 1)
      strokes(snap, 'B', 12, -1)
    })
    const day = st.modules.bestRound!.days[0]!
    const pts = Object.fromEntries(day.rows.map((r) => [r.playerId, r.points]))
    expect(pts.A).toBe(pts.B)
    expect(day.winners).toEqual({ B: expect.objectContaining({ amount: 1200 }) })
  })

  it('the snake: a stored answer that names someone who no longer three-putted is no answer (M06)', () => {
    // C and D three-putt the 7th; the stored answer names B, from before a Comité correction of B's putts.
    const st = oneDay(FIRST_TOURNAMENT_SETTINGS, (snap) => {
      putts(snap, 'C', 7, 3)
      putts(snap, 'D', 7, 3)
      snap.snakeTiebreaks.push({ roundId: 'r1', groupId: 'r1g1', hole: 7, lastHoledPlayerId: 'B' })
    })
    const g = st.modules.snake!.groups[0]!
    expect(st.flags.pendingSnakeTiebreaks).toEqual([{ roundId: 'r1', groupId: 'r1g1', hole: 7, candidates: ['C', 'D'] }])
    expect(g.payouts).toEqual({})
  })

  it('the snake: a group with a player who stopped is settled once the Comité finishes the day (M07)', () => {
    // B three-putts the 5th; D stopped after the 12th (§18.7). The day is finished: A, C and D survive.
    const st = oneDay(FIRST_TOURNAMENT_SETTINGS, (snap) => {
      putts(snap, 'B', 5, 3)
      snap.scores = snap.scores.filter((x) => !(x.playerId === 'D' && x.hole > 12))
    })
    const g = st.modules.snake!.groups[0]!
    expect(Object.fromEntries(Object.entries(g.payouts).map(([k, v]) => [k, v.amount]))).toEqual({ A: 200, B: 0, C: 200, D: 200 })
  })

  it('last place is named once the tournament is final, and its Calcutta slot paid (M24)', () => {
    const s: TournamentSettings = { ...FIRST_TOURNAMENT_SETTINGS, rounds: 1, tiers: [], modules: { ...FIRST_TOURNAMENT_SETTINGS.modules, pairs: { ...FIRST_TOURNAMENT_SETTINGS.modules.pairs, enabled: false } }, auction: { ...FIRST_TOURNAMENT_SETTINGS.auction, payout: [{ slot: 'place', place: 1, share: 0.9 }, { slot: 'lastPlace', share: 0.1 }] } }
    const st = oneDay({ ...s, entryFee: 0, prizes: { ...s.prizes, stableford: [], bestRoundPerDay: 0, snakePerSurvivor: 0, fewestPutts: 0 } }, (snap) => {
      snap.tournament.status = 'finished'
      strokes(snap, 'A', 1, -1)
      strokes(snap, 'D', 1, 2)
      // Every player sold to himself at $1,000: a $4,000 pot.
      snap.calcuttaLots = ['A', 'B', 'C', 'D'].map((id, i) => ({ id: `lot${i + 1}`, playerId: id, lotNumber: i + 1, status: 'sold', price: 1000, ownerId: id, soldAt: '' }))
    })
    expect(st.tournamentFinal).toBe(true)
    expect(st.modules.individual!.lastPlace).toEqual(['D'])
    const calcutta = Object.fromEntries(st.prizes.filter((p) => p.potId === 'calcutta').map((p) => [p.playerId, p.amount]))
    expect(calcutta).toEqual({ A: 3600, D: 400 })
  })
})
