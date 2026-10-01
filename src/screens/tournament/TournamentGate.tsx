/**
 * `/t/:slug`: looks the tournament up, ensures a session (anonymous if
 * needed), and either shows Entrar (face grid + PIN) or renders the shell
 * with the tournament store loaded.
 *
 * Cache first (PERF-08, REL-03, REL-15): a phone that has opened this
 * tournament before shows the boards it saved at once, and the live
 * tournament (session, lookup, membership, snapshot) resolves behind them.
 * Opening on the course used to wait on five round trips with signal, 16 s
 * with no signal and an expired token, and for ever on a connection that
 * answers nothing. Until the server's snapshot is on screen the gate keeps
 * trying, on reconnect, on return to the app and on a timer (REL-02).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Spinner } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { Wordmark } from '../../components/Wordmark'
import { ensureSession, useAuth } from '../../data/auth'
import { lookupTournament, myMembership, releaseDevice, type LookupResult } from '../../data/api'
import { setLastTournament } from '../../data/session'
import { clearCached, readCached, saveEntry } from '../../data/snapshotCache'
import { adoptQueuedWrites, refreshOutboxCounters } from '../../data/outbox'
import { useTournament } from '../../data/tournamentStore'
import { supabaseConfigured } from '../../lib/supabase'
import { EnterScreen } from './EnterScreen'

export interface Me {
  playerId: string | null
  isOrganizer: boolean
  /** Organizer account or admin player: may use the Comité console. */
  isAdmin: boolean
  /**
   * How this session is in the tournament: its profile's confirmed link, this
   * device's PIN, or 'platform' — the Polo admin visiting a tournament he does
   * not belong to (read always; Comité unless it is Protegido and locked).
   */
  via?: 'profile' | 'device' | 'platform' | null
  /** Protegido: nobody deletes it; the platform admin needs an unlock to write. */
  protected?: boolean
  /** Platform visits: until when the admin's unlock lasts (ISO), if unlocked. */
  unlockedUntil?: string | null
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

/** While the boards come from the cache, try the live tournament again this often. */
const CACHE_RETRY_MS = 20_000

type Phase = { kind: 'loading' } | { kind: 'notFound' } | { kind: 'error'; error: unknown } | { kind: 'enter'; lookup: LookupResult } | { kind: 'in'; lookup: LookupResult; me: Me }

export function TournamentGate() {
  const { slug = '' } = useParams()
  const authReady = useAuth((s) => s.ready)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const load = useTournament((s) => s.load)
  const data = useTournament((s) => s.data)
  const storeError = useTournament((s) => s.error)
  /** The server has answered who this device is here (in, Entrar, not found): a cache read that lands later changes nothing. */
  const settled = useRef(false)

  /** Enter with the last snapshot this device saved for the slug (§8): at once on open, and whenever the server can't be reached. */
  const enterFromCache = useCallback(
    async (expectedId?: string): Promise<boolean> => {
      const cached = await readCached(slug)
      if (!cached || (expectedId && cached.entry.tournamentId !== expectedId)) return false
      useTournament.getState().seed(cached.entry.tournamentId, cached.snapshot, cached.savedAt)
      refreshOutboxCounters()
      setPhase((p) => (p.kind === 'in' && p.lookup.id === cached.entry.tournamentId ? p : { kind: 'in', lookup: cached.entry.lookup, me: cached.entry.me }))
      return true
    },
    [slug],
  )

  // The saved boards first, before the session is even confirmed.
  useEffect(() => {
    settled.current = false
    void (async () => {
      const cached = await readCached(slug)
      if (cached && !settled.current) await enterFromCache(cached.entry.tournamentId)
    })()
  }, [slug, enterFromCache])

  const resolve = useCallback(async () => {
    if (!supabaseConfigured) {
      setPhase({ kind: 'error', error: t.errors.missingEnv })
      return
    }
    try {
      await ensureSession()
      const lookup = await lookupTournament(slug)
      if (!lookup) {
        settled.current = true
        void clearCached(slug)
        setPhase({ kind: 'notFound' })
        return
      }
      const m = await myMembership(lookup.id)
      const platform = m.via === 'platform'
      if (m.isOrganizer || m.playerId || platform) {
        const me: Me = {
          playerId: m.playerId,
          isOrganizer: m.isOrganizer,
          isAdmin: m.isAdmin,
          via: m.via,
          protected: !!m.protected,
          unlockedUntil: m.unlockedUntil ?? null,
        }
        settled.current = true
        setPhase({ kind: 'in', lookup, me })
        // Writes this phone queued under an earlier session belong to this player again (REL-16).
        if (m.playerId || m.isOrganizer) void adoptQueuedWrites(lookup.id)
        // A platform visit is not "my tournament": it is not where home
        // returns to, and it is not kept on the device for offline use.
        if (!platform) {
          setLastTournament({ slug: lookup.slug, name: lookup.name })
          void saveEntry({ slug, tournamentId: lookup.id, lookup, me })
        }
        await load(lookup.id)
        refreshOutboxCounters()
        // The lookup worked but the snapshot did not: still better to show what we have.
        if (!useTournament.getState().data) await enterFromCache(lookup.id)
      } else {
        // Not in this tournament any more (the device was released, the link removed): its saved boards go too.
        settled.current = true
        void clearCached(slug)
        setPhase({ kind: 'enter', lookup })
      }
    } catch (e) {
      if (await enterFromCache()) return
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      setPhase({ kind: 'error', error: offline ? t.errors.offlineFirstOpen : e })
    }
  }, [slug, load, enterFromCache])

  useEffect(() => {
    if (authReady) void resolve()
  }, [authReady, resolve])

  // While the boards on screen are the phone's copy, resolve for real (session,
  // role, live snapshot, Realtime): on reconnect, on return to the app, and on
  // a timer, since the stored session can stay unconfirmed for a while after
  // the signal returns (auth-js cools down after a failed refresh) and `online`
  // fires only once (REL-16). Until the server's snapshot is on screen, not
  // just until the session is back: a lookup that worked and a snapshot that
  // didn't used to end the retries and leave the old boards up (REL-02).
  useEffect(() => {
    let busy = false
    const retry = async () => {
      const store = useTournament.getState()
      if (busy || !store.data || store.source === 'server') return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      busy = true
      try {
        await resolve()
      } finally {
        busy = false
      }
    }
    const timer = setInterval(() => void retry(), CACHE_RETRY_MS)
    const onOnline = () => void retry()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onOnline)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onOnline)
    }
  }, [resolve])

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
    // The boards this phone saved belong to the player who just left.
    await clearCached(slug)
    await resolve()
  }, [resolve, slug])

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
        <EmptyState
          title={t.enter.notFound}
          body={t.errors.notFoundHint}
          action={
            <Link className="btn btn--secondary" to="/">
              {t.errors.backHome}
            </Link>
          }
        />
      </div>
    )
  }
  if (phase.kind === 'error') {
    return (
      <div className="screen">
        <Wordmark />
        <ErrorBox error={phase.error} onRetry={() => void resolve()} />
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
        <ErrorBox error={storeError} onRetry={() => void load(phase.lookup.id)} />
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
