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
 * answers nothing. Until the server has answered and its snapshot is on
 * screen the gate keeps trying: on reconnect, on return to the app, soon
 * after an ask that failed, and on a timer (REL-02).
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Spinner } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { Wordmark } from '../../components/Wordmark'
import { ensureSession, signedOutOnPurpose, signOutsAsked, useAuth } from '../../data/auth'
import { lookupTournament, myMembership, releaseDevice, type LookupResult } from '../../data/api'
import { myDeviceClaim } from '../../data/profiles'
import { setLastTournament } from '../../data/session'
import { clearCached, clearCachedSlug, readCached, saveEntry } from '../../data/snapshotCache'
import { adoptQueuedWrites, refreshOutboxCounters, rejectGoneTournament } from '../../data/outbox'
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

/** Until the server has answered and its boards are up, ask again this often. */
const CACHE_RETRY_MS = 20_000
/** After an ask that failed with signal, the next one comes this soon, doubling up to CACHE_RETRY_MS. */
const RETRY_SOON_MS = 2_000

/** `dropped`: writes this phone still had for the tournament that is gone, moved to the rejected list. */
type Phase = { kind: 'loading' } | { kind: 'notFound'; dropped: number } | { kind: 'error'; error: unknown } | { kind: 'enter'; lookup: LookupResult } | { kind: 'in'; lookup: LookupResult; me: Me }

export function TournamentGate() {
  const { slug = '' } = useParams()
  const authReady = useAuth((s) => s.ready)
  const uid = useAuth((s) => s.user?.id ?? null)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const load = useTournament((s) => s.load)
  const data = useTournament((s) => s.data)
  const storeError = useTournament((s) => s.error)
  /** The server has answered who this device is here (in, Entrar, not found): a cache read that lands later changes nothing. */
  const settled = useRef(false)
  /** The link whose copy may still be shown: a read for another one (the player moved on) lands on nothing. */
  const openSlug = useRef<string | null>(null)
  /** Each resolve's number: only the newest one's answers count (a retry still out when the PIN went in sent the player back to Entrar). */
  const resolveSeq = useRef(0)
  /** The device lost or changed who it is since the server last answered: ask until it answers again (REL-16). */
  const recheck = useRef(false)
  /** Asks still out: a retry never starts over one (on a slow connection the timer would throw away an ask nearly done). */
  const asking = useRef(0)
  /** Asks that failed in a row with signal, and the retry they scheduled. */
  const failures = useRef(0)
  const soon = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** The retry below, for the asks that schedule it. */
  const retryNow = useRef<() => void>(() => undefined)
  /** The phase, for the retries, which run outside render: kept at commit, so an event right after it sees it. */
  const phaseNow = useRef(phase)
  useLayoutEffect(() => {
    phaseNow.current = phase
  }, [phase])
  /**
   * The sign-outs asked for before this gate opened: one asked for while it is
   * open ends its retries (below), whatever link it shows by then. A sign-out
   * takes the phone home, so a gate opened afterwards counts from there.
   */
  const signOutsAtOpen = useRef(signOutsAsked())

  /**
   * Show the boards this phone saved for the link (§8): at once on open, and
   * whenever the server can't be reached. Never over what the server said: an
   * answer that landed while the copy was being read stands (a released
   * device stays on Entrar), and boards already up stay.
   */
  const enterFromCache = useCallback(async (): Promise<boolean> => {
    const cached = await readCached(slug)
    if (!cached || settled.current || openSlug.current !== slug) return false
    useTournament.getState().seed(cached.entry.tournamentId, cached.snapshot, cached.savedAt)
    refreshOutboxCounters()
    setPhase((p) => (p.kind === 'loading' || p.kind === 'error' ? { kind: 'in', lookup: cached.entry.lookup, me: cached.entry.me } : p))
    return true
  }, [slug])

  // The saved boards first, before the session is even confirmed.
  useEffect(() => {
    settled.current = false
    recheck.current = false
    openSlug.current = slug
    // Another link: what the gate knew was about the one before.
    setPhase((p) => (p.kind === 'loading' ? p : { kind: 'loading' }))
    void enterFromCache()
    return () => {
      openSlug.current = null
    }
  }, [slug, enterFromCache])

  /**
   * An ask failed with signal (a request lost as the signal came back): the
   * next one in 2 s, then 4, 8 and 16, not only on the 20 s timer. Its first
   * lookup lost used to leave the phone's copy up for 17 s more.
   */
  const askSoon = useCallback(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    clearTimeout(soon.current)
    soon.current = setTimeout(() => retryNow.current(), Math.min(CACHE_RETRY_MS, RETRY_SOON_MS * 2 ** failures.current++))
  }, [])

  const resolve = useCallback(async () => {
    const seq = ++resolveSeq.current
    /** A newer resolve started (a retry, the PIN, another link): this one's answers no longer count. */
    const stale = () => seq !== resolveSeq.current
    if (!supabaseConfigured) {
      setPhase({ kind: 'error', error: t.errors.missingEnv })
      return
    }
    asking.current++
    try {
      await ensureSession()
      if (stale()) return
      const lookup = await lookupTournament(slug)
      if (stale()) return
      if (!lookup) {
        settled.current = true
        recheck.current = false
        failures.current = 0
        // The link leads nowhere now (the tournament was deleted): what was
        // saved under it goes too, and its writes, which can never go out now,
        // move to the rejected list (held ones kept the phone from signing out
        // or changing account for good).
        void clearCachedSlug(slug)
          .then(async (tid) => {
            const dropped = await rejectGoneTournament(slug, tid)
            if (dropped && !stale()) setPhase((p) => (p.kind === 'notFound' ? { kind: 'notFound', dropped } : p))
          })
          // The phone's storage refused: the writes stay queued, and the next «no existe» tries again.
          .catch(() => undefined)
        setPhase({ kind: 'notFound', dropped: 0 })
        return
      }
      const m = await myMembership(lookup.id)
      if (stale()) return
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
        recheck.current = false
        setPhase({ kind: 'in', lookup, me })
        // Writes this phone queued under an earlier session belong to this player again (REL-16).
        if (m.playerId || m.isOrganizer) void adoptQueuedWrites(lookup.id)
        // A platform visit is not "my tournament": it is not where home
        // returns to, and it is not kept on the device for offline use.
        if (!platform) {
          setLastTournament({ slug: lookup.slug, name: lookup.name })
          // Under the tournament's own slug, even when the link was the code typed at home:
          // «Tu último torneo» opens /t/<slug>, and with no signal the boards must be there.
          void saveEntry({ slug: lookup.slug, tournamentId: lookup.id, lookup, me })
        }
        await load(lookup.id, { keepOnPhone: !platform })
        if (stale()) return
        refreshOutboxCounters()
        // The boards came: the asking is over. They didn't: ask again soon.
        if (useTournament.getState().source === 'server') failures.current = 0
        else askSoon()
        // The lookup worked but the snapshot did not: still better to show what we have.
        if (!useTournament.getState().data && !platform) {
          const cached = await readCached(slug)
          if (cached?.entry.tournamentId === lookup.id && !stale()) useTournament.getState().seed(lookup.id, cached.snapshot, cached.savedAt)
        }
      } else {
        // Not in this tournament any more (the device was released, the link removed): its saved boards go too.
        settled.current = true
        recheck.current = false
        failures.current = 0
        void clearCached(lookup.id)
        setPhase({ kind: 'enter', lookup })
      }
    } catch (e) {
      if (stale()) return
      askSoon()
      if (await enterFromCache()) return
      if (stale()) return
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      // Boards already up stay up while the server can't be reached.
      setPhase((p) => (p.kind === 'in' ? p : { kind: 'error', error: offline ? t.errors.offlineFirstOpen : e }))
    } finally {
      asking.current--
    }
  }, [slug, load, enterFromCache, askSoon])

  useEffect(() => {
    if (authReady) void resolve()
  }, [authReady, resolve])

  // The device lost or changed who it is (auth-js signed it out mid-round when
  // its refresh token was dead): ask the server again, so holes saved since
  // lead to Entrar and the PIN instead of waiting in silence (REL-16). Not the
  // first identity a resolve brings (no session yet, then an anonymous one).
  const lastUid = useRef(uid)
  useEffect(() => {
    const was = lastUid.current
    lastUid.current = uid
    if (!was || was === uid || !authReady) return
    // The person signed out on purpose: nothing was lost, and asking again
    // would only sign the phone in anonymously behind them.
    if (!uid && signedOutOnPurpose()) return
    recheck.current = true
    void resolve()
  }, [uid, authReady, resolve])

  // Until the server has answered and its boards are up, resolve for real
  // (session, role, live snapshot, Realtime): on reconnect, on return to the
  // app, and on a timer, since the stored session can stay unconfirmed for a
  // while after the signal returns (auth-js cools down after a failed refresh)
  // and `online` fires only once (REL-16). Until the server's snapshot is on
  // screen, not just until the session is back: a lookup that worked and a
  // snapshot that didn't used to end the retries and leave the old boards up
  // (REL-02). Never on Entrar or «no existe»: the server answered, and asking
  // again every 20 s for as long as the app stayed open changed nothing.
  useEffect(() => {
    const retry = () => {
      // Its person is signing out on purpose (asked while this gate was open):
      // the phone is on its way home, and asking again once the session is
      // gone would sign it in anonymously behind them. A gate opened after a
      // sign-out asks as usual.
      if (signOutsAsked() !== signOutsAtOpen.current && signedOutOnPurpose()) return
      const p = phaseNow.current
      const waiting = p.kind === 'loading' || p.kind === 'error' || (p.kind === 'in' && (recheck.current || useTournament.getState().source !== 'server'))
      if (asking.current > 0 || !waiting) return
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void resolve()
    }
    retryNow.current = retry
    const timer = setInterval(() => void retry(), CACHE_RETRY_MS)
    const onOnline = () => void retry()
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onOnline)
    return () => {
      retryNow.current = () => undefined
      clearTimeout(soon.current)
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

  const tournamentId = phase.kind === 'in' ? phase.lookup.id : null
  const via = phase.kind === 'in' ? phase.me.via : null
  const leave = useCallback(async () => {
    // release_device drops this device's one PIN claim, wherever it is. Here
    // by the profile («No soy yo»), that claim may be another tournament's:
    // the phone was then nobody there, and its holes still on the phone were
    // refused. Only this tournament's claim goes; when the server can't say
    // where it is (no signal, an old saved entry), as before.
    const claim = via === 'device' ? undefined : await myDeviceClaim().catch(() => undefined)
    if (claim === undefined || claim?.tournamentId === tournamentId) await releaseDevice()
    setLastTournament(null)
    // The boards this phone saved belong to the player who just left.
    if (tournamentId) await clearCached(tournamentId)
    await resolve()
  }, [resolve, tournamentId, via])

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
          body={phase.dropped ? `${t.enter.goneUnsent} ${t.errors.notFoundHint}` : t.errors.notFoundHint}
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
        <ErrorBox error={storeError} onRetry={() => void load(phase.lookup.id, { keepOnPhone: phase.me.via !== 'platform' })} />
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
