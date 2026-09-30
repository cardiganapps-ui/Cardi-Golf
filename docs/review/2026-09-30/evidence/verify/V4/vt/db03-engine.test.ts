// DB-03, engine side: the rows my harness run produced before and after the Comité removed group 2.
import { describe, expect, it } from 'vitest'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { DEFAULT_SETTINGS } from '/home/user/Cardi-Golf/src/engine/settings/presets'
import type { GameConfig, GameMoney } from '/home/user/Cardi-Golf/src/engine/settings/games'
import type { TournamentSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import { makePlayer, makeRound, makeSnapshot, PAR_72, score } from '/home/user/Cardi-Golf/src/engine/testing/fixtures'
import type { HoleAward, Snapshot } from '/home/user/Cardi-Golf/src/engine/types'
import type { ContestState } from '/home/user/Cardi-Golf/src/engine/games/contest'

const PARS = PAR_72.map(([p]) => p)
const money = (over: Partial<GameMoney>): GameMoney => ({ source: 'none', buyIn: 0, amount: 0, stake: 0, split: [100], ...over })
// Same game as the harness drill: closest to the pin on holes 3 and 7, $100 direct per hole won.
const cerca: GameConfig = { id: 'cerca', type: 'contest', label: 'Más cerca', enabled: true, rounds: 'all', entrants: 'all', options: { kind: 'closest', holes: [3, 7] }, money: money({ source: 'direct', stake: 100 }) }
function setup(): Snapshot {
  const settings: TournamentSettings = { ...DEFAULT_SETTINGS, games: [cerca] }
  const snap = makeSnapshot({ settings, players: [1, 2, 3, 4].map((i) => makePlayer(i, { baseHcp: 0 })), rounds: [makeRound(1)] })
  for (let i = 1; i <= 4; i++) for (let h = 1; h <= 18; h++) snap.scores.push(score('r1', `p${i}`, h, PARS[h - 1]!))
  return snap
}
// p1 = Ana, p2 = Beto (grupo 1); p3 = Ceci, p4 = Dario (grupo 2)
const aw = (hole: number, playerId: string, groupId: string | null): HoleAward => ({ roundId: 'r1', groupId, hole, gameId: 'cerca', playerId })
const run = (awards: HoleAward[]) => {
  const snap = setup()
  snap.holeAwards = awards
  const st = computeTournament(snap, snap.tournament.settings as TournamentSettings)
  const s = st.games.cerca!.state as ContestState
  const bets = st.money.flows.filter((f) => f.kind === 'bet').map((f) => `${f.from}>${f.to}:${f.amount}`).sort()
  return { holes: s.holes.map((h) => `h${h.hole}:${h.status}:${h.winners.join('+')}`), bets }
}

describe('DB-03: deleting group 2 (ON DELETE SET NULL) in the engine', () => {
  it('before: h3 disputed (Ana g1 vs Ceci g2), h7 Beto', () => {
    const r = run([aw(3, 'p1', 'g1'), aw(3, 'p3', 'g2'), aw(7, 'p2', 'g1')])
    console.log('BEFORE', JSON.stringify(r))
    expect(r.holes).toEqual(['h3:disputed:p1+p3', 'h7:won:p2']); expect(r.bets).toEqual(['p1>p2:100', 'p3>p2:100', 'p4>p2:100'])
  })
  it('after group 2 is deleted: Ceci\'s claim has groupId null and is read as the Comité\'s ruling', () => {
    const r = run([aw(3, 'p1', 'g1'), aw(3, 'p3', null), aw(7, 'p2', 'g1')])
    console.log('AFTER', JSON.stringify(r))
    expect(r.holes).toEqual(['h3:won:p3', 'h7:won:p2']); expect(r.bets).toEqual(['p1>p2:100', 'p1>p3:100', 'p4>p2:100', 'p4>p3:100'])
  })
  it('after a 0020 restore (every claim group-less): h3 Ana+Ceci as a 2-winner "Comité ruling", h7 the post-backup claim', () => {
    const r = run([aw(3, 'p1', null), aw(3, 'p3', null), aw(7, 'p1', null)])
    console.log('AFTER_RESTORE', JSON.stringify(r))
  })
})
