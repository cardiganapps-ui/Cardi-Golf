/**
 * Crews (migration 0018): the group you always play with. Joined by code,
 * each with its outings and a season table computed from the published
 * results (src/engine/profile/season.ts).
 */
import type { SeasonResult } from '../engine/profile/season'
import { rpc } from './rpc'

export interface MyCrew {
  id: string
  slug: string
  name: string
  role: 'owner' | 'member'
  members: number
}

export interface CrewMember {
  handle: string
  displayName: string
  avatarUrl: string | null
  index: number | null
  role: 'owner' | 'member'
  joinedAt: string
}

export interface CrewOuting {
  tournamentId: string
  slug: string
  name: string
  status: 'setup' | 'auction' | 'live' | 'finished'
  quick: boolean
  practice: boolean
  date: string | null
  players: number
}

/** Someone who asked to enter a crew that approves who enters (0071, TRUST-11); only its owner sees them. */
export interface CrewRequest {
  handle: string
  displayName: string
  avatarUrl: string | null
  at: string
}

export interface CrewPage {
  crew: {
    id: string
    slug: string
    name: string
    joinCode: string
    role: 'owner' | 'member'
    createdAt: string
    /** «Aprobar solicitudes» (0071): the code leaves a request instead of letting anyone in. Absent before 0071. */
    approval?: boolean
    /** When the code stops working (null: never), and whether it already did. */
    codeExpiresAt?: string | null
    codeExpired?: boolean
  }
  members: CrewMember[]
  /** Who waits to enter: to the owner only, empty for everyone else. */
  requests?: CrewRequest[]
  outings: CrewOuting[]
  results: SeasonResult[]
}

export const myCrews = () => rpc('my_crews').as<MyCrew[]>()
export const createCrew = (name: string) => rpc('create_crew', { p_name: name }).as<{ id: string; slug: string; joinCode: string }>()
export const crewPreview = (code: string) => rpc('crew_preview', { p_code: code }).as<{ name: string; slug: string; members: number; isMember: boolean; approval?: boolean; requested?: boolean } | null>()
/** The crew's slug, or null for a code that doesn't exist. */
export const joinCrew = (code: string) => rpc('join_crew', { p_code: code }).as<string | null>()
/** Joins by code, or leaves a request when the crew approves who enters (0071). */
export const joinCrewRequest = (code: string) => rpc('join_crew_request', { p_code: code }).as<{ status: 'joined' | 'requested' | 'invalid'; slug?: string }>()
/** The owner lets a request in, or declines it. */
export const respondCrewRequest = (crewId: string, handle: string, accept: boolean) => rpc('crew_respond', { p_crew_id: crewId, p_handle: handle, p_accept: accept })
/** The owner takes a member out (never himself: that is leaving). */
export const removeCrewMember = (crewId: string, handle: string) => rpc('crew_remove_member', { p_crew_id: crewId, p_handle: handle })
/** The owner turns «Aprobar solicitudes» on or off. */
export const setCrewApproval = (crewId: string, on: boolean) => rpc('set_crew_approval', { p_crew_id: crewId, p_on: on })
export const leaveCrew = (id: string) => rpc('leave_crew', { p_crew_id: id })
/** A new code; `days`: good for that many days (1 to 90), or with no end (null). */
export const rotateCrewCode = (id: string, days: number | null = null) => rpc('rotate_crew_code', { p_crew_id: id, ...(days != null ? { p_valid_days: days } : {}) })
export const crewPage = (slug: string) => rpc('crew_page', { p_slug: slug }).as<CrewPage | null>()
export const setTournamentCrew = (tournamentId: string, crewId: string | null) => rpc('set_tournament_crew', { p_tournament_id: tournamentId, p_crew_id: crewId })
