/**
 * What a tournament's screens know about it and about this device (`useTournamentCtx`): provided by the gate
 * (`/t/:slug`), the link to watch's gate and the design fixtures. Apart from TournamentGate.tsx so the
 * modules every first load carries can read it without the gate itself (PERF-02).
 */
import { createContext, useContext } from 'react'
import type { LookupResult } from '../../data/api'
import type { Me } from '../../data/session'

export type { Me }

export interface TournamentCtx {
  tournamentId: string
  slug: string
  lookup: LookupResult
  me: Me
  /** Ask the server again who this device is here, and load the tournament: a new ask (after a link changed, say). */
  refresh(): Promise<void>
  /**
   * «Actualizar» before the live tournament is on screen (PWA-15): the ask already under way, or a new one
   * now. Without it (the design fixtures), `refresh`.
   */
  retry?(): Promise<void>
  leave(): Promise<void>
  /** Where this tournament's screens live, when not `/t/<slug>`: a link to watch's `/v/<token>`. */
  base?: string
  /**
   * Opened with a link to watch (STRAT-05, 0053): read-only, no session, no
   * PIN. `money`: the link shows money («Con dinero»); `url`: the link itself,
   * which what is shared from here carries.
   */
  spectator?: { money: boolean; url: string }
}

const Ctx = createContext<TournamentCtx | null>(null)
/** The gate provides it; so do the link to watch's gate and the design fixtures (`src/dev/FixtureGate`, with no Supabase). */
export const TournamentContext = Ctx
export function useTournamentCtx(): TournamentCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTournamentCtx outside TournamentGate')
  return c
}
