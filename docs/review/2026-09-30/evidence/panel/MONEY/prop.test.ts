/**
 * MONEY panel: property-based invariants of computeTournament, with a seeded
 * generator (gen.ts) and shrink-by-search (the failing case with the smallest
 * field × rounds is kept as the minimal counter-example).
 *
 * Invariants:
 *  P1 settlement nets to zero (money.netSum === 0; via-bank transfers net to −difference)
 *  P2 Calcutta: Σ owner payouts + unfilled === pot, integers ≥ 0, `balanced`
 *  P3 prizes equal the pot: on a clean finished tournament whose prize check is balanced,
 *     Σ main-pot prizes + house cut === entry fee × players; each side pot pays what it collected
 *  P4 recomputation is deterministic
 *  P5 order independence (shuffle every array of the snapshot)
 *  P6 disabling a module leaves every other module's prizes unchanged
 *  P7 every prize carries an explanation whose title matches the amount paid
 *  P8 every flow amount is a whole, non-negative peso
 *  P9 per snake group: settled groups pay exactly their pot
 */
import { afterAll, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { computeTournament, type TournamentState } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { safeParseSettings, MODULE_IDS, type TournamentSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import type { Snapshot } from '/home/user/Cardi-Golf/src/engine/types'
import { answerSnake, gen, rng, type Gen } from './gen'

const OUT = process.env.PROP_OUT ?? '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/MONEY/prop.result.json'
const N_MESSY = Number(process.env.N_MESSY ?? 2500)
const N_CLEAN = Number(process.env.N_CLEAN ?? 2500)

interface Fail { seed: number; size: number; detail: unknown }
const fails: Record<string, Fail[]> = {}
const stats: Record<string, number> = {}
const bump = (k: string, by = 1) => (stats[k] = (stats[k] ?? 0) + by)
function fail(inv: string, g: Gen, detail: unknown) {
  const size = (g.meta.n as number) * (g.meta.nRounds as number)
  ;(fails[inv] ??= []).push({ seed: g.meta.seed as number, size, detail })
}

const compute = (s: Snapshot, t: TournamentSettings) => computeTournament(s, t)

function prizeKey(st: TournamentState, exclude?: string) {
  return st.prizes
    .filter((p) => p.moduleId !== exclude)
    .map((p) => `${p.moduleId}|${p.gameId ?? ''}|${p.label}|${p.playerId}|${p.payerId ?? ''}|${p.amount}|${p.final}`)
    .sort()
}

function shuffled(snap: Snapshot, seed: number): Snapshot {
  const r = rng(seed)
  const s = structuredClone(snap)
  s.players = r.shuffle(s.players)
  s.scores = r.shuffle(s.scores)
  s.groups = r.shuffle(s.groups).map((g) => ({ ...g }))
  s.rounds = r.shuffle(s.rounds)
  s.pairs = r.shuffle(s.pairs)
  s.calcuttaLots = r.shuffle(s.calcuttaLots)
  s.calcuttaBids = r.shuffle(s.calcuttaBids)
  s.calcuttaBuybacks = r.shuffle(s.calcuttaBuybacks)
  s.payments = r.shuffle(s.payments)
  s.snakeTiebreaks = r.shuffle(s.snakeTiebreaks)
  s.handicapOverrides = r.shuffle(s.handicapOverrides)
  s.roundTees = r.shuffle(s.roundTees)
  s.gameEntries = r.shuffle(s.gameEntries)
  s.holeAwards = r.shuffle(s.holeAwards)
  s.teams = r.shuffle(s.teams)
  return s
}

function moneyKey(st: TournamentState) {
  const people = Object.values(st.money.people)
    .map((m) => `${m.playerId}|${m.paid}|${m.receives}|${m.net}|${m.prizesTotal}|${m.calcuttaShares}`)
    .sort()
  const via = st.money.viaBank.map((t) => `${t.from}|${t.to}|${t.amount}`).sort()
  return { people, via, banker: st.money.banker }
}

function checkAll(g: Gen, label: 'messy' | 'clean') {
  const parsed = safeParseSettings(g.settings)
  if (!parsed.success) {
    bump(`${label}:invalidSettings`)
    return
  }
  const settings = parsed.data
  const snap = g.snap
  if (label === 'clean') answerSnake(snap, settings, compute)
  const st = compute(snap, settings)
  bump(`${label}:cases`)

  // P1
  if (st.money.netSum !== 0) fail('P1 netSum', g, { netSum: st.money.netSum })
  const bankOut = st.money.viaBank.filter((t) => t.from === null).reduce((s, t) => s + t.amount, 0)
  const bankIn = st.money.viaBank.filter((t) => t.to === null).reduce((s, t) => s + t.amount, 0)
  if (bankIn - bankOut !== st.money.banker.difference + st.money.banker.houseCut) fail('P1 viaBank nets to the bank difference', g, { bankIn, bankOut, banker: st.money.banker })

  // P2
  const a = st.modules.auction
  if (a && a.slots.length) {
    bump(`${label}:auctionPaid`)
    const paid = Object.values(a.payouts).reduce((s, p) => s + p.amount, 0)
    const lines = Object.values(a.payouts).flatMap((p) => p.lines)
    if (Math.abs(paid + a.unfilled - a.pot) > 1e-9) fail('P2 calcutta sum', g, { pot: a.pot, paid, unfilled: a.unfilled })
    if (lines.some((l) => !Number.isInteger(l.amount) || l.amount < 0)) fail('P2 calcutta integer lines', g, { lines: lines.filter((l) => !Number.isInteger(l.amount) || l.amount < 0) })
    if (!Number.isInteger(a.unfilled)) fail('P2 calcutta unfilled is not whole pesos', g, { pot: a.pot, unfilled: a.unfilled })
    if (!a.balanced) fail('P2 calcutta balanced flag', g, { pot: a.pot, paid, unfilled: a.unfilled })
    const redondeo = lines.filter((l) => l.slotLabel === 'Redondeo').reduce((s, l) => s + l.amount, 0)
    const owners = lines.filter((l) => l.slotLabel !== 'Redondeo').length
    if (redondeo > owners) fail('P2 calcutta remainder larger than one peso per owner line', g, { redondeo, owners })
  }

  // P8
  for (const f of st.money.flows) if (!Number.isInteger(f.amount) || f.amount < 0) {
    fail('P8 non-integer or negative flow', g, { f })
    break
  }

  // P9
  for (const grp of st.modules.snake?.groups ?? []) {
    if (!grp.finished || grp.pendingHole != null) continue
    const sum = Object.values(grp.payouts).reduce((s, p) => s + p.amount, 0)
    if (sum !== grp.pot) fail('P9 snake group pays its pot', g, { group: grp.groupId, sum, pot: grp.pot })
  }

  // P7
  for (const p of st.prizes) {
    if (!p.why || !p.why.title || !p.why.steps?.length) {
      fail('P7 prize without explanation', g, { moduleId: p.moduleId, label: p.label })
      continue
    }
    const nums = [...p.why.title.matchAll(/\$\s?([\d,]+)/g)].map((m) => Number(m[1]!.replace(/,/g, '')))
    if (nums.length && !nums.includes(p.amount)) {
      bump(`P7 title≠amount:${p.moduleId}`)
      if ((fails[`P7 explanation title ≠ amount (${p.moduleId})`]?.length ?? 0) < 3) fail(`P7 explanation title ≠ amount (${p.moduleId})`, g, { label: p.label, amount: p.amount, title: p.why.title })
    }
  }

  // P3 (clean only)
  if (label === 'clean') {
    const pendingSnake = st.flags.pendingSnakeTiebreaks.length
    const incomplete = Object.values(st.core.rounds).some((byP) => Object.values(byP).some((pr) => !pr.complete))
    const soldAll = !st.modules.auction || st.modules.auction.lots.every((l) => l.status === 'sold')
    const entryPot = settings.entryFee * snap.players.length
    const main = st.prizes.filter((p) => !p.payerId && (p.potId ?? 'main') === 'main').reduce((s, p) => s + p.amount, 0)
    const houseCut = st.money.banker.houseCut
    const precondition = g.meta.checkBalanced === true && !pendingSnake && !incomplete
    if (precondition) {
      bump('clean:P3 eligible')
      if (main + houseCut !== entryPot) {
        const byModule: Record<string, number> = {}
        for (const p of st.prizes.filter((p) => !p.payerId && (p.potId ?? 'main') === 'main')) byModule[p.moduleId] = (byModule[p.moduleId] ?? 0) + p.amount
        fail('P3 main pot pays out exactly the entries', g, { entryPot, paid: main, houseCut, diff: entryPot - main - houseCut, byModule, settingsPrizes: settings.prizes, modules: Object.fromEntries(MODULE_IDS.map((m) => [m, settings.modules[m].enabled])), soldAll })
      }
      // Side pots: each pays what it collected.
      for (const [gid, gr] of Object.entries(st.games)) {
        if (gr.config.money.source !== 'side' || gr.pot <= 0) continue
        const paidOut = st.prizes.filter((p) => p.gameId === gid && !p.payerId).reduce((s, p) => s + p.amount, 0)
        if (paidOut !== gr.pot) fail(`P3 side pot pays what it collected (${gr.config.type})`, g, { gid, pot: gr.pot, paidOut, warnings: st.flags.warnings.filter((w) => w.startsWith(gr.config.label)) })
      }
    } else bump('clean:P3 skipped (unbalanced check or pending/incomplete)')
  }

  // P4
  const again = compute(structuredClone(snap), structuredClone(settings))
  if (JSON.stringify(prizeKey(again)) !== JSON.stringify(prizeKey(st)) || JSON.stringify(moneyKey(again)) !== JSON.stringify(moneyKey(st))) fail('P4 determinism', g, {})

  // P5
  const sh = compute(shuffled(snap, (g.meta.seed as number) ^ 0x5bd1e995), settings)
  const pk1 = prizeKey(st)
  const pk2 = prizeKey(sh)
  if (JSON.stringify(pk1) !== JSON.stringify(pk2)) {
    const only1 = pk1.filter((x) => !pk2.includes(x))
    const only2 = pk2.filter((x) => !pk1.includes(x))
    fail('P5 order independence (prizes)', g, { only1: only1.slice(0, 6), only2: only2.slice(0, 6) })
  } else if (JSON.stringify(moneyKey(st)) !== JSON.stringify(moneyKey(sh))) fail('P5 order independence (money)', g, {})

  // P6
  for (const m of MODULE_IDS) {
    if (!settings.modules[m].enabled) continue
    const off = structuredClone(settings)
    off.modules[m].enabled = false
    const st2 = compute(snap, off)
    // In percent mode the individual game takes what the others leave: by design it moves.
    const skipIndividual = settings.prizes.stablefordMode === 'percent'
    const k1 = prizeKey(st, m).filter((x) => !(skipIndividual && x.startsWith('individual|')))
    const k2 = prizeKey(st2, m).filter((x) => !(skipIndividual && x.startsWith('individual|')))
    if (JSON.stringify(k1) !== JSON.stringify(k2)) {
      const only1 = k1.filter((x) => !k2.includes(x))
      const only2 = k2.filter((x) => !k1.includes(x))
      fail(`P6 disabling ${m} changes other prizes`, g, { only1: only1.slice(0, 6), only2: only2.slice(0, 6) })
    }
    if (st2.modules[m as keyof typeof st2.modules] !== undefined) fail(`P6 disabled ${m} still has state`, g, {})
  }
}

afterAll(() => {
  const summary: Record<string, unknown> = { stats, invariants: {} as Record<string, unknown> }
  for (const [inv, list] of Object.entries(fails)) {
    const min = [...list].sort((x, y) => x.size - y.size || x.seed - y.seed)[0]!
    ;(summary.invariants as Record<string, unknown>)[inv] = { failures: list.length, minimal: min }
  }
  writeFileSync(OUT, JSON.stringify(summary, null, 1))
})

describe('property invariants', () => {
  it(`messy tournaments (${N_MESSY} seeds): partial cards, live/cancelled rounds, missing putts, unsold lots`, () => {
    for (let seed = 1; seed <= N_MESSY; seed++) checkAll(gen(seed), 'messy')
    expect(stats['messy:cases']).toBeGreaterThan(0)
  })
  const N_FMT = Number(process.env.N_FMT ?? 0)
  for (const format of ['strokePlay', 'matchPlay', 'team'] as const) {
    it(`clean ${format} tournaments (${N_FMT} seeds)`, () => {
      for (let seed = 200001; seed <= 200000 + N_FMT; seed++) checkAll(gen(seed, { clean: true, format }), 'clean')
    })
  }
  it(`clean finished tournaments (${N_CLEAN} seeds): every card complete, every tiebreak answered`, () => {
    for (let seed = 100001; seed <= 100000 + N_CLEAN; seed++) checkAll(gen(seed, { clean: true }), 'clean')
    expect(stats['clean:cases']).toBeGreaterThan(0)
  })
})
