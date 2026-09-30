/**
 * V2 independent repros for MONEY-05 ("el Comité decide" money has no first-class path)
 * and MONEY-06 (the pool is checked only on save; rounds/roster drift unchecked).
 * Also tests a workaround the finding did not consider: an "Apuesta libre" paid "De la bolsa".
 */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from '/home/user/Cardi-Golf/src/engine/settings/presets'
import { checkPrizePool, fieldShape } from '/home/user/Cardi-Golf/src/engine/settings/prizeCheck'
import { safeParseSettings, type TournamentSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import { GAME_ENTRIES } from '/home/user/Cardi-Golf/src/engine/games/catalog'
import type { Snapshot } from '/home/user/Cardi-Golf/src/engine/types'
import { fillRound, makeFirstTournament, makeGroup, makeRound } from '/home/user/Cardi-Golf/src/engine/testing/fixtures'

const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V2/money05_06.result.json'
const out: Record<string, unknown> = {}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

function answerTiebreaks(snap: Snapshot, s: TournamentSettings) {
  for (let i = 0; i < 30; i++) {
    const pending = computeTournament(snap, s).flags.pendingSnakeTiebreaks
    if (!pending.length) return
    for (const q of pending) snap.snakeTiebreaks.push({ roundId: q.roundId, groupId: q.groupId, hole: q.hole, lastHoledPlayerId: q.candidates[0]! })
  }
}
const bank = (st: ReturnType<typeof computeTournament>) => st.money.banker

describe('MONEY-05 V2', () => {
  it('first tournament (all modules incl. Calcutta), Day 2 cancelled after Day 1 finished', () => {
    const s = clone(FIRST_TOURNAMENT_SETTINGS) as TournamentSettings
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 11)
    snap.rounds[0]!.status = 'finished'
    snap.rounds[1]!.status = 'cancelled'
    snap.tournament.status = 'finished'
    // Calcutta: every lot sold for $1,000 to the next player.
    snap.calcuttaLots = snap.players.map((p, i) => ({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold' as const, price: 1000, ownerId: snap.players[(i + 1) % 12]!.id, soldAt: '' }))
    answerTiebreaks(snap, s)
    const st = computeTournament(snap, s)
    const byModule: Record<string, number> = {}
    for (const p of st.prizes) byModule[p.moduleId] = (byModule[p.moduleId] ?? 0) + p.amount
    out.cancelled = { tournamentFinal: st.tournamentFinal, byModule, bank: bank(st), warnings: st.flags.warnings, flags: { incomplete: st.flags.incompleteRounds.length, pendingSnake: st.flags.pendingSnakeTiebreaks.length } }
    expect(bank(st).difference).toBe(3000)
    expect(st.flags.warnings.some((w) => /cancel|sin asignar|Comité/i.test(w))).toBe(false)
  })

  it('workaround: Días 1 + "Apuesta libre" De la bolsa $3,000 with the Comité marking winners → bank balanced, save allowed', () => {
    const snap = makeFirstTournament()
    fillRound(snap, 'r1', 11)
    snap.rounds[0]!.status = 'finished'
    snap.rounds[1]!.status = 'cancelled'
    snap.tournament.status = 'finished'
    const base = clone(FIRST_TOURNAMENT_SETTINGS) as TournamentSettings
    base.modules.auction.enabled = false
    answerTiebreaks(snap, base)

    const withGame = (rounds: number) => {
      const s = clone(base)
      s.rounds = rounds
      const g = GAME_ENTRIES.find((e) => e.key === 'custom')!.create('reparto')
      g.label = 'Reparto día 2'
      g.money = { ...g.money, source: 'main', amount: 3000 }
      s.games = [g]
      return s
    }
    const s2 = withGame(2)
    const s1 = withGame(1)
    const parsed1 = safeParseSettings(s1)
    const check2 = checkPrizePool(s2, fieldShape(snap, s2))
    const check1 = checkPrizePool(s1, fieldShape(snap, s1))
    // The Comité taps all twelve players as winners (equal shares) in Comité › Juegos.
    snap.gameResults = snap.players.map((p) => ({ gameId: 'reparto', playerId: p.id, share: 1 }))
    const st = computeTournament(snap, s1)
    const custom = st.prizes.filter((p) => p.gameId === 'reparto')
    out.workaround = {
      parseOk: parsed1.success,
      checkWithDias2: { balanced: check2.balanced, difference: check2.difference },
      checkWithDias1: { balanced: check1.balanced, difference: check1.difference },
      customPrizes: custom.map((p) => ({ player: p.playerId, amount: p.amount, final: p.final, potId: p.potId })),
      bank: bank(st),
    }
    expect(check1.balanced).toBe(true)
    expect(bank(st).balanced).toBe(true)
  })
})

describe('MONEY-06 V2', () => {
  it('a Day 3 added in Rondas: best round pays 3 days, prize check (settings.rounds 2) still balanced', () => {
    const s = clone(FIRST_TOURNAMENT_SETTINGS) as TournamentSettings
    s.modules.auction.enabled = false
    const snap = makeFirstTournament()
    snap.rounds.push(makeRound(3))
    snap.groups.push(makeGroup('r3', 1, ['p1', 'p10', 'p4', 'p7']), makeGroup('r3', 2, ['p2', 'p11', 'p5', 'p8']), makeGroup('r3', 3, ['p3', 'p12', 'p6', 'p9']))
    for (const r of snap.rounds) {
      fillRound(snap, r.id, r.number * 5)
      r.status = 'finished'
    }
    snap.tournament.status = 'finished'
    answerTiebreaks(snap, s)
    const st = computeTournament(snap, s)
    const byModule: Record<string, number> = {}
    for (const p of st.prizes) byModule[p.moduleId] = (byModule[p.moduleId] ?? 0) + p.amount
    const check = checkPrizePool(s, fieldShape(snap, s))
    out.day3 = { byModule, bank: bank(st), checkLive: { balanced: check.balanced, difference: check.difference, lines: check.lines.map((l) => `${l.label}: ${l.amount} (${l.detail})`) }, warnings: st.flags.warnings }
  })

  it('12 planned, 11 play: live check says unbalanced, engine has no flag, bank ends negative', () => {
    const s = clone(FIRST_TOURNAMENT_SETTINGS) as TournamentSettings
    s.modules.auction.enabled = false
    const snap = makeFirstTournament()
    // p12 (tier D) never shows: remove him, his pair and his group slots.
    snap.players = snap.players.filter((p) => p.id !== 'p12')
    snap.pairs = snap.pairs.filter((p) => p.player2Id !== 'p12')
    for (const g of snap.groups) g.playerIds = g.playerIds.filter((id) => id !== 'p12')
    for (const r of snap.rounds) {
      fillRound(snap, r.id, r.number * 3)
      r.status = 'finished'
    }
    snap.tournament.status = 'finished'
    answerTiebreaks(snap, s)
    const st = computeTournament(snap, s)
    const check = checkPrizePool(s, fieldShape(snap, s))
    const byModule: Record<string, number> = {}
    for (const p of st.prizes) byModule[p.moduleId] = (byModule[p.moduleId] ?? 0) + p.amount
    out.missingPlayer = { players: snap.players.length, checkLive: { balanced: check.balanced, difference: check.difference }, byModule, bank: bank(st), warnings: st.flags.warnings }
    expect(check.balanced).toBe(false)
  })

  it('settings say 2 days, only Day 1 exists and is finished → tournamentFinal', () => {
    const s = clone(FIRST_TOURNAMENT_SETTINGS) as TournamentSettings
    s.modules.auction.enabled = false
    const snap = makeFirstTournament()
    snap.rounds = snap.rounds.filter((r) => r.id === 'r1')
    snap.groups = snap.groups.filter((g) => g.roundId === 'r1')
    fillRound(snap, 'r1', 4)
    snap.rounds[0]!.status = 'finished'
    snap.tournament.status = 'live'
    answerTiebreaks(snap, s)
    const st = computeTournament(snap, s)
    out.onlyDay1 = { tournamentFinal: st.tournamentFinal, allPrizesFinal: st.prizes.every((p) => p.final), prizeTotal: st.prizes.reduce((a, p) => a + p.amount, 0), bank: bank(st) }
    writeFileSync(OUT, JSON.stringify(out, null, 1))
    expect(st.tournamentFinal).toBe(true)
  })
})
