/**
 * Typed writes. Every function throws on error; screens show `humanError(e)` (src/lib/humanError.ts).
 */
import type { TournamentSettings } from '../engine/settings/schema'
import type { EstimateInput, Hole, PaymentKind } from '../engine/types'
import { supabase } from '../lib/supabase'
import { mapTournament, type Row } from './mappers'

/**
 * A server error with its Postgres code. humanError reads the code: our own
 * raises (42501, 22023, 23505, P0001) keep their Spanish sentence, Postgres's
 * own messages become copy.
 */
export class ApiError extends Error {
  code: string | null
  constructor(message: string, code: string | null) {
    super(message)
    this.code = code
  }
  /** From a supabase-js error, keeping its code. */
  static from(error: { message: string; code?: string | null }): ApiError {
    return new ApiError(error.message, error.code ?? null)
  }
}

function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw ApiError.from(res.error)
  return res.data as T
}

async function rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
  const res = await supabase().rpc(name, args)
  if (res.error) throw ApiError.from(res.error)
  return res.data as T
}

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------
export async function createTournament(input: { name: string; tagline?: string; slug?: string; settings: TournamentSettings }) {
  const row = unwrap(
    await supabase().rpc('create_tournament', {
      p_name: input.name,
      p_settings: input.settings,
      p_slug: input.slug ?? null,
      p_tagline: input.tagline ?? null,
    }),
  )
  return mapTournament(row as Row)
}

export async function updateTournament(id: string, patch: Row) {
  unwrap(await supabase().from('tournaments').update(patch).eq('id', id).select('id'))
}

export async function duplicateTournament(sourceId: string, name: string) {
  const row = unwrap(await supabase().rpc('duplicate_tournament', { p_source_id: sourceId, p_name: name }))
  return mapTournament(row as Row)
}

export async function deleteTournament(id: string) {
  unwrap(await supabase().from('tournaments').delete().eq('id', id).select('id'))
}

/** One change in a tournament's history (migration 0022 `tournament_audit`). */
export interface AuditEntry {
  id: number
  at: string
  table: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  rowId: string
  /** The Admin de Polo, outside a tournament he belongs to. */
  platform: boolean
  /** The player or account name; null for the admin or when nobody is known. */
  actor: string | null
  reason: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

/** The Comité's history, newest first; `before` pages by id. */
export async function tournamentAudit(tournamentId: string, before?: number, limit = 50): Promise<AuditEntry[]> {
  return rpc<AuditEntry[]>('tournament_audit', { p_tournament_id: tournamentId, p_before: before ?? null, p_limit: limit })
}

/** Protegido on or off: the owner or the platform admin. Off needs a reason. */
export async function setTournamentProtected(id: string, on: boolean, reason?: string) {
  await rpc('set_tournament_protected', { p_tournament_id: id, p_on: on, p_reason: reason ?? null })
}

export interface MyTournament {
  id: string
  slug: string
  name: string
  status: string
  joinCode: string
  logoUrl: string | null
  role: string
}

export async function listMyTournaments(): Promise<MyTournament[]> {
  // Filter by account, never by what RLS happens to show: the platform admin
  // reads every tournament's Comité, and those are not his tournaments.
  const sb = supabase()
  const uid = (await sb.auth.getSession()).data.session?.user.id
  if (!uid) return []
  const rows = unwrap(
    await sb.from('tournament_organizers').select('role, tournaments(id, slug, name, status, join_code, logo_url, created_at)').eq('auth_user_id', uid),
  ) as Row[]
  return rows
    .filter((r) => r.tournaments)
    .map((r) => ({
      id: r.tournaments.id,
      slug: r.tournaments.slug,
      name: r.tournaments.name,
      status: r.tournaments.status,
      joinCode: r.tournaments.join_code,
      logoUrl: r.tournaments.logo_url ?? null,
      role: r.role,
    }))
}

export interface LookupResult {
  id: string
  slug: string
  name: string
  tagline: string | null
  logoUrl: string | null
  accentColor: string | null
  status: string
  joinCode: string
  players: Array<{
    id: string
    displayName: string
    fullName: string
    tier: string | null
    avatarUrl: string | null
    isHonoree: boolean
    hasPin: boolean
    /** This session is this player (confirmed profile link or this device's PIN claim). */
    isMe?: boolean
    /** Someone confirmed this player as their profile. */
    hasProfile?: boolean
    /** The Comité proposed this player for my profile ("¿Eres tú?"). */
    pendingMe?: boolean
  }>
}

export async function lookupTournament(codeOrSlug: string): Promise<LookupResult | null> {
  const res = await supabase().rpc('lookup_tournament', { p_code: codeOrSlug })
  if (res.error) throw ApiError.from(res.error)
  return (res.data as LookupResult | null) ?? null
}

export type ClaimResult =
  | { ok: true; playerId: string; tournamentId: string }
  | { ok: false; reason: 'not_found' | 'no_pin' | 'locked' | 'wrong_pin'; lockedUntil?: string; attemptsLeft?: number }
  /** This account is already confirmed as another player of the tournament. */
  | { ok: false; reason: 'already_linked'; playerId: string }

export async function claimPlayer(playerId: string, pin: string): Promise<ClaimResult> {
  const res = await supabase().rpc('claim_player', { p_player_id: playerId, p_pin: pin })
  if (res.error) throw ApiError.from(res.error)
  return res.data as ClaimResult
}

export async function releaseDevice() {
  await supabase().rpc('release_device')
}

/** Who this session is in a tournament: its player (profile link or device PIN claim) and its Comité rights. */
export interface Membership {
  playerId: string | null
  role: 'owner' | 'admin' | 'member' | 'none' | 'platform'
  isOrganizer: boolean
  isAdmin: boolean
  /** 'platform': the Polo admin, visiting a tournament he does not belong to. */
  via: 'profile' | 'device' | 'platform' | null
  /** Protegido: nobody deletes it, and the platform admin needs an unlock to write. */
  protected?: boolean
  /** Platform visits only: until when this admin's unlock lasts. */
  unlockedUntil?: string | null
}

export async function myMembership(tournamentId: string): Promise<Membership> {
  return rpc<Membership>('my_membership', { tid: tournamentId })
}

export async function rotateJoinCode(tournamentId: string): Promise<string> {
  return rpc<string>('rotate_join_code', { p_tournament_id: tournamentId })
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------
export interface PlayerInput {
  id?: string
  full_name: string
  display_name: string
  tier: string | null
  base_hcp: number
  handicap_source: 'index' | 'estimate' | 'manual'
  handicap_index: number | null
  estimate_inputs: [EstimateInput, EstimateInput, EstimateInput] | null
  default_tee_id: string | null
  is_honoree: boolean
  is_admin: boolean
  avatar_url: string | null
  form_guide: string | null
  sort_order: number
}

export async function upsertPlayer(tournamentId: string, p: PlayerInput) {
  const row = { ...p, tournament_id: tournamentId }
  if (!row.id) delete (row as Partial<typeof row>).id
  return unwrap(await supabase().from('players').upsert(row).select('id').single()) as { id: string }
}

export async function deletePlayer(id: string) {
  unwrap(await supabase().from('players').delete().eq('id', id).select('id'))
}

export async function setPlayerPin(playerId: string, pin: string) {
  const res = await supabase().rpc('set_player_pin', { p_player_id: playerId, p_pin: pin })
  if (res.error) throw ApiError.from(res.error)
}

export async function playersWithPin(tournamentId: string): Promise<Set<string>> {
  const res = await supabase().rpc('players_with_pin', { p_tournament_id: tournamentId })
  if (res.error) throw ApiError.from(res.error)
  return new Set((res.data as string[] | null) ?? [])
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------
export interface CourseDraftTee {
  id?: string
  name: string
  color: string | null
  rating: number | null
  slope: number | null
  holes: Hole[]
}

export interface CourseDraft {
  id?: string
  name: string
  location?: string | null
  source?: 'manual' | 'golfcourseapi' | 'opengolfapi' | 'scorecard_photo'
  externalId?: string | null
  attribution?: string | null
  website?: string | null
  latitude?: number | null
  longitude?: number | null
  tees: CourseDraftTee[]
}

/** Create or replace a course with its tees and holes. Returns the course id. */
export async function saveCourse(draft: CourseDraft): Promise<string> {
  const sb = supabase()
  const courseRow: Row = {
    name: draft.name,
    location: draft.location ?? null,
    source: draft.source ?? 'manual',
    external_id: draft.externalId ?? null,
    imported_at: draft.source && draft.source !== 'manual' ? new Date().toISOString() : null,
    attribution: draft.attribution ?? null,
    website: draft.website ?? null,
    latitude: draft.latitude ?? null,
    longitude: draft.longitude ?? null,
  }
  let courseId = draft.id
  if (courseId) {
    unwrap(await sb.from('courses').update(courseRow).eq('id', courseId).select('id'))
  } else {
    const { data: u } = await sb.auth.getUser()
    courseId = (unwrap(await sb.from('courses').insert({ ...courseRow, created_by: u.user?.id }).select('id').single()) as { id: string }).id
  }
  // Tees: upsert the ones in the draft, delete the rest.
  const existing = unwrap(await sb.from('tees').select('id').eq('course_id', courseId)) as Array<{ id: string }>
  const keep = new Set<string>()
  for (const [i, t] of draft.tees.entries()) {
    const teeRow: Row = {
      course_id: courseId,
      name: t.name,
      color: t.color,
      rating: t.rating,
      slope: t.slope,
      par_total: t.holes.reduce((s, h) => s + h.par, 0),
      sort_order: i,
    }
    let teeId = t.id
    if (teeId) unwrap(await sb.from('tees').update(teeRow).eq('id', teeId).select('id'))
    else teeId = (unwrap(await sb.from('tees').insert(teeRow).select('id').single()) as { id: string }).id
    keep.add(teeId)
    unwrap(
      await sb
        .from('holes')
        .upsert(
          t.holes.map((h) => ({ tee_id: teeId, number: h.number, par: h.par, stroke_index: h.strokeIndex, yards: h.yards })),
          { onConflict: 'tee_id,number' },
        )
        .select('number'),
    )
  }
  const stale = existing.filter((e) => !keep.has(e.id)).map((e) => e.id)
  if (stale.length) {
    const inUse = unwrap(await sb.from('round_tees').select('tee_id').in('tee_id', stale)) as Array<{ tee_id: string }>
    if (inUse.length) throw new ApiError('Ese tee lo juega alguien en una ronda; cámbialo primero', '22023')
    unwrap(await sb.from('tees').delete().in('id', stale).select('id'))
  }
  return courseId
}

export async function listCourses(): Promise<Array<{ id: string; name: string; location: string | null; source: string; tees: number; attribution: string | null; createdBy: string | null }>> {
  const rows = unwrap(await supabase().from('courses').select('id, name, location, source, attribution, created_by, tees(id)').order('name')) as Row[]
  return rows.map((r) => ({ id: r.id, name: r.name, location: r.location ?? null, source: r.source, tees: (r.tees ?? []).length, attribution: r.attribution ?? null, createdBy: r.created_by ?? null }))
}

export async function loadCourseDraft(courseId: string): Promise<CourseDraft> {
  const sb = supabase()
  const course = unwrap(await sb.from('courses').select('*').eq('id', courseId).single()) as Row
  const tees = unwrap(await sb.from('tees').select('*').eq('course_id', courseId).order('sort_order')) as Row[]
  const holes = tees.length ? (unwrap(await sb.from('holes').select('*').in('tee_id', tees.map((t) => t.id))) as Row[]) : []
  return {
    id: course.id,
    name: course.name,
    location: course.location,
    source: course.source,
    externalId: course.external_id,
    attribution: course.attribution ?? null,
    website: course.website ?? null,
    latitude: course.latitude == null ? null : Number(course.latitude),
    longitude: course.longitude == null ? null : Number(course.longitude),
    tees: tees.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      rating: t.rating == null ? null : Number(t.rating),
      slope: t.slope,
      holes: holes
        .filter((h) => h.tee_id === t.id)
        .sort((a, b) => a.number - b.number)
        .map((h) => ({ number: h.number, par: h.par, strokeIndex: h.stroke_index, yards: h.yards })),
    })),
  }
}

/** Refused by the server when the caller did not create it or a round uses it. */
export async function deleteCourse(id: string) {
  await rpc('delete_course', { p_course_id: id })
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------
/** Insert or update by id; a taken number surfaces as ApiError 23505. */
export async function upsertRound(tournamentId: string, r: { id?: string; number: number; date: string | null; course_id: string | null; holes: 9 | 18; status?: string }) {
  const sb = supabase()
  const { id, ...rest } = r
  if (id) return unwrap(await sb.from('rounds').update(rest).eq('id', id).select('id').single()) as { id: string }
  return unwrap(await sb.from('rounds').insert({ ...rest, tournament_id: tournamentId }).select('id').single()) as { id: string }
}

export async function setRoundStatus(roundId: string, status: 'scheduled' | 'live' | 'finished' | 'cancelled') {
  unwrap(await supabase().from('rounds').update({ status }).eq('id', roundId).select('id'))
}

export async function deleteRound(id: string) {
  unwrap(await supabase().from('rounds').delete().eq('id', id).select('id'))
}

export async function setRoundTee(roundId: string, playerId: string, teeId: string | null) {
  const sb = supabase()
  if (teeId) unwrap(await sb.from('round_tees').upsert({ round_id: roundId, player_id: playerId, tee_id: teeId }).select('tee_id'))
  else unwrap(await sb.from('round_tees').delete().eq('round_id', roundId).eq('player_id', playerId).select('tee_id'))
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
export async function uploadAsset(path: string, file: Blob, contentType?: string): Promise<string> {
  const sb = supabase()
  const { error } = await sb.storage.from('tournament-assets').upload(path, file, { upsert: true, contentType: contentType ?? file.type })
  if (error) throw new Error(error.message)
  const { data } = sb.storage.from('tournament-assets').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}

// ---------------------------------------------------------------------------
// Groups, handicap overrides, Comité score edits (M4)
// ---------------------------------------------------------------------------
export interface GroupInput {
  /** Existing group to update in place (keeps its tiebreak answers). */
  id?: string
  number: number
  tee_time: string | null
  start_hole: number
  player_ids: string[]
}

/** Save a round's groups in one transaction: existing groups (by id or same members) are updated, the rest inserted, missing ones deleted. */
export async function saveGroups(roundId: string, groups: GroupInput[]): Promise<Array<{ number: number; id: string }>> {
  return rpc('upsert_groups', { p_round_id: roundId, p_groups: groups })
}

export async function upsertHandicapOverride(roundId: string, playerId: string, playingHcp: number, reason: string, by: string | null) {
  unwrap(await supabase().from('handicap_overrides').upsert({ round_id: roundId, player_id: playerId, playing_hcp: playingHcp, reason, by }, { onConflict: 'round_id,player_id' }).select('player_id'))
}

export async function deleteHandicapOverride(roundId: string, playerId: string) {
  unwrap(await supabase().from('handicap_overrides').delete().eq('round_id', roundId).eq('player_id', playerId).select('player_id'))
}

/** Comité correction; the server demands a reason once the card is signed and logs it. */
export async function adminSaveScore(payload: { round_id: string; player_id: string; hole: number; strokes: number | null; putts: number | null; picked_up: boolean }, reason: string | null) {
  await rpc('admin_save_score', {
    p_round_id: payload.round_id,
    p_player_id: payload.player_id,
    p_hole: payload.hole,
    p_strokes: payload.strokes,
    p_putts: payload.putts,
    p_picked_up: payload.picked_up,
    p_reason: reason,
  })
}

/** keep = true: the current values stand; false: the previous device's values come back. Either way the flag clears. */
export async function resolveDispute(roundId: string, playerId: string, hole: number, keep = true) {
  await rpc('resolve_score_dispute', { p_round_id: roundId, p_player_id: playerId, p_hole: hole, p_keep: keep })
}

/** Comité answer to "¿Quién embocó al último?" (direct write: the console is online). */
export async function answerTiebreak(payload: { round_id: string; group_id: string; hole: number; last_holed_player_id: string; decided_by: string | null }) {
  unwrap(await supabase().from('snake_tiebreaks').upsert(payload, { onConflict: 'round_id,group_id,hole' }).select('hole'))
}

export async function unsignCard(roundId: string, pairId: string) {
  unwrap(await supabase().from('card_signatures').delete().eq('round_id', roundId).eq('pair_id', pairId).select('pair_id'))
}

// ---------------------------------------------------------------------------
// Calcutta (M5)
// ---------------------------------------------------------------------------
/** Create one lot per player in the given order (replaces any unsold draft). */
export async function createLots(tournamentId: string, playerIdsInOrder: string[]) {
  const sb = supabase()
  unwrap(await sb.from('calcutta_lots').delete().eq('tournament_id', tournamentId).neq('status', 'sold').select('id'))
  const { data: sold } = await sb.from('calcutta_lots').select('player_id, lot_number').eq('tournament_id', tournamentId)
  const soldIds = new Set((sold ?? []).map((r: Row) => r.player_id))
  let n = (sold ?? []).reduce((m: number, r: Row) => Math.max(m, r.lot_number), 0)
  const rows = playerIdsInOrder.filter((id) => !soldIds.has(id)).map((player_id) => ({ tournament_id: tournamentId, player_id, lot_number: ++n, status: 'pending' }))
  if (rows.length) unwrap(await sb.from('calcutta_lots').insert(rows).select('id'))
}

export async function setLotStatus(lotId: string, status: 'pending' | 'open') {
  unwrap(await supabase().from('calcutta_lots').update({ status, price: null, owner_id: null, sold_at: null }).eq('id', lotId).select('id'))
}

export async function placeBid(lotId: string, bidderId: string, amount: number) {
  unwrap(await supabase().from('calcutta_bids').insert({ lot_id: lotId, bidder_id: bidderId, amount }).select('id'))
}

export async function deleteBid(bidId: string) {
  unwrap(await supabase().from('calcutta_bids').delete().eq('id', bidId).select('id'))
}

export async function sellLot(lotId: string, ownerId: string, price: number) {
  unwrap(await supabase().from('calcutta_lots').update({ status: 'sold', owner_id: ownerId, price, sold_at: new Date().toISOString() }).eq('id', lotId).select('id'))
}

export async function setBuyback(lotId: string, pct: number, amount: number) {
  const sb = supabase()
  if (pct <= 0) unwrap(await sb.from('calcutta_buybacks').delete().eq('lot_id', lotId).select('lot_id'))
  else unwrap(await sb.from('calcutta_buybacks').upsert({ lot_id: lotId, pct, amount, paid: false }, { onConflict: 'lot_id' }).select('lot_id'))
}

export async function setBuybackPaid(lotId: string, paid: boolean) {
  unwrap(await supabase().from('calcutta_buybacks').update({ paid }).eq('lot_id', lotId).select('lot_id'))
}

/** Reopen a sold lot (undo the hammer): bids stay, buyback is removed. */
export async function reopenLot(lotId: string) {
  const sb = supabase()
  unwrap(await sb.from('calcutta_buybacks').delete().eq('lot_id', lotId).select('lot_id'))
  unwrap(await sb.from('calcutta_lots').update({ status: 'open', owner_id: null, price: null, sold_at: null }).eq('id', lotId).select('id'))
}

export async function resetAuction(tournamentId: string) {
  unwrap(await supabase().from('calcutta_lots').delete().eq('tournament_id', tournamentId).select('id'))
}

// ---------------------------------------------------------------------------
// Pairs (M5 draw)
// ---------------------------------------------------------------------------
export interface PairInput {
  name: string | null
  player1_id: string
  player2_id: string
  kind: string | null
  picked_by_honoree: boolean
}

/** The draw in one transaction: pairs, the round-1 groups and (optionally) auction → live. Refused once any card is signed. */
export async function saveDraw(tournamentId: string, pairs: PairInput[], round1Groups: GroupInput[] | null, goLive: boolean) {
  return rpc<{ pairs: number; groups: Array<{ number: number; id: string }> }>('save_draw', {
    p_tournament_id: tournamentId,
    p_pairs: pairs,
    p_round1_groups: round1Groups,
    p_go_live: goLive,
  })
}

export async function renamePair(pairId: string, name: string) {
  unwrap(await supabase().from('pairs').update({ name: name.trim() || null }).eq('id', pairId).select('id'))
}

export interface TeamInput {
  name: string | null
  player_ids: string[]
}

/**
 * The team draw, replacing whatever was there. Like save_draw it is refused
 * once a card has been signed, so a finished round cannot lose the teams
 * its scores were played under.
 */
export async function saveTeams(tournamentId: string, teams: TeamInput[]) {
  return rpc<{ teams: number }>('save_teams', { p_tournament_id: tournamentId, p_teams: teams })
}

export async function renameTeam(teamId: string, name: string) {
  return rpc<null>('rename_team', { p_team_id: teamId, p_name: name })
}

// ---------------------------------------------------------------------------
// Payments (M5)
// ---------------------------------------------------------------------------
export interface PaymentInput {
  from_player_id: string | null
  to_player_id: string | null
  amount: number
  kind: PaymentKind
  paid: boolean
  note?: string | null
}

/** One row per (kind, from, to), enforced by the server: mark paid/unpaid with the aggregate amount. */
export async function setPaymentPaid(tournamentId: string, p: PaymentInput) {
  await rpc('set_payment_paid', {
    p_tournament_id: tournamentId,
    p_kind: p.kind,
    p_from: p.from_player_id,
    p_to: p.to_player_id,
    p_amount: p.amount,
    p_paid: p.paid,
    p_note: p.note ?? null,
  })
}

// ---------------------------------------------------------------------------
// Instance games: entrants (game_entries), hole awards, custom-bet results
// ---------------------------------------------------------------------------
export async function setGameEntry(tournamentId: string, gameId: string, playerId: string, on: boolean) {
  const sb = supabase()
  if (on) unwrap(await sb.from('game_entries').upsert({ tournament_id: tournamentId, game_id: gameId, player_id: playerId }, { onConflict: 'tournament_id,game_id,player_id' }).select('player_id'))
  else unwrap(await sb.from('game_entries').delete().eq('tournament_id', tournamentId).eq('game_id', gameId).eq('player_id', playerId).select('player_id'))
}

/** Put every listed player in a game (used when a game switches from "todos" to a list). */
export async function seedGameEntries(tournamentId: string, gameId: string, playerIds: string[]) {
  if (!playerIds.length) return
  unwrap(await supabase().from('game_entries').upsert(playerIds.map((player_id) => ({ tournament_id: tournamentId, game_id: gameId, player_id })), { onConflict: 'tournament_id,game_id,player_id' }).select('player_id'))
}

/** Comité: set the winners of a contest hole for the whole field (group-less rows override the groups' claims). */
export async function adminSetAwards(roundId: string, gameId: string, hole: number, playerIds: string[] | null, decidedBy: string | null) {
  const sb = supabase()
  unwrap(await sb.from('hole_awards').delete().eq('round_id', roundId).eq('game_id', gameId).eq('hole', hole).is('group_id', null).select('hole'))
  // null = clear the Comité's decision (the groups' claims count again); [] = nobody won.
  if (playerIds === null) return
  if (!playerIds.length) {
    unwrap(await sb.from('hole_awards').delete().eq('round_id', roundId).eq('game_id', gameId).eq('hole', hole).select('hole'))
    return
  }
  unwrap(await sb.from('hole_awards').insert(playerIds.map((player_id) => ({ round_id: roundId, group_id: null, hole, game_id: gameId, player_id, decided_by: decidedBy }))).select('hole'))
}

/** Comité: the winners of a custom bet (replaces the previous result). */
export async function setGameResults(tournamentId: string, gameId: string, winners: Array<{ playerId: string; share: number }>) {
  const sb = supabase()
  unwrap(await sb.from('game_results').delete().eq('tournament_id', tournamentId).eq('game_id', gameId).select('player_id'))
  if (winners.length) unwrap(await sb.from('game_results').insert(winners.map((w) => ({ tournament_id: tournamentId, game_id: gameId, player_id: w.playerId, share: w.share }))).select('player_id'))
}

export async function saveSettings(tournamentId: string, settings: TournamentSettings) {
  await updateTournament(tournamentId, { settings })
}
