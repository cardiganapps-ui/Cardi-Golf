/**
 * ARCH-16: the simulator scores its holes on the engine's own strokes (scripts/simulate.mjs loads
 * simulation.ts through Vite). Fed the rows of a fixture as the database gives them, it answers what the
 * boards compute for every player on every hole of every day: tees, course handicaps, the day 2 cut,
 * overrides and plus handicaps included.
 */
import { describe, expect, it } from 'vitest'
import { computeTournament } from '../../engine/computeTournament'
import { parseSettings } from '../../engine/settings/schema'
import { getFixture } from '../../dev/fixtures'
import { dayStrokes } from './simulation'
import { snapshotToRows } from './rows'

describe('the simulator’s strokes are the engine’s (ARCH-16)', () => {
  it.each(['full12-live', 'full12-finished', 'minimal4-live'])('%s: every hole of every day', (name) => {
    const snap = getFixture(name)!.snapshot
    // A plus handicap and an override, so neither the sign nor the Comité's figure can be dropped on the way.
    snap.players[0] = { ...snap.players[0]!, handicapSource: 'manual', baseHcp: -3 }
    const r1 = snap.rounds[0]!.id
    snap.handicapOverrides.push({ roundId: r1, playerId: snap.players[1]!.id, playingHcp: 7, reason: 'prueba', by: null, at: '2027-04-09T15:00:00Z' })
    const rows = snapshotToRows(snap)
    const state = computeTournament(snap, parseSettings(snap.tournament.settings))
    for (const round of snap.rounds.filter((r) => r.status !== 'cancelled')) {
      const day = dayStrokes(
        { tournament: rows.tournaments[0]!, players: rows.players, rounds: rows.rounds, courses: rows.courses, tees: rows.tees, holes: rows.holes, roundTees: rows.round_tees, scores: rows.scores, overrides: rows.handicap_overrides },
        round.id,
      )
      for (const p of snap.players) {
        const pr = state.core.rounds[round.id]![p.id]!
        expect(day.playingHcp.get(p.id)).toBe(pr.playingHcp)
        expect([...day.holes.get(p.id)!.values()]).toEqual(pr.holes.map((h) => ({ par: h.par, strokeIndex: h.strokeIndex, strokesReceived: h.strokesReceived })))
      }
    }
    expect(state.core.rounds[r1]![snap.players[1]!.id]!.playingHcp).toBe(7)
    expect(state.core.rounds[r1]![snap.players[0].id]!.playingHcp).toBeLessThan(0)
  })

  it('refuses settings this build cannot read rather than simulate on defaults', () => {
    const rows = snapshotToRows(getFixture('minimal4-live')!.snapshot)
    const t = { ...rows.tournaments[0]!, settings: { ...(rows.tournaments[0]!.settings as object), fromTheFuture: 1 } }
    expect(() => dayStrokes({ tournament: t, players: [], rounds: [], courses: [], tees: [], holes: [], roundTees: [], scores: [], overrides: [] }, 'r1')).toThrow(/settings/)
  })
})
