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

export async function isOrganizerOf(tournamentId: string): Promise<boolean> {
  const res = await supabase().from('tournament_organizers').select('role').eq('tournament_id', tournamentId).maybeSingle()
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
  source?: 'manual' | 'golfcourseapi' | 'scorecard_photo'
  externalId?: string | null
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

export async function listCourses(): Promise<Array<{ id: string; name: string; location: string | null; source: string; tees: number }>> {
  const rows = unwrap(await supabase().from('courses').select('id, name, location, source, tees(id)').order('name')) as Row[]
  return rows.map((r) => ({ id: r.id, name: r.name, location: r.location ?? null, source: r.source, tees: (r.tees ?? []).length }))
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
