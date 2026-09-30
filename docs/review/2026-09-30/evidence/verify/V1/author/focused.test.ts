/**
 * MONEY panel: focused reproductions. Each `it` is one finding; each writes
 * its key numbers to focused.result.json so the .md can cite them.
 * Run: cd /home/user/Cardi-Golf && npx vitest run --config $E/vitest.config.mts $E/focused.test.ts
 */
import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { computeCore } from '/home/user/Cardi-Golf/src/engine/core/compute'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '/home/user/Cardi-Golf/src/engine/settings/presets'
import { checkPrizePool, fieldShape } from '/home/user/Cardi-Golf/src/engine/settings/prizeCheck'
import { safeParseSettings, type TournamentSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import { PAR_72, fillRound, makeFirstTournament, makeGroup, makePlayer, makeRound, makeSnapshot, score } from '/home/user/Cardi-Golf/src/engine/testing/fixtures'
import { getFixture } from '/home/user/Cardi-Golf/src/dev/fixtures'
import type { Snapshot } from '/home/user/Cardi-Golf/src/engine/types'

const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V1/author/focused.result.json'
const results: Record<string, unknown> = {}
afterAll(() => {
  // Merge, so a filtered run (-t) never drops the other findings' numbers.
  let prev: Record<string, unknown> = {}
  try {
    prev = JSON.parse(readFileSync(OUT, 'utf8'))
  } catch {
    prev = {}
  }
  writeFileSync(OUT, JSON.stringify({ ...prev, ...results }, null, 1))
})

const clone = <T,>(x: T): T => structuredClone(x)

/** Every hole at par + delta for the listed holes (1-based), default card PAR_72. */
function card(snap: Snapshot, rid: string, pid: string, holes: number[], delta = 0, putts = 2) {
  for (const h of holes) snap.scores.push(score(rid, pid, h, PAR_72[h - 1]![0] + delta, putts))
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

describe('MONEY-01 vía banco ignores what was already paid', () => {
  it('asks players who paid their entry to pay it again and underpays the winner', () => {
    const settings: TournamentSettings = { ...clone(DEFAULT_SETTINGS), entryFee: 1000, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [4000] } }
    const players = [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    card(snap, 'r1', 'p1', range(1, 18), 0)
    for (const pid of ['p2', 'p3', 'p4']) card(snap, 'r1', pid, range(1, 18), 1)
    // The Comité marked every entry Pagado on the night (§10 payment check).
    for (const p of players) snap.payments.push({ id: `e-${p.id}`, fromPlayerId: p.id, toPlayerId: null, amount: 1000, kind: 'entry', paid: true, note: null })
    const st = computeTournament(snap, settings)
    const entryFlows = st.money.flows.filter((f) => f.kind === 'entry').map((f) => ({ from: f.from, paid: f.paid }))
    results['MONEY-01'] = { entryFlows, viaBank: st.money.viaBank, owedChecklist: st.money.flows.filter((f) => !f.paid && f.kind === 'entry').length }
    expect(entryFlows.every((f) => f.paid)).toBe(true) // the app knows the entries were paid...
    // ...and still tells the three losers to pay the bank $1,000 and pays the winner $3,000 instead of $4,000.
    expect(st.money.viaBank).toEqual([
      { from: null, to: 'p1', amount: 3000 },
      { from: 'p2', to: null, amount: 1000 },
      { from: 'p3', to: null, amount: 1000 },
      { from: 'p4', to: null, amount: 1000 },
    ])
  })

  it('full12-finished fixture: Bruno (entry Pagado, no prizes) is told to pay the bank $2,500; a paid buyback is listed again', () => {
    const fx = getFixture('full12-finished')!
    const st = computeTournament(fx.snapshot, fx.snapshot.tournament.settings as TournamentSettings)
    const p2Entry = st.money.flows.find((f) => f.kind === 'entry' && f.from === 'p2')!
    const bb = fx.snapshot.calcuttaBuybacks.find((b) => b.lotId === 'lot7')!
    const bbFlow = st.money.flows.find((f) => f.kind === 'buyback' && f.from === 'p3')!
    results['MONEY-01-fixture'] = { p2EntryPaid: p2Entry.paid, p2ViaBank: st.money.viaBank.filter((t) => t.from === 'p2'), lot7Buyback: bb, lot7Flow: { paid: bbFlow.paid, amount: bbFlow.amount }, p3ViaBankLines: st.money.viaBank.filter((t) => t.from === 'p3' || t.to === 'p3') }
    expect(p2Entry.paid).toBe(true)
    expect(st.money.viaBank).toContainEqual({ from: 'p2', to: null, amount: 2500 })
    expect(bbFlow.paid).toBe(true)
    expect(st.money.viaBank).toContainEqual({ from: 'p3', to: 'p9', amount: 500 })
  })
})

describe('MONEY-04 "Pagado" on a vía-banco payout never sticks', () => {
  it('the UI writes the NET transfer as the payout payment; the engine compares it with the GROSS payouts', () => {
    const settings: TournamentSettings = { ...clone(DEFAULT_SETTINGS), entryFee: 1000, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [4000] } }
    const players = [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    card(snap, 'r1', 'p1', range(1, 18), 0)
    for (const pid of ['p2', 'p3', 'p4']) card(snap, 'r1', pid, range(1, 18), 1)
    const before = computeTournament(snap, settings)
    const tr = before.money.viaBank.find((t) => t.to === 'p1')!
    // MoneyScreen.togglePayout(tr.to, tr.amount, true) → set_payment_paid(kind 'payout', from null, to p1, amount tr.amount)
    snap.payments.push({ id: 'pay-p1', fromPlayerId: null, toPlayerId: 'p1', amount: tr.amount, kind: 'payout', paid: true, note: null })
    const after = computeTournament(snap, settings)
    const payoutFlows = after.money.flows.filter((f) => f.kind === 'payout' && f.to === 'p1')
    results['MONEY-04'] = { transferShown: tr, paymentWritten: tr.amount, grossPayouts: payoutFlows.reduce((s, f) => s + f.amount, 0), flowsPaidAfterTap: payoutFlows.map((f) => f.paid) }
    expect(payoutFlows.every((f) => f.paid)).toBe(false)
  })
})

describe('MONEY-02 stroke play / team strokes / low score: an incomplete card wins', () => {
  it('stroke play: a player who walks off after 9 holes wins the main prize', () => {
    const base = clone(DEFAULT_SETTINGS)
    const settings: TournamentSettings = {
      ...base,
      entryFee: 500,
      prizes: { ...base.prizes, stableford: [1000] },
      modules: { ...base.modules, individual: { ...base.modules.individual, format: 'strokePlay', formatOptions: { ...base.modules.individual.formatOptions, scoring: 'gross' } } },
    }
    const players = [1, 2].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    card(snap, 'r1', 'p1', range(1, 18), 0) // 72, even par, complete
    card(snap, 'r1', 'p2', range(1, 9), 1) // +9 over nine holes, then walked off
    const st = computeTournament(snap, settings)
    const rows = st.modules.individual!.rows.map((r) => ({ id: r.playerId, label: r.label, value: r.figure.value, text: r.figure.text, thru: r.thru }))
    results['MONEY-02-strokePlay'] = { rows, prizes: st.prizes.map((p) => ({ to: p.playerId, amount: p.amount, final: p.final })) }
    expect(rows[0]!.id).toBe('p2')
    expect(st.prizes.find((p) => p.moduleId === 'individual')!.playerId).toBe('p2')
  })

  it('stroke play live: the group that has played fewer holes leads and holds the money chip', () => {
    const base = clone(DEFAULT_SETTINGS)
    const settings: TournamentSettings = {
      ...base,
      entryFee: 500,
      prizes: { ...base.prizes, stableford: [1000] },
      modules: { ...base.modules, individual: { ...base.modules.individual, format: 'strokePlay', formatOptions: { ...base.modules.individual.formatOptions, scoring: 'gross' } } },
    }
    const players = [1, 2].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'live' })], settings })
    card(snap, 'r1', 'p1', range(1, 12), -1) // 12 under par through 12
    card(snap, 'r1', 'p2', range(1, 4), 2) // +8 through 4
    const st = computeTournament(snap, settings)
    const rows = st.modules.individual!.rows.map((r) => ({ id: r.playerId, label: r.label, value: r.figure.value, text: r.figure.text, thru: r.thru }))
    results['MONEY-02-live'] = { rows, prizes: st.prizes.map((p) => ({ to: p.playerId, amount: p.amount, final: p.final })) }
    expect(rows[0]!.id).toBe('p2') // "+8" shown above "−12"
  })

  it('team best ball on strokes: a team with a missing hole beats a complete team', () => {
    const base = clone(DEFAULT_SETTINGS)
    const settings: TournamentSettings = {
      ...base,
      entryFee: 500,
      prizes: { ...base.prizes, stableford: [2000] },
      modules: { ...base.modules, individual: { ...base.modules.individual, format: 'team', formatOptions: { ...base.modules.individual.formatOptions, teamMode: 'bestBall', teamScoring: 'strokes', scoring: 'gross' } } },
    }
    const players = [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    snap.pairs = [
      { id: 'A', name: 'A', player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'B', name: 'B', player1Id: 'p3', player2Id: 'p4', kind: null, pickedByHonoree: false, drawnAt: null },
    ]
    // Team A: birdies on holes 1–10, pars after: 72 − 10 = 62 strokes, −10, complete.
    card(snap, 'r1', 'p1', range(1, 10), -1)
    card(snap, 'r1', 'p1', range(11, 18), 0)
    card(snap, 'r1', 'p2', range(1, 18), 1)
    // Team B: bogey golf on the front nine only (+9 through 9 = 45 strokes), then nobody entered the back nine.
    card(snap, 'r1', 'p3', range(1, 9), 1)
    card(snap, 'r1', 'p4', range(1, 9), 2)
    const st = computeTournament(snap, settings)
    const rows = st.modules.individual!.rows.map((r) => ({ id: r.playerId, value: r.figure.value, text: r.figure.text, thru: r.thru }))
    results['MONEY-02-team'] = { rows, prizes: st.prizes.map((p) => ({ to: p.playerId, amount: p.amount, final: p.final })) }
    // The incomplete, worse team (+9 over nine holes) is ranked first and paid.
    expect(rows[0]!.id).toBe('B')
  })

  it('low score (Ronda rápida "Low neto" chip): a player who stops after 9 holes wins the side pot', () => {
    const base = clone(DEFAULT_SETTINGS)
    const settings: TournamentSettings = {
      ...base,
      games: [{ id: 'lownet', type: 'lowScore', label: 'Low neto', enabled: true, rounds: 'all', entrants: 'all', options: { basis: 'net', scope: 'perRound' }, money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [100] } }],
    }
    const players = [1, 2, 3].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    card(snap, 'r1', 'p1', range(1, 18), 0) // E over 18
    card(snap, 'r1', 'p2', range(1, 18), 0)
    card(snap, 'r1', 'p3', [1], -1) // birdie on hole 1, then left
    const st = computeTournament(snap, settings)
    const prizes = st.prizes.filter((p) => p.gameId === 'lownet').map((p) => ({ to: p.playerId, amount: p.amount, final: p.final }))
    results['MONEY-02-lowScore'] = { prizes, warnings: st.flags.warnings }
    expect(prizes).toEqual([{ to: 'p3', amount: 300, final: true }])
  })
})

describe('MONEY-03 nine-hole rounds give about half the strokes due', () => {
  it('PH 16 receives 4 strokes over the front nine of PAR_72 instead of 8', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 20 })], rounds: [makeRound(1, { holes: 9 })], settings: FIRST_TOURNAMENT_SETTINGS })
    const pr = computeCore(snap, FIRST_TOURNAMENT_SETTINGS).rounds.r1!.p1!
    const total = pr.holes.reduce((s, h) => s + h.strokesReceived, 0)
    const snap18 = makeSnapshot({ players: [makePlayer(1, { baseHcp: 20 })], rounds: [makeRound(1, { holes: 18 })], settings: FIRST_TOURNAMENT_SETTINGS })
    const pr18 = computeCore(snap18, FIRST_TOURNAMENT_SETTINGS).rounds.r1!.p1!
    const front18 = pr18.holes.slice(0, 9).reduce((s, h) => s + h.strokesReceived, 0)
    // A 9-hole card on a real 9-hole course (SI 1..9): PH 30 → half = 15 strokes due.
    const nine: Array<[number, number]> = [[4, 1], [4, 2], [3, 9], [5, 3], [4, 4], [4, 5], [3, 8], [4, 6], [5, 7]]
    const snap9 = makeSnapshot({ players: [makePlayer(1, { baseHcp: 30 })], rounds: [makeRound(1, { holes: 9 })], settings: { ...clone(DEFAULT_SETTINGS) } })
    snap9.courses[0]!.tees[0]!.holes = nine.map(([par, si], i) => ({ number: i + 1, par, strokeIndex: si, yards: null }))
    const pr9 = computeCore(snap9, DEFAULT_SETTINGS).rounds.r1!.p1!
    results['MONEY-03'] = {
      ph18: pr.playingHcp,
      strokesOnNine: total,
      perHole: pr.holes.map((h) => [h.hole, h.strokeIndex, h.strokesReceived]),
      sameHolesIn18HoleRound: front18,
      nineHoleCourse: { ph: pr9.playingHcp, due: Math.round(pr9.playingHcp / 2), given: pr9.holes.reduce((s, h) => s + h.strokesReceived, 0) },
    }
    expect(pr.playingHcp).toBe(16)
    expect(total).toBe(4)
    expect(pr9.holes.reduce((s, h) => s + h.strokesReceived, 0)).toBe(9)
  })
})

describe('MONEY-11 an unsold lot cashes Calcutta money nobody paid for', () => {
  it('a player never auctioned (lot still pending) wins and his "self" gets 55% of the pot for $0', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 1)
    fillRound(snap, 'r2', 2)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    snap.tournament.status = 'finished'
    // Everyone sold for $1,000 except the eventual champion, whose lot was never opened.
    const pre = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS)
    const champ = pre.modules.individual!.rows[0]!.playerId
    snap.players.forEach((p, i) => snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: p.id === champ ? 'pending' : 'sold', price: p.id === champ ? null : 1000, ownerId: p.id === champ ? null : snap.players[(i + 1) % 12]!.id, soldAt: '' }))
    const st = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS)
    const a = st.modules.auction!
    const champLine = a.payouts[champ]?.lines.find((l) => l.playerId === champ)
    results['MONEY-11'] = { champ, pot: a.pot, champPaidIntoPot: st.money.people[champ]!.calcuttaPurchases, champCashes: champLine, warnings: st.flags.warnings.filter((w) => w.includes('Calcutta')) }
    expect(champLine?.amount).toBe(Math.floor(a.pot * 0.55))
  })
})

describe('MONEY-06 rounds in the snapshot ≠ settings.rounds: an unfunded best-round prize', () => {
  it('settings say 2 days (prize check balanced), the Comité adds a Day 3 in Rondas → 3 × $1,200 paid out of a pot funded for 2', () => {
    const s = clone(FIRST_TOURNAMENT_SETTINGS)
    s.modules.snake.enabled = false
    s.modules.auction.enabled = false
    s.modules.pairs.enabled = false
    s.modules.fewestPutts.enabled = false
    // Pot 12 × 2,500 = 30,000: individual 27,600 + best round 2 × 1,200.
    s.prizes.stableford = [15000, 7000, 3600, 2000]
    const check = checkPrizePool(s, { players: 12 })
    const snap = makeSnapshot({ players: 12, rounds: 3, settings: s, status: 'finished' })
    for (const r of snap.rounds) {
      r.status = 'finished'
      fillRound(snap, r.id, r.number * 7)
    }
    const st = computeTournament(snap, s)
    const br = st.prizes.filter((p) => p.moduleId === 'bestRound').reduce((x, p) => x + p.amount, 0)
    const liveCheck = checkPrizePool(s, fieldShape(snap, s))
    results['MONEY-06'] = { settingsRounds: s.rounds, snapshotRounds: snap.rounds.length, checkBalanced: check.balanced, checkWithField: liveCheck.balanced, bestRoundPaid: br, bank: st.money.banker }
    expect(check.balanced).toBe(true)
    expect(liveCheck.balanced).toBe(true)
    expect(br).toBe(3600)
    expect(st.money.banker.difference).toBe(-1200)
  })
})

describe('MONEY-05 a cancelled round leaves money in the bank with no path to pay it', () => {
  it('first tournament, Day 2 cancelled: $3,000 of the entry pot is never assigned', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 3)
    snap.rounds[0]!.status = 'finished'
    snap.rounds[1]!.status = 'cancelled'
    snap.tournament.status = 'finished'
    for (let i = 0; i < 20; i++) {
      const pending = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS).flags.pendingSnakeTiebreaks
      if (!pending.length) break
      for (const q of pending) snap.snakeTiebreaks.push({ roundId: q.roundId, groupId: q.groupId, hole: q.hole, lastHoledPlayerId: q.candidates[0]! })
    }
    const s = clone(FIRST_TOURNAMENT_SETTINGS)
    s.modules.auction.enabled = false
    const st = computeTournament(snap, s)
    const main = st.prizes.reduce((x, p) => x + p.amount, 0)
    results['MONEY-05'] = { entryPot: 30000, paid: main, bank: st.money.banker, warnings: st.flags.warnings }
    expect(main).toBe(27000)
    expect(st.money.banker.difference).toBe(3000)
  })
})

describe('MONEY-09 prize places the field cannot fill pass the check and stay in the bank', () => {
  it('3 players, 4 individual prizes: check balanced, $2,000 never paid', () => {
    const s: TournamentSettings = { ...clone(DEFAULT_SETTINGS), entryFee: 2000, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [3000, 500, 500, 2000] } }
    const check = checkPrizePool(s, { players: 3 })
    const snap = makeSnapshot({ players: 3, rounds: [makeRound(1, { status: 'finished' })], settings: s, status: 'finished' })
    fillRound(snap, 'r1', 5)
    const st = computeTournament(snap, s)
    results['MONEY-09'] = { checkBalanced: check.balanced, prizesPaid: st.prizes.reduce((x, p) => x + p.amount, 0), entryPot: 6000, bank: st.money.banker }
    expect(check.balanced).toBe(true)
    expect(st.money.banker.difference).toBe(2000)
  })

  it('pairs prizes [2000, 1000] with a single pair: $1,000 never paid, check balanced', () => {
    const s = clone(DEFAULT_SETTINGS)
    s.modules.pairs = { enabled: true, label: 'Parejas', pairing: [], honoreePicks: false }
    s.entryFee = 1500
    s.prizes.pairs = [2000, 1000]
    const check = checkPrizePool(s, { players: 2 })
    const snap = makeSnapshot({ players: 2, rounds: [makeRound(1, { status: 'finished' })], settings: s, status: 'finished' })
    snap.pairs = [{ id: 'x', name: null, player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null }]
    fillRound(snap, 'r1', 5)
    const st = computeTournament(snap, s)
    results['MONEY-09-pairs'] = { checkBalanced: check.balanced, prizesPaid: st.prizes.reduce((x, p) => x + p.amount, 0), bank: st.money.banker }
    expect(check.balanced).toBe(true)
    expect(st.money.banker.difference).toBe(1000)
  })
})

describe('MONEY-12 house cut breaks the "sin banco" settlement', () => {
  it('p2p transfers leave the house cut unassigned: one loser pays less than the others', () => {
    const s: TournamentSettings = { ...clone(DEFAULT_SETTINGS), entryFee: 1000, houseCut: 400, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [3600] } }
    const snap = makeSnapshot({ players: 4, rounds: [makeRound(1, { status: 'finished' })], settings: s, status: 'finished' })
    fillRound(snap, 'r1', 9)
    const st = computeTournament(snap, s)
    const paidBy: Record<string, number> = {}
    for (const t of st.money.peerToPeer) paidBy[t.from!] = (paidBy[t.from!] ?? 0) + t.amount
    const nets = Object.fromEntries(Object.values(st.money.people).map((m) => [m.playerId, m.net]))
    results['MONEY-12'] = { balanced: st.money.banker.balanced, nets, peerToPeer: st.money.peerToPeer, paidBy, netSum: st.money.netSum }
    const debtors = Object.values(st.money.people).filter((m) => m.net < 0)
    expect(debtors.some((m) => (paidBy[m.playerId] ?? 0) !== -m.net)).toBe(true)
  })
})

describe('MONEY-15 explanations that disagree with the amount paid', () => {
  it('team prize: each member is paid half, the "¿Cómo se calculó?" title shows the whole team prize', () => {
    const base = clone(DEFAULT_SETTINGS)
    const settings: TournamentSettings = {
      ...base,
      entryFee: 1001,
      prizes: { ...base.prizes, stableford: [2001, 1003] },
      modules: { ...base.modules, individual: { ...base.modules.individual, format: 'team', formatOptions: { ...base.modules.individual.formatOptions, teamMode: 'bestBall', teamScoring: 'strokes', scoring: 'gross' } } },
    }
    const players = [1, 2, 3].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    snap.teams = [
      { id: 'T1', name: 'Uno', number: 1, playerIds: ['p1', 'p2'], drawnAt: null },
      { id: 'T2', name: 'Dos', number: 2, playerIds: ['p3'], drawnAt: null },
    ]
    card(snap, 'r1', 'p1', range(1, 18), 0)
    card(snap, 'r1', 'p2', range(1, 18), 1)
    card(snap, 'r1', 'p3', range(1, 18), 1)
    const st = computeTournament(snap, settings)
    const lines = st.prizes.filter((p) => p.moduleId === 'individual').map((p) => ({ to: p.playerId, amount: p.amount, title: p.why.title, steps: p.why.steps }))
    results['MONEY-15-team'] = lines
    expect(lines.find((l) => l.to === 'p1')!.title).toBe('$2001')
    expect(lines.find((l) => l.to === 'p1')!.amount).toBe(1001)
  })

  it('pairs prize with an odd peso: the partner sees "$500 cada uno" but the pair was paid $1,001', () => {
    const s = clone(DEFAULT_SETTINGS)
    s.modules.pairs = { enabled: true, label: 'Parejas', pairing: [], honoreePicks: false }
    s.prizes.pairs = [1001]
    s.entryFee = 0
    const snap = makeSnapshot({ players: 4, rounds: [makeRound(1, { status: 'finished' })], settings: s, status: 'finished' })
    snap.pairs = [
      { id: 'a', name: null, player1Id: 'p1', player2Id: 'p2', kind: null, pickedByHonoree: false, drawnAt: null },
      { id: 'b', name: null, player1Id: 'p3', player2Id: 'p4', kind: null, pickedByHonoree: false, drawnAt: null },
    ]
    fillRound(snap, 'r1', 4)
    const st = computeTournament(snap, s)
    results['MONEY-15-pairs'] = st.prizes.filter((p) => p.moduleId === 'pairs').map((p) => ({ to: p.playerId, amount: p.amount, title: p.why.title, steps: p.why.steps }))
  })
})

describe('MONEY-08 + MONEY-17 Calcutta edge arithmetic', () => {
  it('an unfilled 5% slot of an odd pot leaves $x.5 "sin asignar" and a bank difference that disagrees with it', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 1)
    fillRound(snap, 'r2', 2)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    for (const pid of ['p10', 'p11', 'p12']) {
      snap.scores = snap.scores.filter((s) => s.playerId !== pid)
      for (const rid of ['r1', 'r2']) for (let h = 1; h <= 18; h++) snap.scores.push(score(rid, pid, h, 12, 2))
    }
    snap.players.forEach((p, i) => snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: i === 0 ? 1250 : 1000, ownerId: p.id, soldAt: '' }))
    const s = clone(FIRST_TOURNAMENT_SETTINGS)
    const st = computeTournament(snap, s)
    const a = st.modules.auction!
    const paid = Object.values(a.payouts).reduce((x, p) => x + p.amount, 0)
    results['MONEY-08'] = { pot: a.pot, unfilled: a.unfilled, paid, warning: st.flags.warnings.find((w) => w.includes('sin asignar')) }
    expect(Number.isInteger(a.unfilled)).toBe(false)
  })

  it('payout without a 1st-place slot: the rounding peso goes to a PLAYER, not to his owner', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 1)
    fillRound(snap, 'r2', 2)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    // Everyone owned by p1, pot 3 × 1,000 + ... odd so shares floor.
    snap.players.forEach((p, i) => snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 1000 + (i === 0 ? 1 : 0), ownerId: 'p1', soldAt: '' }))
    const s = clone(FIRST_TOURNAMENT_SETTINGS)
    s.auction.payout = [
      { slot: 'bestOfTier', tier: 'C', share: 0.5 },
      { slot: 'bestOfTier', tier: 'D', share: 0.5 },
    ]
    const st = computeTournament(snap, s)
    const a = st.modules.auction!
    const redondeo = Object.values(a.payouts).flatMap((p) => p.lines.map((l) => ({ owner: p.ownerId, ...l }))).filter((l) => l.slotLabel === 'Redondeo')
    results['MONEY-17'] = { pot: a.pot, slots: a.slots.map((x) => [x.label, x.playerIds, x.amount]), redondeo }
    expect(redondeo.length).toBe(1)
    expect(redondeo[0]!.owner).not.toBe('p1')
  })
})

describe('MONEY-13 settings that pass the schema but make no sense', () => {
  it('reports what the schema accepts', () => {
    const probe = (name: string, mut: (s: TournamentSettings) => void) => {
      const s = clone(FIRST_TOURNAMENT_SETTINGS) as TournamentSettings
      mut(s)
      const r = safeParseSettings(s)
      return { name, accepted: r.success, issues: r.success ? [] : r.error.issues.map((i) => i.message) }
    }
    const out = [
      probe('cap 0 (everyone scratch)', (s) => (s.handicap.cap = 0)),
      probe('allowance 0', (s) => (s.handicap.allowance = 0)),
      probe('allowance 1.2', (s) => (s.handicap.allowance = 1.2)),
      probe('negative prize', (s) => (s.prizes.stableford = [-100])),
      probe('payout shares 0.6 total', (s) => (s.auction.payout = [{ slot: 'place', place: 1, share: 0.6 }])),
      probe('two 1st-place slots', (s) => (s.auction.payout = [{ slot: 'place', place: 1, share: 0.5 }, { slot: 'place', place: 1, share: 0.5 }])),
      probe('place 40 slot in a 12-player field', (s) => (s.auction.payout = [{ slot: 'place', place: 40, share: 1 }])),
      probe('maxPlayersPerOwner 0', (s) => (s.auction.maxPlayersPerOwner = 0)),
      probe('buybackMaxPct 100', (s) => (s.auction.buybackMaxPct = 100)),
      probe('snake threshold 0', (s) => (s.modules.snake.puttsThreshold = 0)),
      probe('snake threshold 2', (s) => (s.modules.snake.puttsThreshold = 2)),
      probe('pairing names absent tier', (s) => (s.modules.pairs.pairing = [['A', 'Z']])),
      probe('pairing with pairs disabled names absent tier', (s) => { s.modules.pairs.enabled = false; s.modules.pairs.pairing = [['A', 'Z']] }),
      probe('duplicate tiers', (s) => (s.tiers = ['A', 'A', 'B', 'C', 'D'])),
      probe('20 individual prize places', (s) => (s.prizes.stableford = Array(20).fill(1000))),
      probe('day2Cut threshold 0', (s) => (s.day2Cut.threshold = 0)),
      probe('day2Cut maxStrokes 54', (s) => (s.day2Cut.maxStrokes = 54)),
      probe('houseCut > entry pot', (s) => (s.houseCut = 100000)),
      probe('openingBid 1, increment 1', (s) => { s.auction.openingBid = 1; s.auction.increment = 1 }),
      probe('rounds 10 with 1 in the table', (s) => (s.rounds = 10)),
      probe('estimate weights 1/0/0', (s) => (s.handicap.estimateWeights = [1, 0, 0])),
      probe('currency XYZ', (s) => (s.currency = 'XYZ')),
      probe('timezone garbage', (s) => (s.timezone = 'Mars/Olympus')),
      probe('snakePerSurvivor 0 with snake on', (s) => (s.prizes.snakePerSurvivor = 0)),
      probe('bestOfTier slot for tier A with 55%', (s) => (s.auction.payout = [{ slot: 'bestOfTier', tier: 'A', share: 0.55 }, { slot: 'place', place: 1, share: 0.45 }])),
    ]
    results['MONEY-13'] = out
  })

  it('what the engine does with cap 0 + allowance 1 on a 30-handicap (becomes scratch silently)', () => {
    const s = clone(FIRST_TOURNAMENT_SETTINGS)
    s.handicap.cap = 0
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 30 })], rounds: 1, settings: s })
    const pr = computeCore(snap, s).rounds.r1!.p1!
    results['MONEY-13-cap0'] = { ph: pr.playingHcp, why: pr.playingHcpWhy }
  })

  it('a bestOfTier slot outranks the champion slot when its share is larger: the A champion is paid as "Mejor A"', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 1)
    fillRound(snap, 'r2', 2)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    snap.players.forEach((p, i) => snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 1000, ownerId: p.id, soldAt: '' }))
    const s = clone(FIRST_TOURNAMENT_SETTINGS)
    s.auction.payout = [{ slot: 'bestOfTier', tier: 'A', share: 0.55 }, { slot: 'place', place: 1, share: 0.45 }]
    const st = computeTournament(snap, s)
    const a = st.modules.auction!
    const top = st.modules.individual!.rows[0]!
    results['MONEY-13-tierFirst'] = { champion: top.playerId, championTier: snap.players.find((p) => p.id === top.playerId)!.tier, slots: a.slots.map((x) => [x.label, x.playerIds, x.amount]) }
  })
})

describe('NOTE-sortorder order dependence when sort orders collide', () => {
  it('two players with the same sort_order: which one gets the odd peso of a split depends on fetch order', () => {
    const s: TournamentSettings = { ...clone(DEFAULT_SETTINGS), entryFee: 0, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [1001] } }
    const players = [makePlayer(1, { baseHcp: 0, sortOrder: 0 }), makePlayer(2, { baseHcp: 0, sortOrder: 0 })]
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings: s, status: 'finished' })
    card(snap, 'r1', 'p1', range(1, 18), 0)
    card(snap, 'r1', 'p2', range(1, 18), 0)
    const a = computeTournament(snap, s).prizes.map((p) => [p.playerId, p.amount])
    const snap2 = { ...snap, players: [...snap.players].reverse() }
    const b = computeTournament(snap2, s).prizes.map((p) => [p.playerId, p.amount])
    results['NOTE-sortorder'] = { order1: a, order2: b }
    expect(a).not.toEqual(b)
  })
})

describe('MONEY-18 missing putts count as zero', () => {
  it('a hole with strokes and putts = null counts 0 putts in Menos putts', () => {
    const s = clone(FIRST_TOURNAMENT_SETTINGS)
    const snap = makeSnapshot({ players: 2, rounds: 1, settings: s })
    for (let h = 1; h <= 18; h++) {
      snap.scores.push(score('r1', 'p1', h, 4, 1))
      snap.scores.push(score('r1', 'p2', h, 4, h <= 10 ? null : 2))
    }
    const fp = computeTournament(snap, s).modules.fewestPutts!
    results['MONEY-18'] = { rows: fp.rows.map((r) => [r.playerId, r.putts, r.holes]), prizes: Object.fromEntries(Object.entries(fp.prizes).map(([k, v]) => [k, v.amount])) }
    expect(fp.prizes.p2?.amount).toBe(1000)
  })
})

describe('MONEY-06b the pool goes out of balance after a roster change and nothing says so', () => {
  it('settings saved for 12 × $2,500; 11 players play: no warning, the bank ends $2,500 short', () => {
    const snap = makeFirstTournament()
    snap.players = snap.players.filter((p) => p.id !== 'p12')
    snap.groups = snap.groups.map((g) => ({ ...g, playerIds: g.playerIds.filter((id) => id !== 'p12') }))
    snap.pairs = snap.pairs.filter((p) => p.player2Id !== 'p12')
    fillRound(snap, 'r1', 1)
    fillRound(snap, 'r2', 2)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    snap.tournament.status = 'finished'
    const s = clone(FIRST_TOURNAMENT_SETTINGS)
    s.modules.auction.enabled = false
    for (let i = 0; i < 20; i++) {
      const pending = computeTournament(snap, s).flags.pendingSnakeTiebreaks
      if (!pending.length) break
      for (const q of pending) snap.snakeTiebreaks.push({ roundId: q.roundId, groupId: q.groupId, hole: q.hole, lastHoledPlayerId: q.candidates[0]! })
    }
    const st = computeTournament(snap, s)
    const check = checkPrizePool(s, fieldShape(snap, s))
    results['MONEY-06b'] = { players: snap.players.length, checkNow: { balanced: check.balanced, difference: check.difference }, engineWarnings: st.flags.warnings, bank: st.money.banker }
    expect(check.balanced).toBe(false)
    expect(st.flags.warnings.some((w) => /cuadr|bolsa|premios/i.test(w))).toBe(false)
  })
})

describe('MONEY-15b explanation arithmetic', () => {
  it('a net triple bogey explains itself as "4 + 0 − 8 + 2 = 0 pts"', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 0 })], rounds: 1, settings: FIRST_TOURNAMENT_SETTINGS })
    snap.scores.push(score('r1', 'p1', 1, 8, 2))
    const h = computeCore(snap, FIRST_TOURNAMENT_SETTINGS).rounds.r1!.p1!.holes[0]!
    results['MONEY-15-arith'] = { steps: h.why.steps, prizeTitle: null }
    expect(h.why.steps.at(-1)).toContain('= 0 pts')
  })
  it('prize explanations print raw pesos ($10000) where the rest of the app prints $10,000', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 1)
    const st = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS)
    const first = st.prizes.find((p) => p.moduleId === 'individual' && p.amount >= 10000)!
    results['MONEY-15-raw'] = { title: first.why.title, steps: first.why.steps }
    expect(first.why.title).toMatch(/^\$\d{4,}/)
  })
})

describe('MONEY-10 a side pot nobody wins keeps the buy-ins, silently', () => {
  it('Ronda rápida «Más cerca del hoyo» ($100 side pot, 4 players) with no hole marked, and an eagle pot with no eagle', () => {
    const base = clone(DEFAULT_SETTINGS)
    const settings: TournamentSettings = {
      ...base,
      games: [
        { id: 'cerca', type: 'contest', label: 'Más cerca del hoyo', enabled: true, rounds: 'all', entrants: 'all', options: { kind: 'closest', holes: 'par3' }, money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [100] } },
        { id: 'aguilas', type: 'eventPot', label: 'Águilas', enabled: true, rounds: 'all', entrants: 'all', options: { event: 'eagle', basis: 'gross' }, money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [100] } },
      ] as TournamentSettings['games'],
    }
    const players = [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 10 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    for (const p of players) card(snap, 'r1', p.id, range(1, 18), 0)
    const st = computeTournament(snap, settings)
    const paid = (gid: string) => st.prizes.filter((p) => p.gameId === gid).reduce((s, p) => s + p.amount, 0)
    const check = checkPrizePool(settings, fieldShape(snap, settings))
    results['MONEY-10'] = {
      cerca: { pot: st.games.cerca!.pot, paid: paid('cerca'), notes: st.games.cerca!.board.notes },
      aguilas: { pot: st.games.aguilas!.pot, paid: paid('aguilas'), notes: st.games.aguilas!.board.notes },
      warnings: st.flags.warnings,
      bank: st.money.banker,
      prizeCheckSidePots: check.sidePots.map((x) => x.detail),
    }
    expect(paid('cerca')).toBe(0)
    expect(paid('aguilas')).toBe(0)
    expect(st.flags.warnings).toEqual([])
  })
})

describe('MONEY-20 team format + Calcutta: the winning team takes the champion AND runner-up slots', () => {
  it('best ball, 3 teams of 2, payout 55/20/…: team 1 players split 75%, team 2 gets no place slot', () => {
    const base = clone(FIRST_TOURNAMENT_SETTINGS)
    const settings: TournamentSettings = {
      ...base,
      tiers: [],
      modules: {
        ...base.modules,
        pairs: { ...base.modules.pairs, enabled: false, pairing: [] },
        snake: { ...base.modules.snake, enabled: false },
        bestRound: { ...base.modules.bestRound, enabled: false },
        fewestPutts: { ...base.modules.fewestPutts, enabled: false },
        individual: { ...base.modules.individual, format: 'team', formatOptions: { ...base.modules.individual.formatOptions, teamMode: 'bestBall', teamScoring: 'strokes', scoring: 'gross' } },
      },
      rounds: 1,
      entryFee: 0,
      prizes: { ...base.prizes, stableford: [] },
      auction: { ...base.auction, payout: [{ slot: 'place', place: 1, share: 0.7 }, { slot: 'place', place: 2, share: 0.3 }] },
    }
    const players = [1, 2, 3, 4, 5, 6].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings, status: 'finished' })
    snap.teams = [
      { id: 'T1', name: 'Uno', number: 1, playerIds: ['p1', 'p2'], drawnAt: null },
      { id: 'T2', name: 'Dos', number: 2, playerIds: ['p3', 'p4'], drawnAt: null },
      { id: 'T3', name: 'Tres', number: 3, playerIds: ['p5', 'p6'], drawnAt: null },
    ]
    card(snap, 'r1', 'p1', range(1, 18), -1) // team 1 wins
    card(snap, 'r1', 'p2', range(1, 18), 0)
    card(snap, 'r1', 'p3', range(1, 18), 0) // team 2 second
    card(snap, 'r1', 'p4', range(1, 18), 1)
    card(snap, 'r1', 'p5', range(1, 18), 1) // team 3 last
    card(snap, 'r1', 'p6', range(1, 18), 2)
    players.forEach((p, i) => snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 1000, ownerId: p.id, soldAt: '' }))
    const st = computeTournament(snap, settings)
    const a = st.modules.auction!
    results['MONEY-20'] = { board: st.modules.individual!.rows.map((r) => [r.playerId, r.label, r.figure.text]), slots: a.slots.map((s) => ({ label: s.label, ids: s.playerIds, share: s.share, amount: s.amount, why: s.why.steps })), payouts: Object.fromEntries(Object.entries(a.payouts).map(([k, v]) => [k, v.amount])) }
    expect(a.slots[0]!.playerIds).toEqual(['p1', 'p2'])
    expect(a.slots[0]!.share).toBeCloseTo(1)
    expect(a.payouts.p3).toBeUndefined()
  })
})

describe('MONEY-21 plus handicaps are floored to zero in tournaments but not in the Polo index', () => {
  it('index −1.2 (a +1.2) on a par-rated tee: tournament PH 0 (no stroke given back); WHS/SQL allocation gives one back on SI 18', async () => {
    const { whsStrokes, whsCourseHandicap } = await import('/home/user/Cardi-Golf/src/engine/profile/whs')
    const snap = makeSnapshot({ players: [makePlayer(1, { handicapSource: 'index', handicapIndex: -1.2, baseHcp: -1.2 })], rounds: 1, settings: { ...clone(DEFAULT_SETTINGS) } })
    const pr = computeCore(snap, DEFAULT_SETTINGS).rounds.r1!.p1!
    const ch = whsCourseHandicap(-12, 113, 720, 72)
    results['MONEY-21'] = { tournament: { courseHcp: pr.courseHcp, playingHcp: pr.playingHcp, strokesOnSI18: pr.holes.find((h) => h.strokeIndex === 18)!.strokesReceived, why: pr.playingHcpWhy.steps }, whs: { courseHcp: ch, strokesOnSI18: whsStrokes(ch, 18) } }
    expect(pr.playingHcp).toBe(0)
    expect(whsStrokes(ch, 18)).toBe(-1)
  })
})

describe('MONEY-06c only Day 1 exists in Rondas: finishing it makes the whole 2-day tournament final', () => {
  it('settings.rounds 2, one round created and finished → tournamentFinal, every prize final:true after one day', () => {
    const snap = makeFirstTournament()
    snap.rounds = [snap.rounds[0]!]
    snap.groups = snap.groups.filter((g) => g.roundId === 'r1')
    fillRound(snap, 'r1', 3)
    snap.rounds[0]!.status = 'finished'
    const st = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS)
    results['MONEY-06c'] = { settingsRounds: FIRST_TOURNAMENT_SETTINGS.rounds, roundsInTable: snap.rounds.length, tournamentStatus: snap.tournament.status, tournamentFinal: st.tournamentFinal, individualFinal: st.modules.individual!.final, prizesFinal: [...new Set(st.prizes.map((p) => p.final))] }
    expect(st.tournamentFinal).toBe(true)
    expect(st.modules.individual!.final).toBe(true)
  })
})

describe('NOTE-snake-wd a player who never tees off', () => {
  it('group of 4, p4 never plays: nothing settles while live; once finished p4 is paid $200 as a survivor', () => {
    const s = clone(FIRST_TOURNAMENT_SETTINGS)
    const snap = makeSnapshot({ players: 4, rounds: [makeRound(1, { status: 'live' })], settings: s })
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2', 'p3', 'p4'])]
    for (const pid of ['p1', 'p2', 'p3']) card(snap, 'r1', pid, range(1, 18), 0, pid === 'p1' ? 3 : 2)
    const live = computeTournament(snap, s).modules.snake!.groups[0]!
    snap.rounds[0]!.status = 'finished'
    const done = computeTournament(snap, s).modules.snake!.groups[0]!
    results['NOTE-snake-wd'] = { liveFinished: live.finished, livePayouts: live.payouts, holder: done.holderId, payouts: Object.fromEntries(Object.entries(done.payouts).map(([k, v]) => [k, v.amount])) }
    expect(live.finished).toBe(false)
    expect(done.payouts.p4!.amount).toBe(200)
  })
})
