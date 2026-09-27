/**
 * The raw facts of ONE tournament (CLAUDE.md §4 "store raw facts, derive
 * everything"). Mirrors the tables in §7 in camelCase. The engine never sees
 * anything from another tournament.
 */

export type Id = string

export type TournamentStatus = 'setup' | 'auction' | 'live' | 'finished'
export type RoundStatus = 'scheduled' | 'live' | 'finished' | 'cancelled'
export type LotStatus = 'pending' | 'open' | 'sold'
export type PaymentKind = 'entry' | 'calcutta' | 'buyback' | 'payout' | 'other'

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
}

export interface Player {
  id: Id
  fullName: string
  displayName: string
  /** One of `settings.tiers`, or null when the tournament has no tiers. */
  tier: string | null
  baseHcp: number
  teeId: Id | null
  isHonoree: boolean
  isAdmin: boolean
  avatarUrl: string | null
  formGuide: string | null
  sortOrder: number
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
  roundId: Id
  playerId: Id
  hole: number
  strokes: number | null
  putts: number | null
  pickedUp: boolean
  enteredBy: Id | null
  updatedAt: string | null
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

export interface Snapshot {
  tournament: TournamentRow
  players: Player[]
  courses: Course[]
  rounds: Round[]
  groups: Group[]
  pairs: Pair[]
  scores: Score[]
  snakeTiebreaks: SnakeTiebreak[]
  cardSignatures: CardSignature[]
  handicapOverrides: HandicapOverride[]
  calcuttaLots: CalcuttaLot[]
  calcuttaBids: CalcuttaBid[]
  calcuttaBuybacks: CalcuttaBuyback[]
  payments: Payment[]
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
