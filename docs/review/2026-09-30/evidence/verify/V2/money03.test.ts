/**
 * V2 independent repro for MONEY-03 (ARCH-02, QA-02): strokes received in a 9-hole round.
 * Oracle: WHS 9-hole allocation = the 9-hole playing handicap spread over the nine holes
 * played, ranked by their 18-hole stroke index (equivalently the converted 9-hole SI).
 */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeCore } from '/home/user/Cardi-Golf/src/engine/core/compute'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { roundHalfUp } from '/home/user/Cardi-Golf/src/engine/core/rounding'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '/home/user/Cardi-Golf/src/engine/settings/presets'
import type { TournamentSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import { makePlayer, makeRound, makeSnapshot, PAR_72, score } from '/home/user/Cardi-Golf/src/engine/testing/fixtures'

const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V2/money03.result.json'
const out: Record<string, unknown> = {}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/** Independent oracle: PH9 strokes over the nine ranked by 18-hole SI. */
function whsNine(ph9: number, sis: number[]): number[] {
  const rank = new Map([...sis].sort((a, b) => a - b).map((si, i) => [si, i + 1]))
  return sis.map((si) => Math.floor(ph9 / 9) + (rank.get(si)! <= ph9 % 9 ? 1 : 0))
}

describe('MONEY-03 V2', () => {
  it('front nine of PAR_72: engine vs WHS allocation, for a range of handicaps', () => {
    const front = PAR_72.slice(0, 9).map(([, si]) => si)
    const rows: unknown[] = []
    for (const [label, settings] of [['platform 100%', DEFAULT_SETTINGS], ['first tournament 80%', FIRST_TOURNAMENT_SETTINGS]] as const) {
      for (const base of [4, 10, 16, 20, 25, 30, 40, 54]) {
        const s = clone(settings) as TournamentSettings
        const snap9 = makeSnapshot({ players: [makePlayer(1, { baseHcp: base })], rounds: [makeRound(1, { holes: 9 })], settings: s })
        const pr9 = computeCore(snap9, s).rounds.r1!.p1!
        const snap18 = makeSnapshot({ players: [makePlayer(1, { baseHcp: base })], rounds: [makeRound(1, { holes: 18 })], settings: s })
        const pr18 = computeCore(snap18, s).rounds.r1!.p1!
        const engine = pr9.holes.reduce((a, h) => a + h.strokesReceived, 0)
        const ph9 = roundHalfUp(pr9.playingHcp / 2)
        const whs = whsNine(ph9, front).reduce((a, b) => a + b, 0)
        const sameNineIn18 = pr18.holes.slice(0, 9).reduce((a, h) => a + h.strokesReceived, 0)
        rows.push({ settings: label, base, ph18: pr9.playingHcp, ph9, engineStrokesOnNine: engine, whsStrokesOnNine: whs, sameNineInsideAn18HoleRound: sameNineIn18, perHoleEngine: pr9.holes.map((h) => h.strokesReceived).join(','), perHoleWhs: whsNine(ph9, front).join(',') })
      }
    }
    out.frontNine = { sis: front.join(','), rows }
    const r = rows as Array<{ base: number; settings: string; engineStrokesOnNine: number; whsStrokesOnNine: number }>
    const p16 = r.find((x) => x.settings === 'first tournament 80%' && x.base === 20)!
    expect(p16.whsStrokesOnNine).toBe(8)
    expect(p16.engineStrokesOnNine).toBe(4)
  })

  it('money: 9-hole Stableford event, scratch at par vs a 16 shooting net par (WHS) → should tie; engine pays the scratch everything', () => {
    const s = clone(DEFAULT_SETTINGS) as TournamentSettings
    s.entryFee = 500
    s.prizes.stableford = [1000]
    const players = [makePlayer(1, { baseHcp: 0, displayName: 'Scratch' }), makePlayer(2, { baseHcp: 16, displayName: 'Dieciséis' })]
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { holes: 9, status: 'finished' })], settings: s, status: 'finished' })
    const front = PAR_72.slice(0, 9)
    const whs = whsNine(8, front.map(([, si]) => si))
    front.forEach(([par], i) => {
      snap.scores.push(score('r1', 'p1', i + 1, par, 2))
      snap.scores.push(score('r1', 'p2', i + 1, par + whs[i]!, 2))
    })
    const st = computeTournament(snap, s)
    const rows = st.modules.individual!.rows.map((r) => ({ player: r.playerId, label: r.label, total: r.total }))
    const prizes = st.prizes.map((p) => ({ player: p.playerId, amount: p.amount, final: p.final }))
    out.money = { rows, prizes, pointsP2: st.core.rounds.r1!.p2!.points, pointsP1: st.core.rounds.r1!.p1!.points }
    expect(st.core.rounds.r1!.p1!.points).toBe(18)
    expect(st.core.rounds.r1!.p2!.points).toBe(14)
    writeFileSync(OUT, JSON.stringify(out, null, 1))
  })
})
