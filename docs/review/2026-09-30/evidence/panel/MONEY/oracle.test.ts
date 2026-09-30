/**
 * MONEY panel: an independent re-implementation of CLAUDE.md §5 (the first
 * tournament's rules, written from the brief, not from the engine), run
 * against computeTournament on thousands of random first-tournament
 * configurations with deliberately tie-heavy scores (so countbacks, split
 * prizes, snake collisions and Calcutta ties all happen).
 *
 * Everything the oracle computes is compared exactly, except the Calcutta
 * owner amounts, where the brief fixes only "whole pesos, remainder to the
 * champion's owners": those are compared within one peso per line and the
 * total must equal the pot.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from '/home/user/Cardi-Golf/src/engine/settings/presets'
import { makeFirstTournament, score, PAR_72 } from '/home/user/Cardi-Golf/src/engine/testing/fixtures'
import type { Snapshot } from '/home/user/Cardi-Golf/src/engine/types'
import { rng } from './gen'

const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/MONEY/oracle.result.json'
const N = Number(process.env.N_ORACLE ?? 3000)
const S = FIRST_TOURNAMENT_SETTINGS

// ---------------------------------------------------------------- the oracle
const halfUp = (x: number) => Math.floor(x + 0.5 + 1e-9)
const PH1 = (base: number) => halfUp(0.8 * Math.min(base, 54))
const strokesOn = (ph: number, si: number) => (ph <= 0 ? 0 : Math.floor(ph / 18) + (si <= ph % 18 ? 1 : 0))
const pts = (par: number, sr: number, gross: number | null, picked: boolean) => (picked || gross == null ? 0 : Math.max(0, par + sr - gross + 2))
const cutOf = (p1: number) => (p1 > 36 ? Math.min(4, Math.floor((p1 - 36) / 2)) : 0)

interface OPlayer { id: string; tier: string; base: number; sort: number }
interface OHole { gross: number | null; putts: number; picked: boolean }

/** A rank over ids by a comparator (negative = a ahead); returns tie groups. */
function groupsBy(ids: string[], cmp: (a: string, b: string) => number, order: (a: string, b: string) => number) {
  const sorted = [...ids].sort((a, b) => cmp(a, b) || order(a, b))
  const out: Array<{ position: number; members: string[] }> = []
  sorted.forEach((id, i) => {
    const last = out[out.length - 1]
    if (last && cmp(last.members[0]!, id) === 0) last.members.push(id)
    else out.push({ position: i + 1, members: [id] })
  })
  return out
}
/** Tie groups share the prizes of the places they occupy, split in whole pesos, spare pesos to the first members. */
function pay(groups: Array<{ position: number; members: string[] }>, prizes: number[]) {
  const out: Record<string, number> = {}
  for (const g of groups) {
    let total = 0
    for (let k = 0; k < g.members.length; k++) total += prizes[g.position - 1 + k] ?? 0
    if (!total) continue
    const base = Math.floor(total / g.members.length)
    let rem = total - base * g.members.length
    for (const m of g.members) {
      out[m] = base + (rem > 0 ? 1 : 0)
      if (rem > 0) rem--
    }
  }
  return out
}

function oracle(players: OPlayer[], cards: Record<string, Record<string, OHole[]>>, groups: Array<{ rid: string; id: string; start: number; ids: string[] }>, tiebreaks: Array<{ rid: string; gid: string; hole: number; last: string }>, pairs: Array<{ id: string; a: string; b: string }>, lots: Array<{ pid: string; price: number; owner: string; bb: number }>) {
  const holes = PAR_72.map(([par, si], i) => ({ n: i + 1, par, si }))
  const order = (a: string, b: string) => players.find((p) => p.id === a)!.sort - players.find((p) => p.id === b)!.sort
  const ph: Record<string, [number, number]> = {}
  const perHole: Record<string, Record<string, number[]>> = { r1: {}, r2: {} }
  const day: Record<string, [number, number]> = {}
  for (const p of players) {
    const ph1 = PH1(p.base)
    const d1 = holes.map((h, i) => pts(h.par, strokesOn(ph1, h.si), cards.r1![p.id]![i]!.gross, cards.r1![p.id]![i]!.picked))
    const p1 = d1.reduce((a, b) => a + b, 0)
    const ph2 = Math.max(0, ph1 - cutOf(p1))
    const d2 = holes.map((h, i) => pts(h.par, strokesOn(ph2, h.si), cards.r2![p.id]![i]!.gross, cards.r2![p.id]![i]!.picked))
    ph[p.id] = [ph1, ph2]
    perHole.r1![p.id] = d1
    perHole.r2![p.id] = d2
    day[p.id] = [p1, d2.reduce((a, b) => a + b, 0)]
  }
  const win = (arr: number[], f: number, t: number) => arr.slice(f - 1, t).reduce((a, b) => a + b, 0)
  const countbackCmp = (rid: 'r1' | 'r2') => (a: string, b: string) => {
    for (const [f, t] of [[1, 18], [10, 18], [13, 18], [16, 18], [18, 18]] as const) {
      const d = win(perHole[rid]![b]!, f, t) - win(perHole[rid]![a]!, f, t)
      if (d) return d
    }
    return 0
  }
  const total = (id: string) => day[id]![0] + day[id]![1]
  const ids = players.map((p) => p.id)
  // §5.3 individual
  const indGroups = groupsBy(ids, (a, b) => total(b) - total(a) || countbackCmp('r2')(a, b), order)
  const individual = pay(indGroups, S.prizes.stableford)
  // §5.4 best round per day
  const best: Record<string, Record<string, number>> = {}
  for (const rid of ['r1', 'r2'] as const) {
    const di = rid === 'r1' ? 0 : 1
    const g = groupsBy(ids, (a, b) => day[b]![di]! - day[a]![di]! || countbackCmp(rid)(a, b), order)
    best[rid] = pay(g.slice(0, 1), [S.prizes.bestRoundPerDay])
  }
  // §5.5 pairs
  const pairTotal = (p: { a: string; b: string }) => total(p.a) + total(p.b)
  const pairD2 = (p: { a: string; b: string }) => day[p.a]![1] + day[p.b]![1]
  const pg = groupsBy(pairs.map((p) => p.id), (x, y) => {
    const px = pairs.find((p) => p.id === x)!
    const py = pairs.find((p) => p.id === y)!
    return pairTotal(py) - pairTotal(px) || pairD2(py) - pairD2(px)
  }, (x, y) => x.localeCompare(y))
  const pairPay = pay(pg, S.prizes.pairs)
  const pairsOut: Record<string, number> = {}
  for (const [pid, amt] of Object.entries(pairPay)) {
    const p = pairs.find((x) => x.id === pid)!
    const each = Math.floor(amt / 2)
    pairsOut[p.a] = each + (amt - each * 2)
    pairsOut[p.b] = each
  }
  // §5.6 snake
  const snake: Record<string, number> = {}
  const snakePending: string[] = []
  for (const g of groups) {
    const play = Array.from({ length: 18 }, (_, i) => ((g.start - 1 + i) % 18) + 1)
    let holder: string | null = null
    let pending = false
    for (const h of play) {
      const c = g.ids.filter((id) => cards[g.rid]![id]![h - 1]!.putts >= 3)
      if (!c.length) continue
      if (c.length === 1) holder = c[0]!
      else {
        const tb = tiebreaks.find((t) => t.rid === g.rid && t.gid === g.id && t.hole === h)
        if (tb && c.includes(tb.last)) holder = tb.last
        else {
          pending = true
          break
        }
      }
    }
    if (pending) {
      snakePending.push(g.id)
      continue
    }
    for (const id of g.ids) snake[id] = (snake[id] ?? 0) + (holder ? (id === holder ? 0 : 200) : 600 / g.ids.length)
  }
  // §5.7 fewest putts (a pick-up counts at least 3: §18.1 as the engine reads it)
  const putts = (id: string) => ['r1', 'r2'].reduce((s, rid) => s + cards[rid]![id]!.reduce((x, h) => x + (h.picked ? Math.max(h.putts, 3) : h.putts), 0), 0)
  const fpg = groupsBy(ids, (a, b) => putts(a) - putts(b), order)
  const fewest = pay(fpg.slice(0, 1), [S.prizes.fewestPutts])
  // §5.9 Calcutta
  const pot = lots.reduce((s, l) => s + l.price, 0)
  const tierOf = (id: string) => players.find((p) => p.id === id)!.tier
  const cashed = new Set<string>()
  const slotPay: Array<{ label: string; ids: string[]; share: number }> = []
  // champion + runner-up with tie groups combining place shares
  const placeShares: Record<number, number> = { 1: 0.55, 2: 0.2 }
  for (const place of [1, 2]) {
    const g = indGroups.find((x) => x.position <= place && place < x.position + x.members.length)!
    const covered = [1, 2].filter((p) => g.position <= p && p < g.position + g.members.length)
    if (covered[0] !== place) continue // already paid with the lower place of the tie
    const members = g.members.filter((m) => !cashed.has(m))
    const share = covered.reduce((s, p) => s + placeShares[p]!, 0)
    if (members.length) {
      slotPay.push({ label: `place${place}`, ids: members, share })
      members.forEach((m) => cashed.add(m))
    }
  }
  for (const tier of ['C', 'D']) {
    const g = indGroups.find((x) => x.members.some((m) => tierOf(m) === tier && !cashed.has(m)))
    if (!g) continue
    const members = g.members.filter((m) => tierOf(m) === tier && !cashed.has(m))
    slotPay.push({ label: `best${tier}`, ids: members, share: 0.1 })
    members.forEach((m) => cashed.add(m))
  }
  {
    const g = indGroups[indGroups.length - 1]!
    const members = g.members.filter((m) => !cashed.has(m))
    if (members.length) slotPay.push({ label: 'last', ids: members, share: 0.05 })
  }
  const exactOwner: Record<string, number> = {}
  for (const s of slotPay) {
    for (const pid of s.ids) {
      const lot = lots.find((l) => l.pid === pid)!
      const amount = (pot * s.share) / s.ids.length
      const owners = lot.bb > 0 && lot.owner !== pid ? [[lot.owner, 100 - lot.bb], [pid, lot.bb]] as const : [[lot.owner, 100]] as const
      for (const [o, pct] of owners) exactOwner[o] = (exactOwner[o] ?? 0) + (amount * pct) / 100
    }
  }
  const unfilled = pot - slotPay.reduce((s, x) => s + pot * x.share, 0)
  return { ph, day, individual, best, pairsOut, snake, snakePending, fewest, pot, exactOwner, unfilled, indGroups }
}

// ---------------------------------------------------------------- random first tournaments
function build(seed: number) {
  const r = rng(seed)
  const snap: Snapshot = makeFirstTournament()
  // Random bases per player, tie-heavy.
  snap.players.forEach((p) => (p.baseHcp = r.pick([6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 33, r.int(0, 54), Math.round(r.next() * 400) / 10])))
  snap.groups = []
  const pairIds = snap.pairs.map((p) => [p.player1Id, p.player2Id])
  for (const rid of ['r1', 'r2']) {
    const ad = r.shuffle(pairIds.slice(0, 3))
    const bc = r.shuffle(pairIds.slice(3))
    for (let g = 0; g < 3; g++) snap.groups.push({ id: `${rid}g${g + 1}`, roundId: rid, number: g + 1, teeTime: null, startHole: r.chance(0.4) ? 10 : 1, playerIds: [...ad[g]!, ...bc[g]!] })
  }
  const holes = snap.courses[0]!.tees[0]!.holes
  const cards: Record<string, Record<string, OHole[]>> = { r1: {}, r2: {} }
  const flat = r.chance(0.5) // flat = everyone plays net pars with rare deviations → many ties
  for (const rid of ['r1', 'r2']) {
    for (const p of snap.players) {
      const ph = Math.round(0.8 * p.baseHcp)
      cards[rid]![p.id] = holes.map((h) => {
        const sr = Math.floor(ph / 18) + (h.strokeIndex <= ph % 18 ? 1 : 0)
        const noise = flat ? r.pick([0, 0, 0, 0, 0, 1, -1]) : r.int(-2, 3)
        const picked = r.chance(0.04)
        const gross = picked ? null : Math.max(1, Math.min(15, h.par + sr + noise))
        let putts = r.chance(0.1) ? 3 : r.chance(0.25) ? 1 : 2
        if (r.chance(0.02)) putts = 4
        if (gross != null) putts = Math.min(putts, gross)
        return { gross, putts, picked }
      })
      cards[rid]![p.id]!.forEach((h, i) => snap.scores.push(score(rid, p.id, i + 1, h.gross, h.putts, h.picked)))
    }
  }
  snap.rounds.forEach((x) => (x.status = 'finished'))
  snap.tournament.status = 'finished'
  // Calcutta: every lot sold; random owners, buybacks.
  const lots = snap.players.map((p, i) => {
    const price = 250 * r.int(1, 12)
    const owner = r.chance(0.3) ? p.id : snap.players[r.int(0, 11)]!.id
    const bb = owner !== p.id && r.chance(0.4) ? r.pick([25, 50, r.int(1, 50)]) : 0
    snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price, ownerId: owner, soldAt: null })
    if (bb) snap.calcuttaBuybacks.push({ lotId: `lot${i + 1}`, pct: bb, amount: Math.round((price * bb) / 100), paid: false })
    return { pid: p.id, price, owner, bb }
  })
  // Answer tiebreaks for ~80% of the groups that need them.
  const tiebreaks: Array<{ rid: string; gid: string; hole: number; last: string }> = []
  for (let k = 0; k < 30; k++) {
    const pending = computeTournament(snap, S).flags.pendingSnakeTiebreaks
    if (!pending.length) break
    let answered = 0
    for (const q of pending) {
      if (r.chance(0.2)) continue
      const last = r.pick(q.candidates)
      snap.snakeTiebreaks.push({ roundId: q.roundId, groupId: q.groupId, hole: q.hole, lastHoledPlayerId: last })
      tiebreaks.push({ rid: q.roundId, gid: q.groupId, hole: q.hole, last })
      answered++
    }
    if (!answered) break
  }
  const players = snap.players.map((p) => ({ id: p.id, tier: p.tier!, base: p.baseHcp, sort: p.sortOrder }))
  const groups = snap.groups.map((g) => ({ rid: g.roundId, id: g.id, start: g.startHole, ids: g.playerIds }))
  const pairs = snap.pairs.map((p) => ({ id: p.id, a: p.player1Id, b: p.player2Id }))
  return { snap, oracleIn: [players, cards, groups, tiebreaks, pairs, lots] as const, flat }
}

const mismatches: Record<string, Array<{ seed: number; detail: unknown }>> = {}
const counters: Record<string, number> = {}
const note = (k: string, seed: number, detail: unknown) => {
  const list = (mismatches[k] ??= [])
  if (list.length < 5) list.push({ seed, detail })
  counters[`mismatch:${k}`] = (counters[`mismatch:${k}`] ?? 0) + 1
}
const count = (k: string, by = 1) => (counters[k] = (counters[k] ?? 0) + by)
afterAll(() => writeFileSync(OUT, JSON.stringify({ N, counters, mismatches }, null, 1)))

describe('independent §5 oracle vs computeTournament', () => {
  it(`${N} random first tournaments (tie-heavy)`, () => {
    for (let seed = 1; seed <= N; seed++) {
      const { snap, oracleIn } = build(seed)
      const o = oracle(...oracleIn)
      const st = computeTournament(snap, S)
      count('cases')
      // Handicaps and daily points.
      for (const p of snap.players) {
        const e1 = st.core.rounds.r1![p.id]!
        const e2 = st.core.rounds.r2![p.id]!
        if (e1.playingHcp !== o.ph[p.id]![0] || e2.playingHcp !== o.ph[p.id]![1]) note('playing handicap', seed, { p: p.id, engine: [e1.playingHcp, e2.playingHcp], oracle: o.ph[p.id] })
        if (e1.points !== o.day[p.id]![0] || e2.points !== o.day[p.id]![1]) note('daily points', seed, { p: p.id, engine: [e1.points, e2.points], oracle: o.day[p.id] })
      }
      const sum = (moduleId: string, pid: string, label?: string) => st.prizes.filter((x) => x.moduleId === moduleId && x.playerId === pid && (!label || x.label.includes(label))).reduce((s, x) => s + x.amount, 0)
      // Individual.
      const tiedGroups = o.indGroups.filter((g) => g.members.length > 1).length
      if (tiedGroups) count('individual ties after countback', tiedGroups)
      for (const p of snap.players) if (sum('individual', p.id) !== (o.individual[p.id] ?? 0)) note('individual prize', seed, { p: p.id, engine: sum('individual', p.id), oracle: o.individual[p.id] ?? 0, groups: o.indGroups.slice(0, 5) })
      // Best round.
      for (const [rid, n] of [['r1', 1], ['r2', 2]] as const) for (const p of snap.players) if (sum('bestRound', p.id, `día ${n}`) !== (o.best[rid]![p.id] ?? 0)) note('best round', seed, { rid, p: p.id, engine: sum('bestRound', p.id, `día ${n}`), oracle: o.best[rid]![p.id] ?? 0 })
      // Pairs.
      for (const p of snap.players) if (sum('pairs', p.id) !== (o.pairsOut[p.id] ?? 0)) note('pairs prize', seed, { p: p.id, engine: sum('pairs', p.id), oracle: o.pairsOut[p.id] ?? 0 })
      // Snake.
      if (o.snakePending.length) count('snake groups left pending', o.snakePending.length)
      for (const p of snap.players) if (sum('snake', p.id) !== (o.snake[p.id] ?? 0)) note('snake', seed, { p: p.id, engine: sum('snake', p.id), oracle: o.snake[p.id] ?? 0 })
      // Fewest putts.
      for (const p of snap.players) if (sum('fewestPutts', p.id) !== (o.fewest[p.id] ?? 0)) note('fewest putts', seed, { p: p.id, engine: sum('fewestPutts', p.id), oracle: o.fewest[p.id] ?? 0 })
      // Calcutta.
      const a = st.modules.auction!
      if (a.pot !== o.pot) note('calcutta pot', seed, { engine: a.pot, oracle: o.pot })
      const paid = Object.values(a.payouts).reduce((s, x) => s + x.amount, 0)
      if (Math.abs(paid + a.unfilled - a.pot) > 1e-9) note('calcutta total ≠ pot', seed, { paid, unfilled: a.unfilled, pot: a.pot })
      if (Math.abs(a.unfilled - o.unfilled) > 1e-6) note('calcutta unfilled', seed, { engine: a.unfilled, oracle: o.unfilled })
      const allLines = Object.values(a.payouts).reduce((s, x) => s + x.lines.length, 0)
      for (const [owner, exact] of Object.entries(o.exactOwner)) {
        const eng = a.payouts[owner]?.amount ?? 0
        if (Math.abs(eng - exact) > allLines) note('calcutta owner amount', seed, { owner, engine: eng, exact })
        else if (Math.abs(eng - exact) >= 1) count('calcutta owner off by rounding (≤ lines)')
      }
      for (const owner of Object.keys(a.payouts)) if (!(owner in o.exactOwner) && a.payouts[owner]!.amount > 1) note('calcutta unexpected owner', seed, { owner, amount: a.payouts[owner]!.amount })
      // Main pot closes when nothing is pending.
      const main = st.prizes.filter((x) => x.moduleId !== 'auction').reduce((s, x) => s + x.amount, 0)
      if (!o.snakePending.length && main !== 30000) note('main pot ≠ $30,000 with nothing pending', seed, { main })
      if (!o.snakePending.length) count('fully settled cases')
    }
    expect(counters.cases).toBe(N)
  })
})
