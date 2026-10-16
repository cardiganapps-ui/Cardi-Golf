/**
 * Crews (migration 0018): the group you always play with. Joined by code,
 * each with its outings and a season table computed from the published
 * results (src/engine/profile/season.ts).
 */
import { supabase } from '../lib/supabase'
import { ApiError } from './api'
import type { SeasonResult } from '../engine/profile/season'

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

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error) throw ApiError.from(error)
  return data as T
}

export const myCrews = () => rpc<MyCrew[]>('my_crews')
export const createCrew = (name: string) => rpc<{ id: string; slug: string; joinCode: string }>('create_crew', { p_name: name })
export const crewPreview = (code: string) => rpc<{ name: string; slug: string; members: number; isMember: boolean; approval?: boolean; requested?: boolean } | null>('crew_preview', { p_code: code })
/** The crew's slug, or null for a code that doesn't exist. */
export const joinCrew = (code: string) => rpc<string | null>('join_crew', { p_code: code })
/** Joins by code, or leaves a request when the crew approves who enters (0071). */
export const joinCrewRequest = (code: string) => rpc<{ status: 'joined' | 'requested' | 'invalid'; slug?: string }>('join_crew_request', { p_code: code })
/** The owner lets a request in, or declines it. */
export const respondCrewRequest = (crewId: string, handle: string, accept: boolean) => rpc<void>('crew_respond', { p_crew_id: crewId, p_handle: handle, p_accept: accept })
/** The owner takes a member out (never himself: that is leaving). */
export const removeCrewMember = (crewId: string, handle: string) => rpc<void>('crew_remove_member', { p_crew_id: crewId, p_handle: handle })
/** The owner turns «Aprobar solicitudes» on or off. */
export const setCrewApproval = (crewId: string, on: boolean) => rpc<void>('set_crew_approval', { p_crew_id: crewId, p_on: on })
export const leaveCrew = (id: string) => rpc<void>('leave_crew', { p_crew_id: id })
/** A new code; `days`: good for that many days (1 to 90), or with no end (null). */
export const rotateCrewCode = (id: string, days: number | null = null) => rpc<string>('rotate_crew_code', { p_crew_id: id, ...(days != null ? { p_valid_days: days } : {}) })
export const crewPage = (slug: string) => rpc<CrewPage | null>('crew_page', { p_slug: slug })
export const setTournamentCrew = (tournamentId: string, crewId: string | null) => rpc<void>('set_tournament_crew', { p_tournament_id: tournamentId, p_crew_id: crewId })
