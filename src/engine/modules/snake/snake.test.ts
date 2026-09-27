import { describe, expect, it } from 'vitest'
import { computeTournament } from '../../computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from '../../settings/presets'
import { makeGroup, makePlayer, makeSnapshot, score } from '../../testing/fixtures'
import type { Snapshot } from '../../types'

const S = FIRST_TOURNAMENT_SETTINGS

/** 4 players, 1 round, one group; every hole entered with `putts` per player per hole. */
function groupRound(startHole = 1, puttsFor: (pid: string, hole: number) => number = () => 2): Snapshot {
  const players = ['A', 'B', 'C', 'D'].map((n, i) => makePlayer(i + 1, { id: n, displayName: n }))
  const snap = makeSnapshot({ players, rounds: 1, settings: S, groups: [makeGroup('r1', 1, ['A', 'B', 'C', 'D'], startHole)] })
  for (const p of players) {
    for (let h = 1; h <= 18; h++) {
      snap.scores.push(score('r1', p.id, h, 5, puttsFor(p.id, h)))
    }
  }
  return snap
}

describe('La Víbora', () => {
  it('B on 3, C and D on 7 (D holed last), A on 15 → A holds; B, C, D get $200, A $0', () => {
    const snap = groupRound(1, (pid, h) => {
      if (pid === 'B' && h === 3) return 3
      if ((pid === 'C' || pid === 'D') && h === 7) return 3
      if (pid === 'A' && h === 15) return 4
      return 2
    })
    snap.snakeTiebreaks.push({ roundId: 'r1', groupId: 'r1g1', hole: 7, lastHoledPlayerId: 'D' })
    const state = computeTournament(snap, S)
    const g = state.modules.snake!.groups[0]!
    expect(g.passes.map((p) => `${p.hole}:${p.holderId}`)).toEqual(['3:B', '7:D', '15:A'])
    expect(g.holderId).toBe('A')
    expect(g.finished).toBe(true)
    const amounts = Object.fromEntries(Object.entries(g.payouts).map(([k, v]) => [k, v.amount]))
    expect(amounts).toEqual({ A: 0, B: 200, C: 200, D: 200 })
    expect(state.prizes.filter((p) => p.moduleId === 'snake').reduce((s, p) => s + p.amount, 0)).toBe(600)
  })

  it('nobody takes 3 putts all round → $150 each', () => {
    const state = computeTournament(groupRound(), S)
    const g = state.modules.snake!.groups[0]!
    expect(g.holderId).toBeNull()
    expect(Object.values(g.payouts).map((p) => p.amount)).toEqual([150, 150, 150, 150])
  })

  it('starting hole 10: a 3-putt on hole 2 comes after one on hole 18', () => {
    const snap = groupRound(10, (pid, h) => {
      if (pid === 'B' && h === 18) return 3
      if (pid === 'C' && h === 2) return 3
      return 2
    })
    const g = computeTournament(snap, S).modules.snake!.groups[0]!
    expect(g.passes.map((p) => `${p.hole}:${p.holderId}`)).toEqual(['18:B', '2:C'])
    expect(g.holderId).toBe('C')
  })

  it('two 3-putts on the same hole with no answer → pending, no payout', () => {
    const snap = groupRound(1, (pid, h) => ((pid === 'C' || pid === 'D') && h === 7 ? 3 : 2))
    const state = computeTournament(snap, S)
    const g = state.modules.snake!.groups[0]!
    expect(g.pendingHole).toBe(7)
    expect(g.holderId).toBeNull()
    expect(g.payouts).toEqual({})
    expect(state.flags.pendingSnakeTiebreaks).toEqual([{ roundId: 'r1', groupId: 'r1g1', hole: 7, candidates: ['C', 'D'] }])
    expect(state.prizes.filter((p) => p.moduleId === 'snake')).toHaveLength(0)
  })

  it('a pick-up passes the snake only when 3+ putts were actually entered (§18.1)', () => {
    const snap = groupRound()
    // B picks up on hole 4 with no putts; C picks up on hole 9 having entered 3 putts.
    const b4 = snap.scores.find((s) => s.playerId === 'B' && s.hole === 4)!
    b4.pickedUp = true
    b4.strokes = null
    b4.putts = null
    const c9 = snap.scores.find((s) => s.playerId === 'C' && s.hole === 9)!
    c9.pickedUp = true
    c9.strokes = null
    c9.putts = 3
    const g = computeTournament(snap, S).modules.snake!.groups[0]!
    expect(g.passes.map((p) => `${p.hole}:${p.holderId}`)).toEqual(['9:C'])
  })

  it('no payout while the group is still on the course', () => {
    const snap = groupRound()
    snap.scores = snap.scores.filter((s) => s.hole <= 17)
    const g = computeTournament(snap, S).modules.snake!.groups[0]!
    expect(g.finished).toBe(false)
    expect(g.payouts).toEqual({})
  })

  it('counts holes held for the awards', () => {
    const snap = groupRound(1, (pid, h) => (pid === 'B' && h === 3 ? 3 : 2))
    const st = computeTournament(snap, S).modules.snake!
    expect(st.holesHeld.B).toBe(15) // holes 4..18
  })
})
