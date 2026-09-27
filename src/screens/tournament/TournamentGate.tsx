/**
 * `/t/:slug`: looks the tournament up, ensures a session (anonymous if
 * needed), and either shows Entrar (face grid + PIN) or renders the shell
 * with the tournament store loaded.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Spinner } from '../../components/ui'
import { Wordmark } from '../../components/Wordmark'
import { ensureSession, useAuth } from '../../data/auth'
import { isOrganizerOf, lookupTournament, myDeviceSession, releaseDevice, type LookupResult } from '../../data/api'
import { setLastTournament } from '../../data/session'
import { useTournament } from '../../data/tournamentStore'
import { supabaseConfigured } from '../../lib/supabase'
import { EnterScreen } from './EnterScreen'

export interface Me {
  playerId: string | null
  isOrganizer: boolean
  /** Organizer account or admin player: may use the Comité console. */
  isAdmin: boolean
}

export interface TournamentCtx {
  tournamentId: string
  slug: string
  lookup: LookupResult
  me: Me
  refresh(): Promise<void>
  leave(): Promise<void>
}

const Ctx = createContext<TournamentCtx | null>(null)
/** Exported for the design fixtures (`src/dev/FixtureGate`), which provide a fake tournament without Supabase. */
export const TournamentContext = Ctx
export function useTournamentCtx(): TournamentCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTournamentCtx outside TournamentGate')
  return c
}

type Phase = { kind: 'loading' } | { kind: 'notFound' } | { kind: 'error'; message: string } | { kind: 'enter'; lookup: LookupResult } | { kind: 'in'; lookup: LookupResult; me: Me }

export function TournamentGate() {
  const { slug = '' } = useParams()
  const authReady = useAuth((s) => s.ready)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const load = useTournament((s) => s.load)
  const data = useTournament((s) => s.data)
  const storeError = useTournament((s) => s.error)

  const resolve = useCallback(async () => {
    if (!supabaseConfigured) {
      setPhase({ kind: 'error', message: t.errors.missingEnv })
      return
    }
    try {
      await ensureSession()
      const lookup = await lookupTournament(slug)
      if (!lookup) {
        setPhase({ kind: 'notFound' })
        return
      }
      const [device, organizer] = await Promise.all([myDeviceSession(), isOrganizerOf(lookup.id)])
      const linked = device && device.tournamentId === lookup.id ? device.playerId : null
      if (organizer || linked) {
        const adminPlayer = linked ? lookup.players.find((p) => p.id === linked) : null
        void adminPlayer
        setPhase({ kind: 'in', lookup, me: { playerId: linked, isOrganizer: organizer, isAdmin: organizer } })
        setLastTournament({ slug: lookup.slug, name: lookup.name })
        await load(lookup.id)
      } else {
        setPhase({ kind: 'enter', lookup })
      }
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [slug, load])

  useEffect(() => {
    if (authReady) void resolve()
  }, [authReady, resolve])

  // Admin flag for linked players comes from the loaded snapshot (is_admin).
  useEffect(() => {
    if (phase.kind !== 'in' || !data || !phase.me.playerId) return
    const p = data.snapshot.players.find((x) => x.id === phase.me.playerId)
    const isAdmin = phase.me.isOrganizer || !!p?.isAdmin
    if (isAdmin !== phase.me.isAdmin) setPhase({ ...phase, me: { ...phase.me, isAdmin } })
  }, [phase, data])

  const leave = useCallback(async () => {
    await releaseDevice()
    setLastTournament(null)
    await resolve()
  }, [resolve])

  if (phase.kind === 'loading') {
    return (
      <div className="screen">
        <Wordmark />
        <Spinner />
      </div>
    )
  }
  if (phase.kind === 'notFound') {
    return (
      <div className="screen">
        <Wordmark />
        <h1>{t.enter.title}</h1>
        <p className="muted">{t.enter.notFound}</p>
        <Link className="btn btn--secondary" to="/">
          {t.errors.backHome}
        </Link>
      </div>
    )
  }
  if (phase.kind === 'error') {
    return (
      <div className="screen">
        <Wordmark />
        <ErrorBox message={phase.message} onRetry={() => void resolve()} />
      </div>
    )
  }
  if (phase.kind === 'enter') {
    return <EnterScreen lookup={phase.lookup} onEntered={() => void resolve()} />
  }
  if (storeError && !data) {
    return (
      <div className="screen">
        <Wordmark />
        <ErrorBox message={storeError} onRetry={() => void load(phase.lookup.id)} />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="screen">
        <Wordmark />
        <Spinner />
      </div>
    )
  }
  return (
    <Ctx.Provider value={{ tournamentId: phase.lookup.id, slug, lookup: phase.lookup, me: phase.me, refresh: resolve, leave }}>
      <Outlet />
    </Ctx.Provider>
  )
}
