/**
 * The bracket, hand-checked. The pairings and the byes are arithmetic, so
 * they are tested directly; reading real results out of real groups is
 * tested through a played tournament.
 */
import { describe, expect, it } from 'vitest'
import { computeCore } from '../core/compute'
import { DEFAULT_SETTINGS } from '../settings/presets'
import { parseSettings, type TournamentSettings } from '../settings/schema'
import { fillRound, makeGroup, makeSnapshot } from '../testing/fixtures'
import type { Snapshot } from '../types'
import { advance, bracketState, firstRound, roundName, seed } from './bracket'
import type { Entrant, FormatContext } from './format'

const ent = (id: string, name = id): Entrant => ({ id, playerIds: [id], name, isTeam: false })

/** Settings for a match-play tournament of `rounds` days. */
function matchSettings(rounds: number): TournamentSettings {
  return parseSettings({
    ...structuredClone(DEFAULT_SETTINGS),
    rounds,
    modules: {
      ...structuredClone(DEFAULT_SETTINGS.modules),
      individual: { enabled: true, label: 'Match play', format: 'matchPlay', formatOptions: { ...DEFAULT_SETTINGS.modules.individual.formatOptions, matchMode: 'singles' } },
    },
  })
}

function ctxOf(snap: Snapshot, settings: TournamentSettings): FormatContext {
  const core = computeCore(snap, settings)
  const roundFinal: Record<string, boolean> = {}
  for (const r of snap.rounds) roundFinal[r.id] = r.status === 'finished'
  return { snapshot: snap, settings, core, roundFinal, tournamentFinal: snap.rounds.every((r) => r.status === 'finished') }
}

describe('bracket shape', () => {
  it('names each round by how many matches it holds', () => {
    expect(roundName(1)).toBe('Final')
    expect(roundName(2)).toBe('Semifinal')
    expect(roundName(4)).toBe('Cuartos de final')
    expect(roundName(8)).toBe('Octavos de final')
    expect(roundName(16)).toBe('Ronda de 32')
  })

  it('pairs 1 v 8, 2 v 7, 3 v 6, 4 v 5 — so seeds 1 and 2 can only meet in the final', () => {
    const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((x) => ent(x))
    const r1 = firstRound(seeds)
    expect(r1.map(([a, b]) => `${a.id}-${b?.id}`)).toEqual(['s1-s8', 's2-s7', 's3-s6', 's4-s5'])
    // Seeds 1 and 2 are in opposite halves: their winners meet only at the end.
    const semis = advance([seeds[0]!, seeds[1]!, seeds[2]!, seeds[3]!])
    expect(semis.map(([a, b]) => `${a.id}-${b?.id}`)).toEqual(['s1-s2', 's3-s4'])
  })

  it('a field that is not a power of two gives the top seeds the byes', () => {
    // 5 entrants → a bracket of 8: seeds 1, 2 and 3 sit out the first round.
    const seeds = ['s1', 's2', 's3', 's4', 's5'].map((x) => ent(x))
    const r1 = firstRound(seeds)
    expect(r1.map(([a, b]) => `${a.id}-${b?.id ?? 'bye'}`)).toEqual(['s1-bye', 's2-bye', 's3-bye', 's4-s5'])
    // 6 entrants → seeds 1 and 2 sit out.
    const six = firstRound(['s1', 's2', 's3', 's4', 's5', 's6'].map((x) => ent(x)))
    expect(six.map(([a, b]) => `${a.id}-${b?.id ?? 'bye'}`)).toEqual(['s1-bye', 's2-bye', 's3-s6', 's4-s5'])
  })

  it('seeds on handicap, best first, and keeps the roster order on a tie', () => {
    const snap = makeSnapshot({ players: 4, rounds: 1, settings: matchSettings(1) })
    snap.players = snap.players.map((p, i) => ({ ...p, baseHcp: [12, 4, 12, 8][i]! }))
    const ctx = ctxOf(snap, matchSettings(1))
    const entrants = snap.players.map((p) => ent(p.id, p.displayName))
    // 4 → 8 → 12 (p1) → 12 (p3): the two twelves keep the order they came in.
    expect(seed(ctx, entrants).map((e) => e.id)).toEqual(['p2', 'p4', 'p1', 'p3'])
  })

  it('advance carries an odd number of winners through without inventing an opponent', () => {
    const w = ['a', 'b', 'c'].map((x) => ent(x))
    expect(advance(w).map(([a, b]) => `${a.id}-${b?.id ?? 'bye'}`)).toEqual(['a-b', 'c-bye'])
  })
})

describe('bracket over a played tournament', () => {
  const settings = matchSettings(2)

  /** 4 players, 2 rounds; round 1 is the semifinals, drawn as two groups of two. */
  function semisPlayed(): Snapshot {
    const snap = makeSnapshot({ players: 4, rounds: 2, settings })
    snap.players = snap.players.map((p, i) => ({ ...p, baseHcp: [4, 8, 12, 16][i]! }))
    // Seeds: p1 (4), p2 (8), p3 (12), p4 (16) → 1v4 and 2v3.
    snap.groups = [makeGroup('r1', 1, ['p1', 'p4'], 1), makeGroup('r1', 2, ['p2', 'p3'], 1)]
    fillRound(snap, 'r1', 5)
    snap.rounds[0]!.status = 'finished'
    return snap
  }

  it('reads the semifinals from the groups and names the finalists', () => {
    const snap = semisPlayed()
    const st = bracketState(ctxOf(snap, settings))
    expect(st.rounds[0]!.name).toBe('Semifinal')
    expect(st.rounds[0]!.matches.map((m) => `${m.sides[0].name} v ${m.sides[1]?.name}`)).toEqual(['J1 v J4', 'J2 v J3'])
    expect(st.rounds[0]!.matches.every((m) => m.winner)).toBe(true)
    // The final is listed with the two winners, waiting for its groups.
    expect(st.rounds[1]!.name).toBe('Final')
    expect(st.rounds[1]!.matches[0]!.pending).toBe(true)
    expect(st.champion).toBeNull()
  })

  it('stops at the round in play instead of guessing who comes next', () => {
    const snap = makeSnapshot({ players: 4, rounds: 2, settings })
    snap.groups = [makeGroup('r1', 1, ['p1', 'p4'], 1), makeGroup('r1', 2, ['p2', 'p3'], 1)]
    // The groups are drawn but no card has a score, so the matches are all
    // square and nobody has advanced. The bracket shows this round and stops:
    // it does not guess a final.
    const st = bracketState(ctxOf(snap, settings))
    expect(st.rounds).toHaveLength(1)
    expect(st.rounds[0]!.matches.every((m) => m.winner === null)).toBe(true)
    // Drawn, so not "pending a draw": Comité › Grupos has nothing to write here.
    expect(st.rounds[0]!.matches.every((m) => m.pending)).toBe(false)
    expect(st.champion).toBeNull()
  })

  it('warns when the tournament has fewer days than the bracket needs', () => {
    const one = matchSettings(1)
    const snap = makeSnapshot({ players: 4, rounds: 1, settings: one })
    snap.groups = [makeGroup('r1', 1, ['p1', 'p4'], 1), makeGroup('r1', 2, ['p2', 'p3'], 1)]
    fillRound(snap, 'r1', 5)
    snap.rounds[0]!.status = 'finished'
    const st = bracketState(ctxOf(snap, one))
    expect(st.warnings.some((w) => w.includes('2 rondas') && w.includes('tiene 1'))).toBe(true)
  })

  it('matches the groups played that the bracket does not list are named, not shown as «—» (STRAT-03)', () => {
    // One day, 4 players drawn 1v2 and 3v4: the bracket's semifinals are 1v4 and 2v3.
    const one = matchSettings(1)
    const snap = makeSnapshot({ players: 4, rounds: 1, settings: one })
    snap.players = snap.players.map((p, i) => ({ ...p, baseHcp: [4, 8, 12, 16][i]! }))
    snap.groups = [makeGroup('r1', 1, ['p1', 'p2'], 1), makeGroup('r1', 2, ['p3', 'p4'], 1)]
    fillRound(snap, 'r1', 5)
    snap.rounds[0]!.status = 'finished'
    const st = bracketState(ctxOf(snap, one))
    expect(st.rounds[0]!.matches.every((m) => m.pending)).toBe(true)
    expect(st.warnings).toContain('Día 1: 2 partidos de los grupos no son del cuadro (Semifinal). Cuentan en la tabla; el cuadro avanza solo con sus partidos.')
    // Drawn as the bracket says, nothing to add.
    const ok = semisPlayed()
    expect(bracketState(ctxOf(ok, settings)).warnings.filter((w) => w.includes('no son del cuadro') || w.includes('no es del cuadro'))).toEqual([])
  })

  it('a field too small for a bracket says so', () => {
    const snap = makeSnapshot({ players: 1, rounds: 1, settings })
    const st = bracketState(ctxOf(snap, settings))
    expect(st.rounds).toEqual([])
    expect(st.warnings[0]).toMatch(/suficientes/)
  })
})
