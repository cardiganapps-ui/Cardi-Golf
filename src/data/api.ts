/**
 * Typed writes. Every function throws on error so screens can show the message.
 */
import type { TournamentSettings } from '../engine/settings/schema'
import type { EstimateInput, Hole } from '../engine/types'
import { supabase } from '../lib/supabase'
import { mapTournament, type Row } from './mappers'

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
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
  const rows = unwrap(
    await supabase().from('tournament_organizers').select('role, tournaments(id, slug, name, status, join_code, logo_url, created_at)'),
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
  }>
}

export async function lookupTournament(codeOrSlug: string): Promise<LookupResult | null> {
  const res = await supabase().rpc('lookup_tournament', { p_code: codeOrSlug })
  if (res.error) throw new Error(res.error.message)
  return (res.data as LookupResult | null) ?? null
}

export type ClaimResult =
  | { ok: true; playerId: string; tournamentId: string }
  | { ok: false; reason: 'not_found' | 'no_pin' | 'locked' | 'wrong_pin'; lockedUntil?: string; attemptsLeft?: number }

export async function claimPlayer(playerId: string, pin: string): Promise<ClaimResult> {
  const res = await supabase().rpc('claim_player', { p_player_id: playerId, p_pin: pin })
  if (res.error) throw new Error(res.error.message)
  return res.data as ClaimResult
}

export async function releaseDevice() {
  await supabase().rpc('release_device')
}

export async function myDeviceSession(): Promise<{ playerId: string; tournamentId: string } | null> {
  const res = await supabase().from('device_sessions').select('player_id, tournament_id').maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return res.data ? { playerId: res.data.player_id, tournamentId: res.data.tournament_id } : null
}

/** True when the signed-in account is an organizer of this tournament (its own row only: any member can read the table). */
export async function isOrganizerOf(tournamentId: string): Promise<boolean> {
  const sb = supabase()
  const { data: auth } = await sb.auth.getSession()
  const uid = auth.session?.user.id
  if (!uid || auth.session?.user.is_anonymous) return false
  const res = await sb.from('tournament_organizers').select('role').eq('tournament_id', tournamentId).eq('auth_user_id', uid).maybeSingle()
  if (res.error) throw new Error(res.error.message)
  return !!res.data
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
  if (res.error) throw new Error(res.error.message)
}

export async function playersWithPin(tournamentId: string): Promise<Set<string>> {
  const res = await supabase().rpc('players_with_pin', { p_tournament_id: tournamentId })
  if (res.error) throw new Error(res.error.message)
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
  if (stale.length) unwrap(await sb.from('tees').delete().in('id', stale).select('id'))
  return courseId
}

export async function listCourses(): Promise<Array<{ id: string; name: string; location: string | null; source: string; tees: number; attribution: string | null }>> {
  const rows = unwrap(await supabase().from('courses').select('id, name, location, source, attribution, tees(id)').order('name')) as Row[]
  return rows.map((r) => ({ id: r.id, name: r.name, location: r.location ?? null, source: r.source, tees: (r.tees ?? []).length, attribution: r.attribution ?? null }))
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

export async function deleteCourse(id: string) {
  unwrap(await supabase().from('courses').delete().eq('id', id).select('id'))
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------
export async function upsertRound(tournamentId: string, r: { id?: string; number: number; date: string | null; course_id: string | null; holes: 9 | 18; status?: string }) {
  const row: Row = { ...r, tournament_id: tournamentId }
  if (!row.id) delete row.id
  return unwrap(await supabase().from('rounds').upsert(row, { onConflict: 'tournament_id,number' }).select('id').single()) as { id: string }
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
  number: number
  tee_time: string | null
  start_hole: number
  player_ids: string[]
}

/** Replace every group of a round (members included). Scores are keyed by player, so regrouping never loses them. */
export async function replaceGroups(roundId: string, groups: GroupInput[]) {
  const sb = supabase()
  unwrap(await sb.from('groups').delete().eq('round_id', roundId).select('id'))
  for (const g of groups) {
    const row = unwrap(await sb.from('groups').insert({ round_id: roundId, number: g.number, tee_time: g.tee_time, start_hole: g.start_hole }).select('id').single()) as { id: string }
    if (g.player_ids.length) unwrap(await sb.from('group_members').insert(g.player_ids.map((pid) => ({ group_id: row.id, player_id: pid }))).select('player_id'))
  }
}

export async function upsertHandicapOverride(roundId: string, playerId: string, playingHcp: number, reason: string, by: string | null) {
  unwrap(await supabase().from('handicap_overrides').upsert({ round_id: roundId, player_id: playerId, playing_hcp: playingHcp, reason, by }, { onConflict: 'round_id,player_id' }).select('player_id'))
}

export async function deleteHandicapOverride(roundId: string, playerId: string) {
  unwrap(await supabase().from('handicap_overrides').delete().eq('round_id', roundId).eq('player_id', playerId).select('player_id'))
}

export async function adminSaveScore(
  payload: { round_id: string; player_id: string; hole: number; strokes: number | null; putts: number | null; picked_up: boolean; entered_by: string | null },
  reason: string | null,
) {
  unwrap(await supabase().from('scores').upsert({ ...payload, reason, client_ts: new Date().toISOString() }, { onConflict: 'round_id,player_id,hole' }).select('id'))
}

/** Keep the current values and clear the discrepancy flag. */
export async function resolveDispute(roundId: string, playerId: string, hole: number) {
  unwrap(await supabase().from('scores').update({ disputed: false }).eq('round_id', roundId).eq('player_id', playerId).eq('hole', hole).select('id'))
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

export async function replacePairs(tournamentId: string, pairs: PairInput[]) {
  const sb = supabase()
  unwrap(await sb.from('pairs').delete().eq('tournament_id', tournamentId).select('id'))
  if (pairs.length) unwrap(await sb.from('pairs').insert(pairs.map((p) => ({ ...p, tournament_id: tournamentId, drawn_at: new Date().toISOString() }))).select('id'))
}

export async function renamePair(pairId: string, name: string) {
  unwrap(await supabase().from('pairs').update({ name: name.trim() || null }).eq('id', pairId).select('id'))
}

// ---------------------------------------------------------------------------
// Payments (M5)
// ---------------------------------------------------------------------------
export interface PaymentInput {
  from_player_id: string | null
  to_player_id: string | null
  amount: number
  kind: 'entry' | 'calcutta' | 'buyback' | 'payout' | 'other'
  paid: boolean
  note?: string | null
}

/** One row per (kind, from, to): mark paid/unpaid with the expected amount. */
export async function setPaymentPaid(tournamentId: string, p: PaymentInput) {
  const sb = supabase()
  let q = sb.from('payments').select('id').eq('tournament_id', tournamentId).eq('kind', p.kind)
  q = p.from_player_id ? q.eq('from_player_id', p.from_player_id) : q.is('from_player_id', null)
  q = p.to_player_id ? q.eq('to_player_id', p.to_player_id) : q.is('to_player_id', null)
  const existing = unwrap(await q) as Array<{ id: string }>
  if (existing.length) {
    unwrap(await sb.from('payments').update({ paid: p.paid, amount: p.amount, note: p.note ?? null }).in('id', existing.map((e) => e.id)).select('id'))
  } else {
    unwrap(await sb.from('payments').insert({ ...p, tournament_id: tournamentId }).select('id'))
  }
}
