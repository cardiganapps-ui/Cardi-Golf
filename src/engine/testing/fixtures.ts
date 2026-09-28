/**
 * Builders for engine tests and the simulator. Nothing here touches I/O.
 */
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '../settings/presets'
import type { TournamentSettings } from '../settings/schema'
import type { Course, Group, Hole, Player, Round, Score, Snapshot, Tee } from '../types'

/** A par-72 card: pars sum to 72, stroke indexes are a permutation of 1..18. */
export const PAR_72: Array<[par: number, si: number]> = [
  [4, 7],
  [4, 11],
  [3, 17],
  [5, 3],
  [4, 1],
  [4, 13],
  [3, 15],
  [4, 9],
  [5, 5],
  [4, 8],
  [3, 18],
  [4, 2],
  [5, 12],
  [4, 4],
  [4, 10],
  [3, 16],
  [4, 6],
  [5, 14],
]

export function makeHoles(card: Array<[number, number]> = PAR_72): Hole[] {
  return card.map(([par, si], i) => ({ number: i + 1, par, strokeIndex: si, yards: null }))
}

export function makeTee(id: string, courseId: string, opts: Partial<Tee> = {}): Tee {
  return {
    id,
    courseId,
    name: 'Azules',
    color: 'blue',
    rating: null,
    slope: null,
    holes: makeHoles(),
    ...opts,
  }
}

export function makeCourse(id = 'course1', tees?: Tee[]): Course {
  return { id, name: 'Campo de prueba', tees: tees ?? [makeTee('tee1', id)] }
}

export function makePlayer(i: number, opts: Partial<Player> = {}): Player {
  return {
    id: `p${i}`,
    fullName: `Jugador ${i}`,
    displayName: `J${i}`,
    tier: null,
    baseHcp: 18,
    handicapSource: 'manual',
    handicapIndex: null,
    estimateInputs: null,
    defaultTeeId: 'tee1',
    isHonoree: false,
    isAdmin: false,
    avatarUrl: null,
    formGuide: null,
    sortOrder: i,
    ...opts,
  }
}

export function makeRound(n: number, opts: Partial<Round> = {}): Round {
  return { id: `r${n}`, number: n, date: null, courseId: 'course1', holes: 18, status: 'live', ...opts }
}

export function makeGroup(roundId: string, n: number, playerIds: string[], startHole = 1): Group {
  return { id: `${roundId}g${n}`, roundId, number: n, teeTime: null, startHole, playerIds }
}

export function score(
  roundId: string,
  playerId: string,
  hole: number,
  strokes: number | null,
  putts: number | null = 2,
  pickedUp = false,
): Score {
  return { roundId, playerId, hole, strokes, putts, pickedUp, enteredBy: null, updatedAt: null }
}

export interface TournamentOpts {
  players?: number | Player[]
  rounds?: number | Round[]
  settings?: TournamentSettings
  courses?: Course[]
  groups?: Group[]
  status?: Snapshot['tournament']['status']
}

/** Bare tournament: N players, N rounds, one course, no scores. */
export function makeSnapshot(opts: TournamentOpts = {}): Snapshot {
  const settings = opts.settings ?? DEFAULT_SETTINGS
  const players =
    typeof opts.players === 'number' || opts.players === undefined
      ? Array.from({ length: opts.players ?? 8 }, (_, i) => makePlayer(i + 1))
      : opts.players
  const rounds =
    typeof opts.rounds === 'number' || opts.rounds === undefined
      ? Array.from({ length: opts.rounds ?? settings.rounds }, (_, i) => makeRound(i + 1))
      : opts.rounds
  return {
    tournament: {
      id: 't1',
      slug: 'ensayo',
      name: 'Ensayo',
      tagline: null,
      logoUrl: null,
      accentColor: null,
      joinCode: 'ABC123',
      status: opts.status ?? 'live',
      currentRoundId: rounds[0]?.id ?? null,
      bankerPlayerId: players[0]?.id ?? null,
      settings,
      timezone: 'America/Mazatlan',
      currency: 'MXN',
    },
    players,
    courses: opts.courses ?? [makeCourse()],
    rounds,
    groups: opts.groups ?? [],
    roundTees: [],
    pairs: [],
    scores: [],
    snakeTiebreaks: [],
    cardSignatures: [],
    handicapOverrides: [],
    calcuttaLots: [],
    calcuttaBids: [],
    calcuttaBuybacks: [],
    payments: [],
    gameEntries: [],
    holeAwards: [],
    gameResults: [],
  }
}

/**
 * The first tournament's shape: 12 players in tiers A–D (3 each), 2 rounds,
 * 3 groups per round of one A+D pair and one B+C pair, all modules on.
 * Pairs: (p1,p10) (p2,p11) (p3,p12) are A+D; (p4,p7) (p5,p8) (p6,p9) are B+C.
 */
export function makeFirstTournament(): Snapshot {
  const tiers = ['A', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'C', 'D', 'D', 'D']
  const hcps = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 33]
  const players = tiers.map((tier, i) =>
    makePlayer(i + 1, { tier, baseHcp: hcps[i]!, isHonoree: i === 3 }),
  )
  const snap = makeSnapshot({ players, rounds: 2, settings: FIRST_TOURNAMENT_SETTINGS })
  snap.pairs = [
    { id: 'pair1', name: 'Los Uno', player1Id: 'p1', player2Id: 'p10', kind: 'AD', pickedByHonoree: false, drawnAt: null },
    { id: 'pair2', name: 'Los Dos', player1Id: 'p2', player2Id: 'p11', kind: 'AD', pickedByHonoree: false, drawnAt: null },
    { id: 'pair3', name: 'Los Tres', player1Id: 'p3', player2Id: 'p12', kind: 'AD', pickedByHonoree: false, drawnAt: null },
    { id: 'pair4', name: 'Los Cuatro', player1Id: 'p4', player2Id: 'p7', kind: 'BC', pickedByHonoree: true, drawnAt: null },
    { id: 'pair5', name: 'Los Cinco', player1Id: 'p5', player2Id: 'p8', kind: 'BC', pickedByHonoree: false, drawnAt: null },
    { id: 'pair6', name: 'Los Seis', player1Id: 'p6', player2Id: 'p9', kind: 'BC', pickedByHonoree: false, drawnAt: null },
  ]
  for (const r of ['r1', 'r2']) {
    snap.groups.push(
      makeGroup(r, 1, ['p1', 'p10', 'p4', 'p7']),
      makeGroup(r, 2, ['p2', 'p11', 'p5', 'p8']),
      makeGroup(r, 3, ['p3', 'p12', 'p6', 'p9']),
    )
  }
  return snap
}

/**
 * Deterministic pseudo-random scores for a whole round: gross = par + strokes
 * received + noise, so most holes land near net par. Putts 1–3.
 */
export function fillRound(snap: Snapshot, roundId: string, seed = 1, opts: { playerIds?: string[] } = {}) {
  let s = seed
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
  const round = snap.rounds.find((r) => r.id === roundId)!
  const course = snap.courses.find((c) => c.id === round.courseId) ?? snap.courses[0]!
  const holes = course.tees[0]!.holes
  const ids = opts.playerIds ?? snap.players.map((p) => p.id)
  for (const pid of ids) {
    const p = snap.players.find((x) => x.id === pid)!
    for (const h of holes.slice(0, round.holes)) {
      const sr = Math.floor(p.baseHcp / 18) + (h.strokeIndex <= p.baseHcp % 18 ? 1 : 0)
      const noise = Math.floor(rnd() * 5) - 2 // -2..+2
      const strokes = Math.max(1, h.par + sr + noise)
      const putts = rnd() < 0.12 ? 3 : rnd() < 0.3 ? 1 : 2
      snap.scores.push(score(roundId, pid, h.number, strokes, Math.min(putts, strokes)))
    }
  }
}
