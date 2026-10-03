/**
 * The raw facts of ONE tournament (CLAUDE.md §4 "store raw facts, derive
 * everything"). Mirrors the tables in §7 in camelCase. The engine never sees
 * anything from another tournament.
 */

export type Id = string

export type TournamentStatus = 'setup' | 'auction' | 'live' | 'finished'
export type RoundStatus = 'scheduled' | 'live' | 'finished' | 'cancelled'
export type LotStatus = 'pending' | 'open' | 'sold'
/**
 * `side`: a player's buy-in to a side pot; `bet`: a direct payment between
 * players (match stakes, per-event bets).
 */
export type PaymentKind = 'entry' | 'calcutta' | 'buyback' | 'payout' | 'side' | 'bet' | 'other'

export interface TournamentRow {
  id: Id
  slug: string
  name: string
  tagline: string | null
  logoUrl: string | null
  accentColor: string | null
  joinCode: string
  status: TournamentStatus
  currentRoundId: Id | null
  bankerPlayerId: Id | null
  /** Raw JSON; parse with `parseSettings`. */
  settings: unknown
  timezone: string
  currency: string
  /** False for practice (the Ensayo): shown in profiles, never in the Polo index. Default true. */
  countsForStats?: boolean
  /** A Ronda rápida (0017): the app offers "Terminar y publicar". */
  quick?: boolean
  /** The crew it belongs to (0018), if any. */
  crewId?: string | null
}

export interface Player {
  id: Id
  fullName: string
  displayName: string
  /** One of `settings.tiers`, or null when the tournament has no tiers. */
  tier: string | null
  /** The value the engine starts from: a WHS index, an estimate, or a number typed by the Comité. */
  baseHcp: number
  handicapSource: 'index' | 'estimate' | 'manual'
  handicapIndex: number | null
  /** Three gross scores (good, normal, bad day) with where they were shot (§13b-E). */
  estimateInputs: [EstimateInput, EstimateInput, EstimateInput] | null
  defaultTeeId: Id | null
  isHonoree: boolean
  isAdmin: boolean
  avatarUrl: string | null
  formGuide: string | null
  sortOrder: number
}

export interface EstimateInput {
  gross: number
  rating: number | null
  slope: number | null
  par: number | null
}

export interface Hole {
  number: number
  par: number
  strokeIndex: number
  yards: number | null
}

export interface Tee {
  id: Id
  courseId: Id
  name: string
  color: string | null
  rating: number | null
  slope: number | null
  holes: Hole[]
}

export interface Course {
  id: Id
  name: string
  tees: Tee[]
}

export interface Round {
  id: Id
  number: number
  date: string | null
  courseId: Id | null
  holes: 9 | 18
  status: RoundStatus
}

export interface Group {
  id: Id
  roundId: Id
  number: number
  teeTime: string | null
  startHole: number
  playerIds: Id[]
}

/** Which tee a player plays in a round (§13b-D). */
export interface RoundTee {
  roundId: Id
  playerId: Id
  teeId: Id
}

export interface Pair {
  id: Id
  name: string | null
  player1Id: Id
  player2Id: Id
  /** Label of the pairing rule, e.g. "AD" or "BC". */
  kind: string | null
  pickedByHonoree: boolean
  drawnAt: string | null
}

export interface Score {
  /** The row's id where it came from the server (a fetch or a live change): a deleted score names only this. */
  id?: Id
  roundId: Id
  playerId: Id
  hole: number
  strokes: number | null
  putts: number | null
  pickedUp: boolean
  enteredBy: Id | null
  updatedAt: string | null
  /** Another device overwrote this hole with different values (§8). */
  disputed?: boolean
  previous?: { strokes: number | null; putts: number | null; picked_up: boolean; entered_by: Id | null } | null
}

export interface SnakeTiebreak {
  roundId: Id
  groupId: Id
  hole: number
  lastHoledPlayerId: Id
}

export interface CardSignature {
  roundId: Id
  pairId: Id
  signedBy: Id
  signedAt: string
}

export interface HandicapOverride {
  roundId: Id
  playerId: Id
  playingHcp: number
  reason: string
  by: Id | null
  at: string
}

export interface CalcuttaLot {
  id: Id
  playerId: Id
  lotNumber: number
  status: LotStatus
  price: number | null
  ownerId: Id | null
  soldAt: string | null
}

export interface CalcuttaBid {
  id: Id
  lotId: Id
  bidderId: Id
  amount: number
  createdAt: string
}

export interface CalcuttaBuyback {
  lotId: Id
  pct: number
  amount: number
  paid: boolean
}

export interface Payment {
  id: Id
  /** null = the banker. */
  fromPlayerId: Id | null
  /** null = the banker. */
  toPlayerId: Id | null
  amount: number
  kind: PaymentKind
  paid: boolean
  note: string | null
}

/** A player in a game whose `entrants` is `list` (`settings.games`). */
export interface GameEntry {
  gameId: string
  playerId: Id
}

/** Who won a hole contest on a hole (closest to the pin, long drive, greenie...). */
export interface HoleAward {
  roundId: Id
  groupId: Id | null
  hole: number
  gameId: string
  playerId: Id
}

/** The Comité's result for a custom bet: who won and what share (weights, split pro rata). */
export interface GameResult {
  gameId: string
  playerId: Id
  share: number
}

/** A team in a team format (scramble, best ball, shamble). Any size. */
export interface Team {
  id: Id
  name: string | null
  /** Draw order; also what an unnamed team is called ("Equipo 3"). */
  number: number
  playerIds: Id[]
  drawnAt: string | null
}

export interface Snapshot {
  tournament: TournamentRow
  players: Player[]
  courses: Course[]
  rounds: Round[]
  groups: Group[]
  roundTees: RoundTee[]
  pairs: Pair[]
  /** Teams, when the tournament plays a team format. Empty otherwise. */
  teams: Team[]
  scores: Score[]
  snakeTiebreaks: SnakeTiebreak[]
  cardSignatures: CardSignature[]
  handicapOverrides: HandicapOverride[]
  calcuttaLots: CalcuttaLot[]
  calcuttaBids: CalcuttaBid[]
  calcuttaBuybacks: CalcuttaBuyback[]
  payments: Payment[]
  gameEntries: GameEntry[]
  holeAwards: HoleAward[]
  gameResults: GameResult[]
}

/**
 * Every computed number carries one of these so the UI can render
 * "¿Cómo se calculó?" (§6). `steps` are short Spanish lines.
 */
export interface Explanation {
  title: string
  steps: string[]
}

export interface Explained<T> {
  value: T
  why: Explanation
}
