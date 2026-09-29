/**
 * Crews (migration 0018): the group you always play with. Joined by code,
 * each with its outings and a season table computed from the published
 * results (src/engine/profile/season.ts).
 */
import { supabase } from '../lib/supabase'
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

export interface CrewPage {
  crew: { id: string; slug: string; name: string; joinCode: string; role: 'owner' | 'member'; createdAt: string }
  members: CrewMember[]
  outings: CrewOuting[]
  results: SeasonResult[]
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const myCrews = () => rpc<MyCrew[]>('my_crews')
export const createCrew = (name: string) => rpc<{ id: string; slug: string; joinCode: string }>('create_crew', { p_name: name })
export const crewPreview = (code: string) => rpc<{ name: string; slug: string; members: number; isMember: boolean } | null>('crew_preview', { p_code: code })
/** The crew's slug, or null for a code that doesn't exist. */
export const joinCrew = (code: string) => rpc<string | null>('join_crew', { p_code: code })
export const leaveCrew = (id: string) => rpc<void>('leave_crew', { p_crew_id: id })
export const rotateCrewCode = (id: string) => rpc<string>('rotate_crew_code', { p_crew_id: id })
export const crewPage = (slug: string) => rpc<CrewPage | null>('crew_page', { p_slug: slug })
export const setTournamentCrew = (tournamentId: string, crewId: string | null) => rpc<void>('set_tournament_crew', { p_tournament_id: tournamentId, p_crew_id: crewId })
