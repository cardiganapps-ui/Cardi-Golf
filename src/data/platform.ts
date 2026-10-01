/**
 * The Polo platform admin (migration 0021): one account with oversight of
 * every tournament. Who the admin is lives only in the database
 * (`platform_admins`); the client asks `is_platform_admin()` and never
 * compares an email. Every read here is a `platform_*` RPC that refuses
 * anyone else, so hiding the UI is courtesy, not security.
 *
 * Screens get the API through `PlatformApiContext`, so the design fixtures
 * can render the panel without Supabase.
 */
import { createContext, useContext } from 'react'
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/timeout'

export type TournamentStatus = 'setup' | 'auction' | 'live' | 'finished'

export interface PlatformEvent {
  kind: 'tournament' | 'profile' | 'platform'
  at: string
  id: string
  label: string
  quick?: boolean
  handle?: string
  targetKind?: string
  tournamentId?: string | null
  reason?: string | null
}

export interface PlatformOverview {
  accounts: number
  accounts7d: number
  devices: number
  profiles: number
  pushProfiles: number
  tournaments: number
  quickRounds: number
  byStatus: Partial<Record<TournamentStatus, number>>
  live: number
  practice: number
  protected: number
  roundsFinished: number
  rounds30d: number
  scores30d: number
  crews: number
  courses: number
  recent: PlatformEvent[]
}

export interface PlatformDay {
  day: string
  accounts: number
  tournaments: number
  quickRounds: number
  rounds: number
  scores: number
}

export interface PlatformTournamentRow {
  id: string
  slug: string
  name: string
  status: TournamentStatus
  joinCode: string
  logoUrl: string | null
  quick: boolean
  practice: boolean
  protected: boolean
  crewName: string | null
  createdAt: string
  players: number
  rounds: number
  organizers: number
  ownerName: string | null
  ownerEmail: string | null
  lastActivityAt: string | null
}

export interface PlatformTournamentList {
  total: number
  rows: PlatformTournamentRow[]
}

export type TournamentKind = 'real' | 'quick' | 'crew' | 'practice' | 'protected' | 'orphan'

export interface TournamentQuery {
  q?: string
  status?: TournamentStatus | null
  kind?: TournamentKind | null
  limit?: number
  offset?: number
}

export interface PlatformAuditEntry {
  id: number
  at: string
  table: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  platform: boolean
  actor: string | null
  reason: string | null
}

export interface PlatformTournament {
  id: string
  slug: string
  name: string
  tagline: string | null
  logoUrl: string | null
  status: TournamentStatus
  joinCode: string
  quick: boolean
  practice: boolean
  protected: boolean
  createdAt: string
  timezone: string
  currency: string
  crew: { id: string; slug: string; name: string } | null
  unlockedUntil: string | null
  organizers: Array<{ userId: string; role: 'owner' | 'admin'; email: string; name: string; handle: string | null }>
  rounds: Array<{ id: string; number: number; date: string | null; status: string; course: string | null; scores: number }>
  counts: { players: number; linked: number; devices: number; groups: number; payments: number; disputes: number }
  audit: PlatformAuditEntry[]
}

export type PeopleFilter = 'all' | 'accounts' | 'devices' | 'blocked'

export interface PersonRow {
  id: string
  email: string | null
  anonymous: boolean
  provider: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  /** A phone without an account is known by the player it claimed. */
  devicePlayer: string | null
  deviceTournament: string | null
  createdAt: string
  lastSignInAt: string | null
  blocked: boolean
  isAdmin: boolean
  tournaments: number
}

export interface PeopleList {
  total: number
  rows: PersonRow[]
}

export interface PeopleQuery {
  q?: string
  filter?: PeopleFilter
  limit?: number
  offset?: number
}

export interface PersonTournament {
  tournamentId: string
  slug: string
  name: string
  status: TournamentStatus
  quick: boolean
  practice: boolean
  createdAt: string
  role: 'owner' | 'admin' | null
  playerId: string | null
  playerName: string | null
  link: 'confirmed' | 'pending' | 'device' | null
}

export interface Person {
  id: string
  email: string | null
  anonymous: boolean
  provider: string
  providers: string[]
  createdAt: string
  lastSignInAt: string | null
  confirmedAt: string | null
  blocked: boolean
  isAdmin: boolean
  isSelf: boolean
  profile: {
    handle: string
    displayName: string
    fullName: string | null
    avatarUrl: string | null
    homeClub: string | null
    city: string | null
    discoverable: boolean
    index: number | null
    indexSource: 'polo' | 'manual'
    createdAt: string
  } | null
  tournaments: PersonTournament[]
  crews: Array<{ id: string; slug: string; name: string; role: 'owner' | 'member'; members: number }>
  friends: number
  pendingFriends: number
  push: { count: number; hosts: string[] }
  deviceLock: { failed: number; lockedUntil: string | null } | null
  playerLocks: Array<{ playerId: string; name: string; tournament: string; failed: number; lockedUntil: string | null }>
  activity: Array<{ id: number; at: string; action: string; reason: string | null }>
}

export interface DeletePreview {
  orphaned: Array<{ id: string; name: string }>
  organizerOf: number
  linkedPlayers: number
  crewsHanded: string[]
  crewsDeleted: string[]
  friendships: number
  rivalries: number
  notifications: number
  push: number
  hasProfile: boolean
}

export type CourseFilter = 'all' | 'unused' | 'dupes' | 'broken'

export interface CourseRow {
  id: string
  name: string
  location: string | null
  source: string
  createdAt: string
  creatorEmail: string | null
  tees: number
  rounds: number
  tournaments: number
  dupeKey: string
  /** How many other courses look like the same one. */
  dupes: number
  broken: boolean
}

export type TeeProblem = 'holes' | 'par' | 'si'

export interface CourseTee {
  id: string
  name: string
  color: string | null
  rating: number | null
  slope: number | null
  parTotal: number | null
  problems: TeeProblem[]
  /** Rounds and players' default tees that point at it. */
  inUse: number
  holes: Array<{ n: number; par: number; si: number }>
}

export interface PlatformCourse {
  id: string
  name: string
  location: string | null
  source: string
  attribution: string | null
  website: string | null
  createdAt: string
  creatorEmail: string | null
  tees: CourseTee[]
  usedBy: Array<{ tournamentId: string; name: string; status: TournamentStatus; protected: boolean; rounds: number }>
  dupes: Array<{ id: string; name: string; location: string | null; rounds: number }>
}

export interface CrewRow {
  id: string
  slug: string
  name: string
  createdAt: string
  ownerName: string | null
  members: number
  outings: number
  lastOutingAt: string | null
}

export interface PlatformCrew {
  id: string
  slug: string
  name: string
  joinCode: string
  createdAt: string
  ownerId: string
  members: Array<{ profileId: string; handle: string; displayName: string; avatarUrl: string | null; role: 'owner' | 'member'; joinedAt: string }>
  outings: Array<{ tournamentId: string; name: string; status: TournamentStatus; quick: boolean; practice: boolean; createdAt: string }>
  activity: Array<{ id: number; at: string; action: string; reason: string | null }>
}

export interface AppFlags {
  newAccountsPaused: boolean
  newTournamentsPaused: boolean
  maintenanceBanner: string | null
  /** The oldest build allowed to send writes (`BUILD.id`); absent or null: any. */
  minBuild?: number | null
}

export interface Audience {
  profiles: number
  push: number
  /** Notices to everyone in the last 24 hours (two allowed). */
  sentToday: number
  recent: Array<{ id: number; at: string; title: string; body: string; to: string | null; toName: string | null; count: number }>
}

export interface AuditItem {
  source: 'platform' | 'comite'
  id: number
  at: string
  action: string
  targetKind?: string
  targetId?: string | null
  table?: string
  rowId?: string
  tournamentId: string | null
  tournament: string | null
  reason: string | null
  actor: string | null
  /** Panel actions: what it was about (a notice's title, a name, an email) when the reason does not say. */
  detail?: string | null
}

export interface AuditDetail {
  source: 'platform' | 'comite'
  id: number
  at: string
  action: string
  targetKind?: string
  targetId?: string | null
  table?: string
  tournamentId: string | null
  reason: string | null
  payload?: Record<string, unknown> | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

export interface Health {
  backup: {
    last: { at: string; ok: boolean; key: string | null; bytes: number | null; tables: number | null; rows: number | null; error: string | null } | null
    lastOk: { at: string; key: string | null; bytes: number | null; tables: number | null; rows: number | null } | null
    week: { ok: number; failed: number }
  }
  push: { configured: boolean | null; subscriptions: number; profiles: number; recent: { total: number; failed: number; since: string | null } | null }
  database: { lastMigration: { name: string; at: string } | null; notifications24h: number }
  people: { blocked: number; deviceLocks: number; playerLocks: number }
  flags: AppFlags
}

export interface PlatformApi {
  overview(): Promise<PlatformOverview>
  daily(days: number): Promise<PlatformDay[]>
  tournaments(q: TournamentQuery): Promise<PlatformTournamentList>
  tournament(id: string): Promise<PlatformTournament | null>
  unlock(tournamentId: string, reason: string, minutes?: number): Promise<string>
  relock(tournamentId: string): Promise<void>
  setProtected(tournamentId: string, on: boolean, reason?: string): Promise<void>
  people(q: PeopleQuery): Promise<PeopleList>
  person(id: string): Promise<Person | null>
  deletePreview(id: string): Promise<DeletePreview>
  block(id: string, reason: string): Promise<void>
  unblock(id: string, reason: string): Promise<void>
  deleteAccount(id: string, confirm: string, reason: string): Promise<void>
  resetPinLock(target: { userId?: string; playerId?: string }, reason: string): Promise<void>
  setOrganizer(tournamentId: string, userId: string, role: 'owner' | 'admin' | null, reason: string): Promise<void>
  /** The Comité's own RPC; the admin is Comité everywhere. */
  unlinkPlayer(playerId: string): Promise<void>
  courses(q: { q?: string; filter?: CourseFilter; limit?: number; offset?: number }): Promise<{ total: number; rows: CourseRow[] }>
  course(id: string): Promise<PlatformCourse | null>
  /** Recompute the finished rounds played on it; returns how many. */
  refreshCourse(id: string): Promise<number>
  mergeCourses(keepId: string, dropId: string, teeMap: Record<string, string>, reason: string): Promise<{ rounds: number; refreshed: number }>
  deleteCourse(id: string, reason: string): Promise<void>
  crews(q: { q?: string; limit?: number; offset?: number }): Promise<{ total: number; rows: CrewRow[] }>
  crew(id: string): Promise<PlatformCrew | null>
  removeCrewMember(crewId: string, profileId: string, reason: string): Promise<'removed' | 'handed' | 'deleted'>
  deleteCrew(crewId: string, confirmName: string, reason: string): Promise<void>
  audience(): Promise<Audience>
  /** To everyone (to = null) or one profile; returns how many it reached. */
  broadcast(title: string, body: string, to: string | null, url: string | null): Promise<number>
  audit(q: { source?: 'all' | 'platform' | 'comite'; before?: string | null; q?: string; limit?: number }): Promise<AuditItem[]>
  auditEntry(source: 'platform' | 'comite', id: number): Promise<AuditDetail | null>
  health(): Promise<Health>
  setFlag(key: 'new_accounts_paused' | 'new_tournaments_paused' | 'maintenance_banner', value: boolean | string | null, reason: string): Promise<AppFlags>
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

const TZ = 'America/Mazatlan'

export const supabasePlatformApi: PlatformApi = {
  overview: () => rpc<PlatformOverview>('platform_overview'),
  daily: (days) => rpc<PlatformDay[]>('platform_daily', { p_days: days, p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || TZ }),
  tournaments: ({ q, status, kind, limit = 50, offset = 0 }) =>
    rpc<PlatformTournamentList>('platform_tournaments', {
      p_q: q?.trim() || null,
      p_status: status ?? null,
      p_kind: kind ?? null,
      p_limit: limit,
      p_offset: offset,
    }),
  tournament: (id) => rpc<PlatformTournament | null>('platform_tournament', { p_tournament_id: id }),
  unlock: (tournamentId, reason, minutes = 30) => rpc<string>('platform_unlock', { p_tournament_id: tournamentId, p_reason: reason, p_minutes: minutes }),
  relock: (tournamentId) => rpc<void>('platform_relock', { p_tournament_id: tournamentId }),
  setProtected: (tournamentId, on, reason) =>
    rpc<void>('set_tournament_protected', { p_tournament_id: tournamentId, p_on: on, p_reason: reason ?? null }),
  people: ({ q, filter = 'all', limit = 50, offset = 0 }) =>
    rpc<PeopleList>('platform_people', { p_q: q?.trim() || null, p_filter: filter, p_limit: limit, p_offset: offset }),
  person: (id) => rpc<Person | null>('platform_person', { p_user_id: id }),
  deletePreview: (id) => rpc<DeletePreview>('platform_delete_preview', { p_user_id: id }),
  block: (id, reason) => rpc<void>('platform_block', { p_user_id: id, p_reason: reason }),
  unblock: (id, reason) => rpc<void>('platform_unblock', { p_user_id: id, p_reason: reason }),
  deleteAccount: async (id, confirm, reason) => {
    await rpc('platform_delete_account', { p_user_id: id, p_confirm: confirm, p_reason: reason })
  },
  resetPinLock: ({ userId, playerId }, reason) =>
    rpc<void>('platform_reset_pin_lock', { p_user_id: userId ?? null, p_player_id: playerId ?? null, p_reason: reason }),
  setOrganizer: (tournamentId, userId, role, reason) =>
    rpc<void>('platform_set_organizer', { p_tournament_id: tournamentId, p_user_id: userId, p_role: role, p_reason: reason }),
  unlinkPlayer: (playerId) => rpc<void>('comite_unlink_profile', { p_player_id: playerId }),
  courses: ({ q, filter = 'all', limit = 50, offset = 0 }) =>
    rpc('platform_courses', { p_q: q?.trim() || null, p_filter: filter, p_limit: limit, p_offset: offset }),
  course: (id) => rpc<PlatformCourse | null>('platform_course', { p_course_id: id }),
  refreshCourse: (id) => rpc<number>('platform_refresh_course_results', { p_course_id: id }),
  mergeCourses: (keepId, dropId, teeMap, reason) => rpc('platform_merge_courses', { p_keep: keepId, p_drop: dropId, p_tee_map: teeMap, p_reason: reason }),
  deleteCourse: (id, reason) => rpc<void>('platform_delete_course', { p_course_id: id, p_reason: reason }),
  crews: ({ q, limit = 50, offset = 0 }) => rpc('platform_crews', { p_q: q?.trim() || null, p_limit: limit, p_offset: offset }),
  crew: (id) => rpc<PlatformCrew | null>('platform_crew', { p_crew_id: id }),
  removeCrewMember: (crewId, profileId, reason) => rpc('platform_crew_remove_member', { p_crew_id: crewId, p_profile_id: profileId, p_reason: reason }),
  deleteCrew: (crewId, confirmName, reason) => rpc<void>('platform_delete_crew', { p_crew_id: crewId, p_confirm: confirmName, p_reason: reason }),
  audience: () => rpc<Audience>('platform_audience'),
  broadcast: (title, body, to, url) => rpc<number>('platform_broadcast', { p_title: title, p_body: body, p_to: to, p_url: url }),
  audit: ({ source = 'all', before = null, q, limit = 50 }) =>
    rpc<AuditItem[]>('platform_audit', { p_source: source, p_before: before, p_q: q?.trim() || null, p_limit: limit }),
  auditEntry: (source, id) => rpc<AuditDetail | null>('platform_audit_entry', { p_source: source, p_id: id }),
  health: () => rpc<Health>('platform_health'),
  setFlag: (key, value, reason) => rpc<AppFlags>('platform_set_flag', { p_key: key, p_value: value, p_reason: reason }),
}

/**
 * The switches everyone sees (app_flags): the maintenance banner, and why
 * creating an account or a tournament may be refused. Loaded once by
 * AppShell; a slow answer never holds the app up.
 */
export const useAppFlags = create<{ flags: AppFlags | null; load(): Promise<void>; set(f: AppFlags): void }>((set) => ({
  flags: null,
  async load() {
    try {
      set({ flags: await withTimeout(rpc<AppFlags>('app_flags'), 5000, 'avisos') })
    } catch {
      // No banner is better than a stuck app.
    }
  },
  set: (flags) => set({ flags }),
}))

/**
 * The tee each tee of a dropped course should become: the kept tee with the
 * same card (par and stroke index on every hole), preferring the same name.
 * The server re-checks; this only pre-fills the merge sheet.
 */
export function suggestTeeMap(drop: CourseTee[], keep: CourseTee[]): Record<string, string> {
  const card = (t: CourseTee) => t.holes.map((h) => `${h.par}/${h.si}`).join(',')
  const out: Record<string, string> = {}
  for (const d of drop) {
    const same = keep.filter((k) => card(k) === card(d))
    const pick = same.find((k) => k.name.trim().toLowerCase() === d.name.trim().toLowerCase()) ?? same[0]
    if (pick) out[d.id] = pick.id
  }
  return out
}

/** Whether two tees score the same: same number of holes, same par and stroke index on each. */
export function sameCard(a: CourseTee, b: CourseTee): boolean {
  return a.holes.length === b.holes.length && a.holes.every((h, i) => h.par === b.holes[i]?.par && h.si === b.holes[i]?.si && h.n === b.holes[i]?.n)
}

export const PlatformApiContext = createContext<PlatformApi>(supabasePlatformApi)
export const usePlatformApi = () => useContext(PlatformApiContext)

interface PlatformState {
  /** null until asked: an unknown answer must not flash the section or a «no encontrado». */
  isAdmin: boolean | null
  load(): Promise<void>
  clear(): void
}

/** Is this account the platform admin? Loaded by AppShell when the account changes. */
export const usePlatform = create<PlatformState>((set, get) => ({
  isAdmin: null,
  async load() {
    // A "no" from before the account signed in is stale: back to unknown, so
    // /admin waits instead of saying «no encontrado» for a moment.
    if (get().isAdmin === false) set({ isAdmin: null })
    try {
      const yes = await withTimeout(rpc<boolean>('is_platform_admin'), 8000, 'admin')
      set({ isAdmin: yes === true })
    } catch {
      set({ isAdmin: false })
    }
  },
  clear() {
    set({ isAdmin: false })
  },
}))
