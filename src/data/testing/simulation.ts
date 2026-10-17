/**
 * The simulator's handicaps (scripts/simulate.mjs, §17), from the engine itself (ARCH-16). The script used to
 * work the playing handicap out in JS (always half up, no course handicap, no tee, no override, its own day 2
 * cut and Stableford), so a rehearsal could be scored on strokes the boards never gave. It loads this module
 * through Vite (`runnerImport`) and asks it, from the rows it read, for the strokes each player receives on
 * each hole of the day it plays: what the boards will score its holes with.
 */
import { computeCore } from '../../engine/core/compute'
import { readSettings } from '../../engine/settings/read'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Snapshot } from '../../engine/types'
import { mapCourse, mapHandicapOverride, mapPlayer, mapRound, mapRoundTee, mapScore, mapTournament, type Row } from '../mappers'

/** What the script reads of the tournament, as the database gives it. */
export interface SimulationRows {
  tournament: Row
  players: Row[]
  rounds: Row[]
  courses: Row[]
  tees: Row[]
  holes: Row[]
  roundTees: Row[]
  /** Every day's scores so far: the cut reads the day before. */
  scores: Row[]
  overrides: Row[]
}

export interface SimulatedHole {
  par: number
  strokeIndex: number
  /** Below zero where a plus handicap gives a stroke back (MONEY-21). */
  strokesReceived: number
}

export interface DayStrokes {
  settings: TournamentSettings
  /** Player → hole number → the hole on his tee, with the strokes he receives there. */
  holes: Map<string, Map<number, SimulatedHole>>
  /** Player → the playing handicap the boards give him that day. */
  playingHcp: Map<string, number>
}

export function dayStrokes(rows: SimulationRows, roundId: string): DayStrokes {
  const read = readSettings(rows.tournament.settings)
  if (!read.ok) throw new Error(`the tournament's settings don't read: ${read.detail.map((d) => (typeof d === 'string' ? d : d.code)).join('; ')}`)
  const empty: Pick<Snapshot, 'groups' | 'pairs' | 'teams' | 'snakeTiebreaks' | 'cardSignatures' | 'calcuttaLots' | 'calcuttaBids' | 'calcuttaBuybacks' | 'payments' | 'gameEntries' | 'holeAwards' | 'gameResults'> = {
    groups: [],
    pairs: [],
    teams: [],
    snakeTiebreaks: [],
    cardSignatures: [],
    calcuttaLots: [],
    calcuttaBids: [],
    calcuttaBuybacks: [],
    payments: [],
    gameEntries: [],
    holeAwards: [],
    gameResults: [],
  }
  const snapshot: Snapshot = {
    ...empty,
    tournament: mapTournament(rows.tournament),
    players: rows.players.map(mapPlayer),
    rounds: rows.rounds.map(mapRound),
    courses: rows.courses.map((c) => mapCourse(c, rows.tees, rows.holes)),
    roundTees: rows.roundTees.map(mapRoundTee),
    scores: rows.scores.map(mapScore),
    handicapOverrides: rows.overrides.map(mapHandicapOverride),
  }
  const core = computeCore(snapshot, read.settings)
  const holes = new Map<string, Map<number, SimulatedHole>>()
  const playingHcp = new Map<string, number>()
  for (const [playerId, pr] of Object.entries(core.rounds[roundId] ?? {})) {
    holes.set(playerId, new Map(pr.holes.map((h) => [h.hole, { par: h.par, strokeIndex: h.strokeIndex, strokesReceived: h.strokesReceived }])))
    playingHcp.set(playerId, pr.playingHcp)
  }
  return { settings: read.settings, holes, playingHcp }
}
