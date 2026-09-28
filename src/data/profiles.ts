/**
 * Profiles (migration 0013): a person's account-wide identity. Accounts
 * (email or Google) have one; anonymous devices don't. Everything goes
 * through the definer RPCs except editing your own row.
 */
import { useCallback, useEffect, useState } from 'react'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { downscaleImage } from '../lib/images'
import { whsIndex10, whsRule } from '../engine/profile/whs'
import type { PublishRow } from '../engine/profile/results'

export interface MyProfile {
  id: string
  handle: string
  displayName: string
  fullName: string | null
  avatarUrl: string | null
  homeClub: string | null
  city: string | null
  bio: string | null
  indexSource: 'polo' | 'manual'
  manualIndex: number | null
  poloIndex: number | null
  poloIndexRounds: number
  poloIndexAt: string | null
  discoverable: boolean
  createdAt: string
  /** Equal to `createdAt` until the person first edits the profile. */
  updatedAt: string
}

/** What `profile_card` returns: strangers get the card, people who share a tournament also get bio and full name. */
export interface ProfileCard {
  handle: string
  displayName: string
  avatarUrl: string | null
  homeClub: string | null
  city: string | null
  index: number | null
  indexSource: 'polo' | 'manual'
  indexRounds: number
  isMe: boolean
  related: boolean
  fullName: string | null
  bio: string | null
  memberSince: string
}

export interface ProfileHit {
  handle: string
  displayName: string
  avatarUrl: string | null
  homeClub: string | null
  city: string | null
}

export interface MyLink {
  playerId: string
  displayName: string
  linkStatus: 'pending' | 'confirmed'
  tournamentId: string
  slug: string
  name: string
  tournamentStatus: 'setup' | 'auction' | 'live' | 'finished'
  logoUrl: string | null
  createdAt: string
}

export interface TournamentProfile {
  playerId: string
  handle: string
  displayName: string
  avatarUrl: string | null
  status: 'pending' | 'confirmed'
  /** The profile's index (Polo or declared), for "Usar índice Polo". */
  index?: number | null
  indexSource?: 'polo' | 'manual'
}

/** One finished round of a profile (`round_results`, computed by the database). */
export interface RoundResult {
  roundId: string
  tournamentId: string
  slug: string
  tournament: string
  practice: boolean
  playedOn: string | null
  roundNumber: number
  holes: number
  complete: boolean
  course: string | null
  tee: string | null
  rating: number | null
  slope: number | null
  par: number | null
  courseHcp: number | null
  gross: number | null
  ags: number | null
  differential: number | null
  putts: number | null
  eagles: number
  birdies: number
  pars: number
  bogeys: number
  doubles: number
  pickups: number
  /** [hole, par, stroke index, strokes, putts, picked up] */
  detail: Array<[number, number, number, number | null, number | null, boolean]>
}

/** A profile's tournament with its published finish (rank and points from the individual game). */
export interface ProfileTournament {
  tournamentId: string
  slug: string
  name: string
  logoUrl: string | null
  status: 'setup' | 'auction' | 'live' | 'finished'
  practice: boolean
  playerId: string
  displayName: string
  startsOn: string | null
  rank: number | null
  rankLabel: string | null
  field: number | null
  points: number | null
  awards: string[]
}

/** My net in one tournament (only mine; published when it finished). */
export interface MoneyLine {
  tournamentId: string
  slug: string
  name: string
  net: number
  currency: string
  publishedAt: string
  practice: boolean
}

export type LinkResult = { ok: true; playerId: string; tournamentId: string; status?: 'pending' | 'confirmed' } | { ok: false; reason: 'not_found' | 'taken' | 'already_linked' | 'not_yours' | 'expired'; playerId?: string }

/** Editable columns (the index itself is computed). */
export interface ProfilePatch {
  handle?: string
  display_name?: string
  full_name?: string | null
  avatar_url?: string | null
  home_club?: string | null
  city?: string | null
  bio?: string | null
  index_source?: 'polo' | 'manual'
  manual_index?: number | null
  discoverable?: boolean
}

interface ProfileRow {
  id: string
  handle: string
  display_name: string
  full_name: string | null
  avatar_url: string | null
  home_club: string | null
  city: string | null
  bio: string | null
  index_source: 'polo' | 'manual'
  manual_index: number | string | null
  polo_index: number | string | null
  polo_index_rounds: number
  polo_index_at: string | null
  discoverable: boolean
  created_at: string
  updated_at: string
}

const num = (v: number | string | null): number | null => (v == null ? null : Number(v))

export function mapProfile(r: ProfileRow): MyProfile {
  return {
    id: r.id,
    handle: r.handle,
    displayName: r.display_name,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    homeClub: r.home_club,
    city: r.city,
    bio: r.bio,
    indexSource: r.index_source,
    manualIndex: num(r.manual_index),
    poloIndex: num(r.polo_index),
    poloIndexRounds: r.polo_index_rounds,
    poloIndexAt: r.polo_index_at,
    discoverable: r.discoverable,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

/** Names to start a new profile with: the player it is saved from. Ignored once the profile exists. */
export interface NameHint {
  displayName: string
  fullName: string | null
}

/** The signed-in account's profile, created on first call. */
export async function ensureMyProfile(hint?: NameHint | null): Promise<MyProfile> {
  return mapProfile(await rpc<ProfileRow>('ensure_my_profile', hint ? { p_display_name: hint.displayName, p_full_name: hint.fullName } : undefined))
}

/** The signed-in account's profile if it has one (no create). */
export async function getMyProfile(): Promise<MyProfile | null> {
  const { data, error } = await supabase().from('profiles').select('*').maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapProfile(data as ProfileRow) : null
}

/** Postgres unique violation on the handle, surfaced as a readable error. */
export class HandleTakenError extends Error {}

export async function updateMyProfile(id: string, patch: ProfilePatch): Promise<MyProfile> {
  const { data, error } = await supabase().from('profiles').update(patch).eq('id', id).select('*').single()
  if (error) {
    // Taken (unique) or reserved (the handle check); other columns are length-limited in the form.
    if (error.code === '23505' || (error.code === '23514' && error.message.includes('handle'))) throw new HandleTakenError(error.message)
    throw new Error(error.message)
  }
  return mapProfile(data as ProfileRow)
}

export async function uploadMyAvatar(id: string, file: File): Promise<string> {
  const { blob, type } = await downscaleImage(file, 512, 0.88)
  const path = `profiles/${id}/avatar-${Date.now()}.${type === 'image/png' ? 'png' : 'jpg'}`
  const sb = supabase()
  const { error } = await sb.storage.from('tournament-assets').upload(path, blob, { upsert: true, contentType: type })
  if (error) throw new Error(error.message)
  return sb.storage.from('tournament-assets').getPublicUrl(path).data.publicUrl
}

export const profileCard = (handle: string) => rpc<ProfileCard | null>('profile_card', { p_handle: handle })
export const searchProfiles = (q: string) => rpc<ProfileHit[]>('search_profiles', { q })
export const myLinks = () => rpc<MyLink[]>('my_links')
export const tournamentProfiles = (tournamentId: string) => rpc<TournamentProfile[]>('tournament_profiles', { tid: tournamentId })
export const linkMyProfile = (playerId: string) => rpc<LinkResult>('link_my_profile', { p_player_id: playerId })
export const unlinkMyProfile = (playerId: string) => rpc<boolean>('unlink_my_profile', { p_player_id: playerId })
export const comiteLinkProfile = (playerId: string, handle: string) => rpc<LinkResult>('comite_link_profile', { p_player_id: playerId, p_handle: handle })
export const comiteUnlinkProfile = (playerId: string) => rpc<void>('comite_unlink_profile', { p_player_id: playerId })
export const redeemLinkToken = (token: string) => rpc<LinkResult>('redeem_link_token', { p_token: token })
export const profileRounds = (handle: string) => rpc<RoundResult[]>('profile_rounds', { p_handle: handle })
export const profileTournaments = (handle: string) => rpc<ProfileTournament[]>('profile_tournaments', { p_handle: handle })
export const myMoney = () => rpc<MoneyLine[]>('my_money')

/** The Comité publishes a finished tournament's results to its players' profiles. */
export function publishTournamentResults(tournamentId: string, rows: PublishRow[], currency: string) {
  return rpc<{ players: number; field: number }>('publish_tournament_results', { p_tournament_id: tournamentId, p_rows: rows, p_currency: currency })
}

export interface IndexBreakdown {
  /** The rounds read (the latest 20 that count), newest first, with whether each is among the ones averaged. */
  considered: Array<{ round: RoundResult; used: boolean }>
  index10: number | null
  count: number
  adjust10: number
}

/** How the Polo index comes out of these rounds: the database's rule, recomputed here to show it. */
export function indexBreakdown(rounds: RoundResult[]): IndexBreakdown {
  const eligible = rounds.filter((r) => !r.practice && r.differential != null).slice(0, 20)
  const r = whsIndex10(eligible.map((x) => Math.round(x.differential! * 10)))
  const rule = whsRule(eligible.length)
  return {
    considered: eligible.map((round, i) => ({ round, used: r.used.includes(i) })),
    index10: r.index10,
    count: rule?.count ?? 0,
    adjust10: rule?.adjust10 ?? 0,
  }
}

/** The player this device holds by PIN, if any (its own row is readable). */
export async function myDeviceClaim(): Promise<{ playerId: string; tournamentId: string } | null> {
  const { data, error } = await supabase().from('device_sessions').select('player_id, tournament_id').maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { playerId: data.player_id, tournamentId: data.tournament_id } : null
}

/** The names of this device's player, to start a profile with. */
export async function claimNameHint(playerId: string): Promise<NameHint | null> {
  const { data } = await supabase().from('players').select('display_name, full_name').eq('id', playerId).maybeSingle()
  return data ? { displayName: data.display_name as string, fullName: (data.full_name as string) ?? null } : null
}

// ---------------------------------------------------------------------------
// Link token: kept across a sign-in (and an OAuth round trip) in this tab
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'cardi-golf:link-token'

interface Stash {
  token: string
  exp: number
  hint: NameHint | null
}

/** Mints a token for this device's claimed player (if it has one) and keeps it, with the player's names, for after the sign-in. */
export async function stashLinkToken(): Promise<boolean> {
  const claim = await myDeviceClaim()
  if (!claim) return false
  const [token, hint] = await Promise.all([rpc<string>('create_link_token'), claimNameHint(claim.playerId)])
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + 14 * 60_000, hint } satisfies Stash))
  } catch {
    return false
  }
  return true
}

/** The stashed player's names (the token stays for `redeemStashedToken`). */
export function stashedNameHint(): NameHint | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    return raw ? ((JSON.parse(raw) as Stash).hint ?? null) : null
  } catch {
    return null
  }
}

/** Redeems a stashed token once, after signing in. Returns the link result, or null when there was none. */
export async function redeemStashedToken(): Promise<LinkResult | null> {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  const { token, exp } = JSON.parse(raw) as Stash
  if (Date.now() > exp) return { ok: false, reason: 'expired' }
  return redeemLinkToken(token)
}

// ---------------------------------------------------------------------------
// The signed-in account's profile, shared by Mi Polo, Más and the editor
// ---------------------------------------------------------------------------
interface MyProfileState {
  profile: MyProfile | null
  links: MyLink[]
  loading: boolean
  error: string | null
  /**
   * Loads the profile and the tournament links. `create` makes the profile
   * when the account has none (Mi Polo, the editor); the shell only reads, so
   * a sign-in flow can create it first with the player's names.
   */
  load(create?: boolean): Promise<void>
  setProfile(p: MyProfile): void
  clear(): void
}

/** Only the latest load applies: a slow earlier read must not overwrite a newer profile. */
let loadSeq = 0

export const useMyProfile = create<MyProfileState>((set) => ({
  profile: null,
  links: [],
  loading: false,
  error: null,
  async load(create = false) {
    const seq = ++loadSeq
    set({ loading: true, error: null })
    try {
      const [profile, links] = await Promise.all([create ? ensureMyProfile() : getMyProfile(), myLinks()])
      if (seq === loadSeq) set({ profile, links, loading: false })
    } catch (e) {
      if (seq === loadSeq) set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },
  setProfile(p) {
    set({ profile: p })
  },
  clear() {
    loadSeq++
    set({ profile: null, links: [], error: null, loading: false })
  },
}))

/** A readable index: one decimal, a plus sign for plus handicaps ("+1.2"). */
export function formatIndex(v: number | null): string {
  if (v == null) return '—'
  return v < 0 ? `+${Math.abs(v).toFixed(1)}` : v.toFixed(1)
}

/** "+1.2" is a plus handicap (stored as −1.2); a comma works as the decimal point. */
export function parseIndex(raw: string): number | null {
  const s = raw.trim().replace(',', '.').replace('−', '-')
  if (!s) return null
  const plus = s.startsWith('+')
  const n = Number(plus ? s.slice(1) : s)
  if (!Number.isFinite(n)) return null
  const v = Math.round((plus ? -n : n) * 10) / 10
  return v >= -10 && v <= 54 ? v : null
}

/** `handle_ok()` in the database, for inline validation. */
export function handleOk(h: string): boolean {
  return /^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$/.test(h) && !/[._]{2}/.test(h)
}

// ---------------------------------------------------------------------------
// A tournament's players → profiles (cached per tournament for this visit)
// ---------------------------------------------------------------------------
const tpCache = new Map<string, Promise<TournamentProfile[]>>()

/** Confirmed profiles of a tournament's players (plus pending ones for the Comité), and a reload. */
export function useTournamentProfiles(tournamentId: string | null): [TournamentProfile[], () => void] {
  const [list, setList] = useState<TournamentProfile[]>([])
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!tournamentId) return
    let live = true
    let p = tpCache.get(tournamentId)
    if (!p) {
      p = tournamentProfiles(tournamentId).catch(() => [])
      tpCache.set(tournamentId, p)
    }
    void p.then((l) => live && setList(l))
    return () => {
      live = false
    }
  }, [tournamentId, n])
  const reload = useCallback(() => {
    if (tournamentId) tpCache.delete(tournamentId)
    setN((x) => x + 1)
  }, [tournamentId])
  return [list, reload]
}
