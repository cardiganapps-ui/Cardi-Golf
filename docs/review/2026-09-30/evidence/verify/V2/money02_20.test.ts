/**
 * V2 independent repros for MONEY-02 (stroke formats rank raw strokes over holes played)
 * and MONEY-20 (team format + Calcutta: winning team takes places 1 and 2).
 */
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { DEFAULT_SETTINGS } from '/home/user/Cardi-Golf/src/engine/settings/presets'
import { GAME_ENTRIES } from '/home/user/Cardi-Golf/src/engine/games/catalog'
import type { TournamentSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import { TournamentSettingsSchema } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import type { Snapshot } from '/home/user/Cardi-Golf/src/engine/types'
import { makePlayer, makeRound, makeSnapshot, PAR_72, score } from '/home/user/Cardi-Golf/src/engine/testing/fixtures'

const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V2/money02_20.result.json'
const out: Record<string, unknown> = {}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const pars = PAR_72.map(([p]) => p)

/** Enter holes 1..n for a player with par + delta(hole). */
function play(snap: Snapshot, rid: string, pid: string, n: number, delta: (hole: number) => number) {
  for (let h = 1; h <= n; h++) snap.scores.push(score(rid, pid, h, pars[h - 1]! + delta(h), 2))
}
const rowsOf = (st: ReturnType<typeof computeTournament>) =>
  st.modules.individual!.rows.map((r) => ({ id: r.playerId, label: r.label, value: r.total, text: r.figure.text, thru: r.thru }))
const prizesOf = (st: ReturnType<typeof computeTournament>) => st.prizes.map((p) => ({ module: p.moduleId, label: p.label, player: p.playerId, amount: p.amount, final: p.final }))

function strokeSettings(): TournamentSettings {
  const s = clone(DEFAULT_SETTINGS) as TournamentSettings
  s.modules.individual.format = 'strokePlay'
  s.modules.individual.formatOptions.scoring = 'net'
  s.entryFee = 500
  s.prizes.stableford = [1000]
  s.prizes.stablefordMode = 'amount'
  return s
}

describe('MONEY-02 V2', () => {
  it('final: complete card at E (72) vs a walk-off after 9 at +9 (45)', () => {
    const s = strokeSettings()
    expect(TournamentSettingsSchema.safeParse(s).success).toBe(true)
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 0, displayName: 'Completo' }), makePlayer(2, { baseHcp: 0, displayName: 'SeFue' })], rounds: [makeRound(1, { status: 'finished' })], settings: s, status: 'finished' })
    play(snap, 'r1', 'p1', 18, () => 0)
    play(snap, 'r1', 'p2', 9, () => 1)
    const st = computeTournament(snap, s)
    out.strokeFinal = { tournamentFinal: st.tournamentFinal, rows: rowsOf(st), prizes: prizesOf(st), warnings: st.flags.warnings }
    expect(st.modules.individual!.rows[0]!.playerId).toBe('p2')
  })

  it('final via round status only (tournament still live, round finished) — same', () => {
    const s = strokeSettings()
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 0 }), makePlayer(2, { baseHcp: 0 })], rounds: [makeRound(1, { status: 'finished' })], settings: s, status: 'live' })
    play(snap, 'r1', 'p1', 18, () => 0)
    play(snap, 'r1', 'p2', 9, () => 1)
    const st = computeTournament(snap, s)
    out.strokeRoundFinishedOnly = { tournamentFinal: st.tournamentFinal, rows: rowsOf(st), prizes: prizesOf(st) }
  })

  it('live: −12 thru 12 vs +8 thru 4', () => {
    const s = strokeSettings()
    const snap = makeSnapshot({ players: [makePlayer(1, { baseHcp: 0 }), makePlayer(2, { baseHcp: 0 })], rounds: [makeRound(1, { status: 'live' })], settings: s, status: 'live' })
    play(snap, 'r1', 'p1', 12, () => -1)
    play(snap, 'r1', 'p2', 4, () => 2)
    const st = computeTournament(snap, s)
    out.strokeLive = { rows: rowsOf(st), prizes: prizesOf(st), moneyLive: Object.fromEntries(Object.entries(st.money.people).map(([k, v]) => [k, (v as { net?: number }).net])) }
    expect(st.modules.individual!.rows[0]!.playerId).toBe('p2')
  })

  it('team best ball on strokes: complete team −10 vs team with only the front nine at +9', () => {
    const s = strokeSettings()
    s.modules.individual.format = 'team'
    s.modules.individual.formatOptions.teamMode = 'bestBall'
    s.modules.individual.formatOptions.teamScoring = 'strokes'
    s.prizes.stableford = [2000]
    const players = [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings: s, status: 'finished' })
    snap.teams = [
      { id: 'tA', name: 'A', number: 1, playerIds: ['p1', 'p2'], drawnAt: null },
      { id: 'tB', name: 'B', number: 2, playerIds: ['p3', 'p4'], drawnAt: null },
    ]
    play(snap, 'r1', 'p1', 18, (h) => (h <= 10 ? -1 : 0))
    play(snap, 'r1', 'p2', 18, () => 0)
    play(snap, 'r1', 'p3', 9, () => 1)
    play(snap, 'r1', 'p4', 9, () => 2)
    const st = computeTournament(snap, s)
    out.team = { rows: rowsOf(st), prizes: prizesOf(st) }
    expect(st.modules.individual!.rows[0]!.playerId).toBe('tB')
  })

  it('Low neto side pot at the end: a 1-hole birdie beats two complete cards', () => {
    const s = clone(DEFAULT_SETTINGS) as TournamentSettings
    const g = GAME_ENTRIES.find((e) => e.key === 'lowNet')!.create('lownet')
    s.games = [g]
    const players = [1, 2, 3].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings: s, status: 'finished' })
    play(snap, 'r1', 'p1', 18, (h) => (h === 5 ? 1 : 0)) // +1
    play(snap, 'r1', 'p2', 18, (h) => (h <= 2 ? 1 : 0)) // +2
    play(snap, 'r1', 'p3', 1, () => -1) // −1 thru 1
    const st = computeTournament(snap, s)
    const game = st.games['lownet']!
    out.lowNet = { config: { options: g.options, money: g.money }, pot: game.pot, final: game.final, board: game.board, prizes: prizesOf(st).filter((p) => p.module !== 'individual'), warnings: st.flags.warnings }
    writeFileSync(OUT, JSON.stringify(out, null, 1))
  })
})

describe('MONEY-20 V2', () => {
  it('team best ball + Calcutta (default 70/25/5): three teams of two', () => {
    const s = clone(DEFAULT_SETTINGS) as TournamentSettings
    s.modules.individual.format = 'team'
    s.modules.individual.formatOptions.teamMode = 'bestBall'
    s.modules.individual.formatOptions.teamScoring = 'strokes'
    s.modules.auction.enabled = true
    expect(TournamentSettingsSchema.safeParse(s).success).toBe(true)
    const players = [1, 2, 3, 4, 5, 6].map((i) => makePlayer(i, { baseHcp: 0 }))
    const snap = makeSnapshot({ players, rounds: [makeRound(1, { status: 'finished' })], settings: s, status: 'finished' })
    snap.teams = [
      { id: 'T1', name: 'Uno', number: 1, playerIds: ['p1', 'p2'], drawnAt: null },
      { id: 'T2', name: 'Dos', number: 2, playerIds: ['p3', 'p4'], drawnAt: null },
      { id: 'T3', name: 'Tres', number: 3, playerIds: ['p5', 'p6'], drawnAt: null },
    ]
    play(snap, 'r1', 'p1', 18, () => -1)
    play(snap, 'r1', 'p2', 18, () => 0)
    play(snap, 'r1', 'p3', 18, () => 0)
    play(snap, 'r1', 'p4', 18, () => 1)
    play(snap, 'r1', 'p5', 18, () => 1)
    play(snap, 'r1', 'p6', 18, () => 1)
    // Every player sold for $1,000 to the next player (owner p(i+1)).
    snap.calcuttaLots = players.map((p, i) => ({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold' as const, price: 1000, ownerId: players[(i + 1) % 6]!.id, soldAt: '' }))
    const st = computeTournament(snap, s)
    const a = st.modules.auction!
    out.money20 = {
      teamRows: rowsOf(st),
      pot: a.pot,
      slots: a.slots.map((x) => ({ label: x.label, share: x.share, players: x.playerIds, amount: x.amount, unfilled: x.unfilled, why: x.why.steps })),
      payouts: Object.values(a.payouts).map((p) => ({ owner: p.ownerId, amount: p.amount, lines: p.lines.map((l) => `${l.playerId}:${l.slotLabel}:${l.amount}`) })),
    }
    writeFileSync(OUT, JSON.stringify(out, null, 1))
    const t2 = a.slots.find((x) => x.playerIds.includes('p3'))
    expect(t2).toBeUndefined()
  })
})
