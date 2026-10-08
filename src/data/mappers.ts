/**
 * Database rows (snake_case) → engine types (camelCase).
 */
import type {
  CalcuttaBid,
  CalcuttaBuyback,
  CalcuttaLot,
  CardSignature,
  Course,
  GameEntry,
  GameResult,
  Group,
  HandicapOverride,
  Hole,
  HoleAward,
  Pair,
  Team,
  MoneyAdjustment,
  Payment,
  Player,
  Round,
  RoundTee,
  Score,
  SnakeTiebreak,
  Tee,
  TournamentRow,
} from '../engine/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>

export const mapTournament = (r: Row): TournamentRow => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  tagline: r.tagline ?? null,
  logoUrl: r.logo_url ?? null,
  accentColor: r.accent_color ?? null,
  joinCode: r.join_code,
  status: r.status,
  currentRoundId: r.current_round_id ?? null,
  bankerPlayerId: r.banker_player_id ?? null,
  settings: r.settings,
  timezone: r.timezone,
  currency: r.currency,
  countsForStats: r.counts_for_stats ?? true,
  quick: r.quick ?? false,
  crewId: r.crew_id ?? null,
})

export const mapPlayer = (r: Row): Player => ({
  id: r.id,
  fullName: r.full_name,
  displayName: r.display_name,
  tier: r.tier ?? null,
  baseHcp: Number(r.base_hcp ?? 0),
  handicapSource: r.handicap_source ?? 'manual',
  handicapIndex: r.handicap_index == null ? null : Number(r.handicap_index),
  estimateInputs: r.estimate_inputs ?? null,
  defaultTeeId: r.default_tee_id ?? null,
  isHonoree: !!r.is_honoree,
  isAdmin: !!r.is_admin,
  avatarUrl: r.avatar_url ?? null,
  formGuide: r.form_guide ?? null,
  sortOrder: r.sort_order ?? 0,
})

export const mapHole = (r: Row): Hole => ({
  number: r.number,
  par: r.par,
  strokeIndex: r.stroke_index,
  yards: r.yards ?? null,
})

export const mapTee = (r: Row, holes: Row[]): Tee => ({
  id: r.id,
  courseId: r.course_id,
  name: r.name,
  color: r.color ?? null,
  rating: r.rating == null ? null : Number(r.rating),
  slope: r.slope ?? null,
  holes: holes
    .filter((h) => h.tee_id === r.id)
    .map(mapHole)
    .sort((a, b) => a.number - b.number),
})

export const mapCourse = (r: Row, tees: Row[], holes: Row[]): Course => ({
  id: r.id,
  name: r.name,
  tees: tees
    .filter((t) => t.course_id === r.id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((t) => mapTee(t, holes)),
})

export const mapRound = (r: Row): Round => ({
  id: r.id,
  number: r.number,
  date: r.date ?? null,
  courseId: r.course_id ?? null,
  holes: r.holes ?? 18,
  status: r.status,
})

export const mapGroup = (r: Row, members: Row[]): Group => ({
  id: r.id,
  roundId: r.round_id,
  number: r.number,
  teeTime: r.tee_time ?? null,
  startHole: r.start_hole ?? 1,
  playerIds: members.filter((m) => m.group_id === r.id).map((m) => m.player_id),
})

export const mapRoundTee = (r: Row): RoundTee => ({ roundId: r.round_id, playerId: r.player_id, teeId: r.tee_id })

export const mapPair = (r: Row): Pair => ({
  id: r.id,
  name: r.name ?? null,
  player1Id: r.player1_id,
  player2Id: r.player2_id,
  kind: r.kind ?? null,
  pickedByHonoree: !!r.picked_by_honoree,
  drawnAt: r.drawn_at ?? null,
})

export const mapTeam = (r: Row, members: Row[]): Team => ({
  id: r.id,
  name: r.name ?? null,
  number: r.number,
  playerIds: members.filter((m) => m.team_id === r.id).map((m) => m.player_id),
  drawnAt: r.drawn_at ?? null,
})

export const mapScore = (r: Row): Score => ({
  id: r.id ?? undefined,
  roundId: r.round_id,
  playerId: r.player_id,
  hole: r.hole,
  strokes: r.strokes ?? null,
  putts: r.putts ?? null,
  pickedUp: !!r.picked_up,
  enteredBy: r.entered_by ?? null,
  updatedAt: r.updated_at ?? null,
  disputed: !!r.disputed,
  previous: r.previous ?? null,
})

export const mapSnakeTiebreak = (r: Row): SnakeTiebreak => ({
  roundId: r.round_id,
  groupId: r.group_id,
  hole: r.hole,
  lastHoledPlayerId: r.last_holed_player_id,
})

export const mapCardSignature = (r: Row): CardSignature => ({
  roundId: r.round_id,
  pairId: r.pair_id,
  signedBy: r.signed_by,
  signedAt: r.signed_at,
})

export const mapHandicapOverride = (r: Row): HandicapOverride => ({
  roundId: r.round_id,
  playerId: r.player_id,
  playingHcp: r.playing_hcp,
  reason: r.reason,
  by: r.by ?? null,
  at: r.at,
})

export const mapLot = (r: Row): CalcuttaLot => ({
  id: r.id,
  playerId: r.player_id,
  lotNumber: r.lot_number,
  status: r.status,
  price: r.price ?? null,
  ownerId: r.owner_id ?? null,
  soldAt: r.sold_at ?? null,
})

export const mapBid = (r: Row): CalcuttaBid => ({
  id: r.id,
  lotId: r.lot_id,
  bidderId: r.bidder_id,
  amount: r.amount,
  createdAt: r.created_at,
})

export const mapBuyback = (r: Row): CalcuttaBuyback => ({
  lotId: r.lot_id,
  pct: r.pct,
  amount: r.amount,
  paid: !!r.paid,
})

export const mapGameEntry = (r: Row): GameEntry => ({ gameId: r.game_id, playerId: r.player_id })

export const mapHoleAward = (r: Row): HoleAward => ({
  roundId: r.round_id,
  groupId: r.group_id ?? null,
  hole: r.hole,
  gameId: r.game_id,
  playerId: r.player_id,
})

export const mapGameResult = (r: Row): GameResult => ({ gameId: r.game_id, playerId: r.player_id, share: Number(r.share) })

export const mapPayment = (r: Row): Payment => ({
  id: r.id,
  fromPlayerId: r.from_player_id ?? null,
  toPlayerId: r.to_player_id ?? null,
  amount: r.amount,
  kind: r.kind,
  paid: !!r.paid,
  note: r.note ?? null,
})

export const mapMoneyAdjustment = (r: Row): MoneyAdjustment => ({
  id: r.id,
  sourceKey: r.source_key,
  kind: r.kind,
  toPlayerId: r.to_player_id ?? null,
  amount: Number(r.amount),
  reason: r.reason,
  createdAt: r.created_at,
  // A row has its call's id (0027); none would only be a row no call wrote: it is a call of its own.
  callId: r.call_id ?? r.id,
  createdBy: r.created_by ?? null,
  voidedAt: r.voided_at ?? null,
  voidReason: r.void_reason ?? null,
})
