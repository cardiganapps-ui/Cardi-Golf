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
  HandicapInputs,
  HandicapNote,
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
import type { Database, Tables } from './database.types'

/**
 * A row off the live channel or out of a jsonb payload: no table the types
 * can name. A mapper takes its table's row (`RowOf`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>

type TableName = keyof Database['public']['Tables']
/**
 * A table's row as a mapper reads it (ARCH-03): its columns by the names the
 * generated types give them, so a renamed or misspelled column fails the
 * typecheck. Each value as it comes, which may be missing (a link's board
 * leaves columns out, a live change or an older build's row may lack a newer
 * one) or a number's text: the mapper reads it with its fallback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RowOf<T extends TableName> = { [K in keyof Tables<T>]?: any }

export const mapTournament = (r: RowOf<'tournaments'>): TournamentRow => ({
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
  // `timezone` and `currency` are the settings' (ARCH-06): the columns are their mirror (0074), left unread.
  settings: r.settings,
  countsForStats: r.counts_for_stats ?? true,
  quick: r.quick ?? false,
  crewId: r.crew_id ?? null,
  handicapsLockedAt: r.handicaps_locked_at ?? null,
})

export const mapPlayer = (r: RowOf<'players'>): Player => ({
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
  handicapNote: mapHandicapNote(r.handicap_note),
})

/** One side of players.handicap_note, as the trigger writes it (0046); null when it can't be read. */
function mapHandicapInputs(v: unknown): HandicapInputs | null {
  if (!v || typeof v !== 'object') return null
  const x = v as Row
  const source = x.handicap_source
  if (source !== 'index' && source !== 'estimate' && source !== 'manual') return null
  const base = Number(x.base_hcp)
  if (!Number.isFinite(base)) return null
  return {
    handicapSource: source,
    baseHcp: base,
    handicapIndex:
      x.handicap_index == null || !Number.isFinite(Number(x.handicap_index)) ? null : Number(x.handicap_index),
    estimateInputs:
      Array.isArray(x.estimate_inputs) && x.estimate_inputs.length === 3
        ? (x.estimate_inputs as Player['estimateInputs'])
        : null,
  }
}

/** players.handicap_note (0046): the handicap when they were fixed and each change after it; null when absent or unreadable. */
export function mapHandicapNote(v: unknown): HandicapNote | null {
  if (!v || typeof v !== 'object') return null
  const x = v as Row
  const from = mapHandicapInputs(x.from)
  if (!from || !Array.isArray(x.changes)) return null
  const changes: HandicapNote['changes'] = []
  for (const c of x.changes as unknown[]) {
    if (!c || typeof c !== 'object') continue
    const to = mapHandicapInputs((c as Row).to)
    const at = (c as Row).at
    const reason = (c as Row).reason
    if (to && typeof at === 'string' && typeof reason === 'string') changes.push({ at, reason, to })
  }
  return { from, changes }
}

export const mapHole = (r: RowOf<'holes'>): Hole => ({
  number: r.number,
  par: r.par,
  strokeIndex: r.stroke_index,
  yards: r.yards ?? null,
})

export const mapTee = (r: RowOf<'tees'>, holes: RowOf<'holes'>[]): Tee => ({
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

export const mapCourse = (r: RowOf<'courses'>, tees: RowOf<'tees'>[], holes: RowOf<'holes'>[]): Course => ({
  id: r.id,
  name: r.name,
  tees: tees
    .filter((t) => t.course_id === r.id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((t) => mapTee(t, holes)),
})

export const mapRound = (r: RowOf<'rounds'>): Round => ({
  id: r.id,
  number: r.number,
  date: r.date ?? null,
  courseId: r.course_id ?? null,
  holes: r.holes ?? 18,
  status: r.status,
})

export const mapGroup = (r: RowOf<'groups'>, members: RowOf<'group_members'>[]): Group => ({
  id: r.id,
  roundId: r.round_id,
  number: r.number,
  teeTime: r.tee_time ?? null,
  startHole: r.start_hole ?? 1,
  playerIds: members.filter((m) => m.group_id === r.id).map((m) => m.player_id),
})

export const mapRoundTee = (r: RowOf<'round_tees'>): RoundTee => ({
  roundId: r.round_id,
  playerId: r.player_id,
  teeId: r.tee_id,
})

export const mapPair = (r: RowOf<'pairs'>): Pair => ({
  id: r.id,
  name: r.name ?? null,
  player1Id: r.player1_id,
  player2Id: r.player2_id,
  kind: r.kind ?? null,
  pickedByHonoree: !!r.picked_by_honoree,
  drawnAt: r.drawn_at ?? null,
})

export const mapTeam = (r: RowOf<'teams'>, members: RowOf<'team_members'>[]): Team => ({
  id: r.id,
  name: r.name ?? null,
  number: r.number,
  playerIds: members.filter((m) => m.team_id === r.id).map((m) => m.player_id),
  drawnAt: r.drawn_at ?? null,
})

export const mapScore = (r: RowOf<'scores'>): Score => ({
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
  // A Comité correction says why (TRUST-14); only then, so a hole with none stays as it always was.
  ...(typeof r.reason === 'string' && r.reason.trim() ? { reason: r.reason } : {}),
})

export const mapSnakeTiebreak = (r: RowOf<'snake_tiebreaks'>): SnakeTiebreak => ({
  roundId: r.round_id,
  groupId: r.group_id,
  hole: r.hole,
  lastHoledPlayerId: r.last_holed_player_id,
  ...(r.decided_by != null && { decidedBy: r.decided_by }),
})

export const mapCardSignature = (r: RowOf<'card_signatures'>): CardSignature => ({
  roundId: r.round_id,
  pairId: r.pair_id ?? null,
  // A player's card, signed by a marker of his group (0054); a pair's signature has none.
  ...(r.player_id != null && { playerId: r.player_id }),
  signedBy: r.signed_by,
  signedAt: r.signed_at,
})

export const mapHandicapOverride = (r: RowOf<'handicap_overrides'>): HandicapOverride => ({
  roundId: r.round_id,
  playerId: r.player_id,
  playingHcp: r.playing_hcp,
  reason: r.reason,
  by: r.by ?? null,
  at: r.at,
})

export const mapLot = (r: RowOf<'calcutta_lots'>): CalcuttaLot => ({
  id: r.id,
  playerId: r.player_id,
  lotNumber: r.lot_number,
  status: r.status,
  price: r.price ?? null,
  ownerId: r.owner_id ?? null,
  soldAt: r.sold_at ?? null,
})

export const mapBid = (r: RowOf<'calcutta_bids'>): CalcuttaBid => ({
  id: r.id,
  lotId: r.lot_id,
  bidderId: r.bidder_id,
  amount: r.amount,
  createdAt: r.created_at,
})

export const mapBuyback = (r: RowOf<'calcutta_buybacks'>): CalcuttaBuyback => ({
  lotId: r.lot_id,
  pct: r.pct,
  amount: r.amount,
  paid: !!r.paid,
})

export const mapGameEntry = (r: RowOf<'game_entries'>): GameEntry => ({ gameId: r.game_id, playerId: r.player_id })

export const mapHoleAward = (r: RowOf<'hole_awards'>): HoleAward => ({
  roundId: r.round_id,
  groupId: r.group_id ?? null,
  hole: r.hole,
  gameId: r.game_id,
  playerId: r.player_id,
  // 0042 generates it from the group; a row from before it (a phone's saved boards) follows its group the same way.
  source: r.source === 'comite' || r.source === 'group' ? r.source : r.group_id == null ? 'comite' : 'group',
})

export const mapGameResult = (r: RowOf<'game_results'>): GameResult => ({
  gameId: r.game_id,
  playerId: r.player_id,
  share: Number(r.share),
})

export const mapPayment = (r: RowOf<'payments'>): Payment => ({
  id: r.id,
  fromPlayerId: r.from_player_id ?? null,
  toPlayerId: r.to_player_id ?? null,
  amount: r.amount,
  kind: r.kind,
  paid: !!r.paid,
  note: r.note ?? null,
})

export const mapMoneyAdjustment = (r: RowOf<'money_adjustments'>): MoneyAdjustment => ({
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
