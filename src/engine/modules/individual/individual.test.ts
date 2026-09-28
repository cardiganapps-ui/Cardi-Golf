import { describe, expect, it } from 'vitest'
import { computeTournament } from '../../computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from '../../settings/presets'
import { makeFirstTournament, makePlayer, makeSnapshot, score } from '../../testing/fixtures'
import type { Snapshot } from '../../types'

const S = FIRST_TOURNAMENT_SETTINGS

/** Enter a full round where a player scores `pts[h-1]` points on hole h. */
function enterPoints(snap: Snapshot, rid: string, pid: string, pts: number[]) {
  const holes = snap.courses[0]!.tees[0]!.holes
  const p = snap.players.find((x) => x.id === pid)!
  const ph = Math.floor(0.8 * p.baseHcp + 0.5)
  for (let h = 1; h <= 18; h++) {
    const hole = holes[h - 1]!
    const sr = Math.floor(ph / 18) + (hole.strokeIndex <= ph % 18 ? 1 : 0)
    const gross = hole.par + sr + 2 - pts[h - 1]!
    snap.scores.push(score(rid, pid, h, Math.max(1, gross)))
  }
}

const flat = (n: number) => Array(18).fill(n) as number[]

describe('Individual standings', () => {
  it('A and B both 70; Day 2 A 36, B 34 → A ahead', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { id: 'A', displayName: 'A' }), makePlayer(2, { id: 'B', displayName: 'B' })], rounds: 2, settings: S })
    enterPoints(snap, 'r1', 'A', [...flat(2).slice(0, 16), 1, 1]) // 34
    enterPoints(snap, 'r2', 'A', flat(2)) // 36
    enterPoints(snap, 'r1', 'B', flat(2)) // 36
    enterPoints(snap, 'r2', 'B', [...flat(2).slice(0, 16), 1, 1]) // 34
    const rows = computeTournament(snap, S).modules.individual!.rows
    expect(rows.map((r) => `${r.playerId}:${r.label}:${r.total}`)).toEqual(['A:1:70', 'B:2:70'])
    expect(rows[1]!.countbackWhy?.steps[0]).toContain('Día 2, Total: A 36 – B 34')
  })

  it('equal Day 2; holes 10–18 A 18, B 17 → A ahead', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { id: 'A' }), makePlayer(2, { id: 'B' })], rounds: 2, settings: S })
    enterPoints(snap, 'r1', 'A', flat(2))
    enterPoints(snap, 'r2', 'A', flat(2)) // back nine 18
    enterPoints(snap, 'r1', 'B', flat(2))
    const b2 = flat(2)
    b2[0] = 3
    b2[17] = 1 // total 36, back nine 17
    enterPoints(snap, 'r2', 'B', b2)
    const rows = computeTournament(snap, S).modules.individual!.rows
    expect(rows.map((r) => `${r.playerId}:${r.label}`)).toEqual(['A:1', 'B:2'])
  })

  it('equal all the way through hole 18 → tied; each gets ($10,000 + $5,000) / 2 = $7,500', () => {
    const snap = makeSnapshot({ players: [makePlayer(1, { id: 'A' }), makePlayer(2, { id: 'B' }), makePlayer(3, { id: 'C' })], rounds: 2, settings: S })
    for (const pid of ['A', 'B']) {
      enterPoints(snap, 'r1', pid, flat(2))
      enterPoints(snap, 'r2', pid, flat(2))
    }
    enterPoints(snap, 'r1', 'C', flat(1))
    enterPoints(snap, 'r2', 'C', flat(1))
    const st = computeTournament(snap, S)
    const ind = st.modules.individual!
    expect(ind.rows.map((r) => `${r.playerId}:${r.label}`)).toEqual(['A:T1', 'B:T1', 'C:3'])
    expect(ind.prizes.A!.amount).toBe(7500)
    expect(ind.prizes.B!.amount).toBe(7500)
    expect(ind.prizes.C!.amount).toBe(3000)
    expect(ind.lastPlace).toEqual(['C'])
    expect(ind.rows[1]!.countbackWhy?.steps.at(-1)).toContain('se reparten')
  })

  it('prizes are provisional until every round is finished', () => {
    const snap = makeFirstTournament()
    enterPoints(snap, 'r1', 'p1', flat(2))
    let st = computeTournament(snap, S)
    expect(st.prizes.find((p) => p.moduleId === 'individual' && p.playerId === 'p1')?.final).toBe(false)
    snap.rounds.forEach((r) => (r.status = 'finished'))
    st = computeTournament(snap, S)
    expect(st.prizes.find((p) => p.moduleId === 'individual' && p.playerId === 'p1')?.final).toBe(true)
  })
})
