/**
 * Typed writes. Every function throws on error; screens show `humanError(e)` (src/lib/humanError.ts).
 */
import type { TournamentSettings } from '../engine/settings/schema'
import type { EstimateInput, Hole, PaymentKind } from '../engine/types'
import { t } from '../i18n/es-MX'
import { UserError } from '../lib/humanError'
import { supabase } from '../lib/supabase'
import { step } from '../lib/telemetry'
import { acceptLegal } from './legal'
import { entryChanged } from './entryEvents'
import { clearPinEntriesExcept } from './snapshotCache'
import { mapTournament, type Row } from './mappers'
import { ApiError } from './apiError'
import { fetchAll, withCount } from './paged'

export { ApiError }

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
  step('tournament_created')
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

/** One change in a tournament's history (migration 0022 `tournament_audit`; its filters 0063). */
export interface AuditEntry {
  id: number
  at: string
  table: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  rowId: string | null
  /** The Admin de Polo, outside a tournament he belongs to. */
  platform: boolean
  /** The player or account name; null for the admin or when nobody is known. */
  actor: string | null
  /**
   * From which of the player's phones (0050, TRUST-24), once he has entered with his PIN on more than one: its
   * number among them and its kind. Absent for one phone, his own account, the admin, and a database without 0050.
   */
  phone?: { n: number; of: number; kind: 'ios' | 'android' | 'desktop' | 'other' } | null
  reason: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

/** What Historial narrows to (0063, TRUST-19): his rows, that day's, that hole's, the Comité's corrections, the Admin de Polo's. */
export interface AuditFilter {
  player?: string
  round?: string
  hole?: number
  corrections?: boolean
  platform?: boolean
}

/** The Comité's history, newest first; `before` pages by id, within what `filter` leaves. */
export async function tournamentAudit(tournamentId: string, before?: number, limit = 50, filter?: AuditFilter): Promise<AuditEntry[]> {
  // The filter goes only when there is one: a call without it is the one every server since 0022 answers.
  const f = Object.fromEntries(Object.entries(filter ?? {}).filter(([, v]) => v !== undefined && v !== false && v !== ''))
  return rpc<AuditEntry[]>('tournament_audit', { p_tournament_id: tournamentId, p_before: before ?? null, p_limit: limit, ...(Object.keys(f).length ? { p_filter: f } : {}) })
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
    /** Only to a member of the tournament (0056, SEC-06): before a PIN the grid has short names and photos. */
    fullName: string | null
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
  | {
      ok: false
      reason: 'not_found' | 'no_pin' | 'locked' | 'wrong_pin'
      lockedUntil?: string
      attemptsLeft?: number
      /** Which lock (0056, SEC-04): this phone's own, or the player's, which stops only phones that never held him. */
      scope?: 'device' | 'player'
    }
  /** This account is already confirmed as another player of the tournament. */
  | { ok: false; reason: 'already_linked'; playerId: string }

export async function claimPlayer(playerId: string, pin: string): Promise<ClaimResult> {
  const res = await supabase().rpc('claim_player', { p_player_id: playerId, p_pin: pin })
  if (res.error) throw ApiError.from(res.error)
  const ok = (res.data as ClaimResult | null)?.ok === true
  step(ok ? 'pin_claimed' : 'pin_refused')
  // The faces and the PIN step show the consent line (TRUST-05).
  if (ok) void acceptLegal('pin')
  // The phone's one PIN claim moved here: the tournaments it held only by PIN are someone else's now (TRUST-15).
  if (ok) void clearPinEntriesExcept((res.data as { tournamentId: string }).tournamentId)
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

/**
 * The player sheet saved with a reason (UX-28, 0046): a handicap changed after
 * they were fixed. The whole row in one statement; the reason lands on the
 * player's record (En vivo and his sheet show it) and in Historial.
 */
export async function updatePlayer(p: PlayerInput & { id: string }, reason: string) {
  const { id, ...row } = p
  await rpc<string>('update_player', { p_player_id: id, p_row: row, p_reason: reason })
}

/** «Fijar hándicaps» (UX-28): from now on a change needs a reason. Answers when they were fixed. */
export async function lockHandicaps(tournamentId: string): Promise<string> {
  return rpc<string>('lock_handicaps', { p_tournament_id: tournamentId })
}

/** «Liberar»: only before the tournament leaves setup, with a reason; what was recorded goes with the lock. */
export async function unlockHandicaps(tournamentId: string, reason: string): Promise<void> {
  await rpc('unlock_handicaps', { p_tournament_id: tournamentId, p_reason: reason })
}

export async function deletePlayer(id: string) {
  unwrap(await supabase().from('players').delete().eq('id', id).select('id'))
}

export async function setPlayerPin(playerId: string, pin: string) {
  const res = await supabase().rpc('set_player_pin', { p_player_id: playerId, p_pin: pin })
  if (res.error) throw ApiError.from(res.error)
  entryChanged()
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

/**
 * Create or replace a course with its tees and holes, in one call (0045, ARCH-13): all of the card or none of
 * it, and a tee taken out only once nobody in any tournament plays it (a round's tee of the day, a player's
 * default). Returns the course id.
 */
export async function saveCourse(draft: CourseDraft): Promise<string> {
  return rpc<string>('save_course', {
    p: {
      id: draft.id ?? null,
      name: draft.name,
      location: draft.location ?? null,
      source: draft.source ?? 'manual',
      external_id: draft.externalId ?? null,
      attribution: draft.attribution ?? null,
      website: draft.website ?? null,
      latitude: draft.latitude ?? null,
      longitude: draft.longitude ?? null,
      tees: draft.tees.map((t) => ({
        id: t.id ?? null,
        name: t.name,
        color: t.color,
        rating: t.rating,
        slope: t.slope,
        holes: t.holes.map((h) => ({ number: h.number, par: h.par, stroke_index: h.strokeIndex, yards: h.yards })),
      })),
    },
  })
}

export async function listCourses(): Promise<Array<{ id: string; name: string; location: string | null; source: string; tees: number; attribution: string | null; createdBy: string | null }>> {
  // Every signed-in phone reads the whole shared catalog (courses_read), which outgrows one page as Rondas rápidas add
  // courses: paged by name, then id, so a page never repeats or skips one (DB-20).
  const rows = await fetchAll<Row>((from, to, count) =>
    supabase().from('courses').select('id, name, location, source, attribution, created_by, tees(id)', withCount(count)).order('name').order('id').range(from, to),
  )
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
/** `cacheControl` is in seconds (Storage's default is an hour); a file whose name changes with every upload can keep a year. */
export async function uploadAsset(path: string, file: Blob, contentType?: string, cacheControl?: string): Promise<string> {
  const sb = supabase()
  const { error } = await sb.storage.from('tournament-assets').upload(path, file, { upsert: true, contentType: contentType ?? file.type, ...(cacheControl ? { cacheControl } : {}) })
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

/**
 * A Comité correction of one hole, every player in one call (0051, REL-22): admin_save_score for each row in one
 * transaction, so a refused value or a lost signal leaves the hole as it was, never half corrected.
 */
export async function adminSaveHole(roundId: string, hole: number, rows: Array<{ player_id: string; strokes: number | null; putts: number | null; picked_up: boolean }>, reason: string | null) {
  await rpc('admin_save_hole', { p_round_id: roundId, p_hole: hole, p_rows: rows, p_reason: reason })
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

/** The Comité takes a marker's signature off one player's card (0054): his card can be edited again. */
export async function unsignPlayerCard(roundId: string, playerId: string) {
  unwrap(await supabase().from('card_signatures').delete().eq('round_id', roundId).eq('player_id', playerId).select('player_id'))
}

// ---------------------------------------------------------------------------
// Calcutta (M5)
// ---------------------------------------------------------------------------
/** Create one lot per player in the given order, replacing any unsold draft; sold lots stay. One call (0045): a refused draw leaves the lots as they were. */
export async function createLots(tournamentId: string, playerIdsInOrder: string[]) {
  await rpc('create_lots', { p_tournament_id: tournamentId, p_player_ids: playerIdsInOrder })
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

/** Reopen a sold lot (undo the hammer): bids stay, the buyback goes, in one call (0045). */
export async function reopenLot(lotId: string) {
  await rpc('reopen_lot', { p_lot_id: lotId })
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
// Money the rules leave to the Comité (0027, MONEY-05). Online only, like
// adminSaveScore: the Comité decides at the console, and a decision is never
// queued in the outbox to land later on numbers that moved.
// ---------------------------------------------------------------------------
export interface AssignEntry {
  kind: 'award' | 'refund' | 'house'
  /** null only for the house. */
  to_player_id: string | null
  amount: number
}

/** One assignment of an unassigned bucket: every line in one call, with one reason. */
export async function assignUnassigned(tournamentId: string, sourceKey: string, entries: AssignEntry[], reason: string) {
  await rpc('assign_unassigned', {
    p_tournament_id: tournamentId,
    p_source_key: sourceKey,
    p_entries: entries.map((e) => (e.kind === 'house' ? { kind: e.kind, amount: e.amount } : e)),
    p_reason: reason,
  })
}

/** Voids the assignment a row belongs to (every row its call wrote); the money goes back to its bucket. */
export async function voidAdjustment(id: string, reason: string) {
  await rpc('void_adjustment', { p_id: id, p_reason: reason })
}

/** The function or table this reads is not on the database yet (0028 not applied): PGRST202, 42883; PGRST205, 42P01. */
const INBOX_MISSING = new Set(['PGRST202', '42883', 'PGRST205', '42P01'])

/**
 * The holes the Comité decides (0028 `rejected_inbox`, REL-08): the
 * tournament's open `rejected_writes` that are a refusal of a value a person
 * typed, or of an untouched default (`auto`) on a hole nothing else covers
 * (no score, no typed refusal of it open). Never a conflict (the phone that
 * met it asks the player): the server leaves conflicts out, and so does this.
 * Which defaults are listed only the server can say (it sees every score).
 * Oldest first. Null when the database has no inbox yet, so nothing may wait
 * on it.
 */
export async function rejectedInboxRows(tournamentId: string): Promise<Row[] | null> {
  const { data, error } = await supabase().rpc('rejected_inbox', { p_tournament_id: tournamentId })
  if (error) {
    if (INBOX_MISSING.has(error.code ?? '')) return null
    throw ApiError.from(error)
  }
  return (Array.isArray(data) ? (data as Row[]) : []).filter(rejectedForComite)
}
/** A row the Comité may be asked about: never a conflict (0028). */
export function rejectedForComite(r: Row): boolean {
  return r.reason !== 'conflict'
}
/** How many holes wait for the Comité; null when the database has no inbox yet («Cerrar torneo» does not wait on it then). */
export async function openRejectedWrites(tournamentId: string): Promise<number | null> {
  const rows = await rejectedInboxRows(tournamentId)
  return rows ? rows.length : null
}

/** The hole as the Comité saw it before applying (0028 `p_expect`): its three values, `{}` for an empty hole. */
export interface SeenHole {
  strokes?: number | null
  putts?: number | null
  picked_up?: boolean
}
/**
 * The Comité's answer to one of them (0028, REL-08): `apply` writes the
 * fields the phone set over the hole as it stands (as admin_save_score
 * does, the reason on the score), and only if the hole is still `seen`
 * (else 22023, «El hoyo cambió…»); `dismiss` leaves the card, and with
 * `seen` («ya coinciden») is refused the same way when the hole changed
 * since. Online only.
 */
export async function resolveRejectedWrite(id: string, action: 'apply' | 'dismiss', reason: string, seen?: SeenHole) {
  await rpc('resolve_rejected_write', { p_id: id, p_action: action, p_reason: reason, ...(action === 'apply' ? { p_expect: seen ?? null } : seen ? { p_expect: seen } : {}) })
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

/**
 * Comité: the winners of a contest hole for the whole field (its rows sit beside the groups' claims and settle
 * them). null clears the ruling (the groups' claims count again); [] is «nadie», which takes the claims too.
 * One call (0044, ARCH-13): a refused ruling leaves the one in place.
 */
export async function adminSetAwards(roundId: string, gameId: string, hole: number, playerIds: string[] | null, decidedBy: string | null) {
  await rpc('set_hole_ruling', { p_round_id: roundId, p_game_id: gameId, p_hole: hole, p_player_ids: playerIds, p_decided_by: decidedBy })
}

/** Comité: the winners of a custom bet, replacing the previous result in one call (0044): a refused one leaves it as it was. */
export async function setGameResults(tournamentId: string, gameId: string, winners: Array<{ playerId: string; share: number }>) {
  await rpc('set_game_results', { p_tournament_id: tournamentId, p_game_id: gameId, p_winners: winners.map((w) => ({ player_id: w.playerId, share: w.share })) })
}

/** The Comité's setup as `update_settings` reads and writes it: settings keys and the brand columns (0043). */
export interface SetupFields {
  settings?: Record<string, unknown>
  name?: string
  tagline?: string | null
  accent_color?: string | null
}
/** The tournament's setup as the server holds it after a save, or after a refusal. */
export interface SetupRow {
  /** The settings jsonb as stored (raw: `tournaments.settings`). */
  settings: unknown
  name: string
  tagline: string | null
  accent_color: string | null
}

/**
 * Refused because a key the save read changed meanwhile (another Comité
 * screen or device): nothing was written. `now` is the row as it is, and
 * `changed` names what moved (`settings.games`, `name`).
 */
export class SettingsChanged extends UserError {
  readonly now: SetupRow
  readonly changed: string[]
  constructor(now: SetupRow, changed: string[]) {
    super(t.admin.tournament.settingsChanged)
    this.name = 'SettingsChanged'
    this.now = now
    this.changed = changed
  }
}

/**
 * The Comité's setup, key by key (ARCH-13): `seen` is what the screen started
 * from for every key it depends on, `set` only what it changed (settingsWrite.ts
 * builds both). Throws SettingsChanged when one of the keys seen moved since.
 */
export async function updateSettings(tournamentId: string, seen: SetupFields, set: SetupFields): Promise<SetupRow> {
  const r = await rpc<{ ok: boolean; changed?: string[]; now: SetupRow }>('update_settings', { p_tournament_id: tournamentId, p_seen: seen, p_set: set })
  if (!r.ok) throw new SettingsChanged(r.now, r.changed ?? [])
  return r.now
}
