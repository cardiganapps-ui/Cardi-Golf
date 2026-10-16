/**
 * `/v/:token`: a link to watch the tournament (STRAT-05, migration 0053). No
 * session, no PIN, and nothing on it writes: the page asks `spectator_board`
 * for the boards while it is on screen and shows them on the tournament's own
 * screens, read-only (En vivo, Juegos, Dinero when the link shows money, the
 * TV). It never starts a user, never opens a live channel (no session: RLS
 * lets none through) and keeps nothing on the phone.
 *
 * It polls as the boards move (`nextPoll`): every 5 s on Calcutta night, 20 s
 * on a day in play, 2 min otherwise or once nothing has moved for a while,
 * and longer after each failure. Out of sight it does not ask at all, and
 * coming back asks at once, so a TV left on all night costs a few bytes a
 * minute (the server answers «nothing changed» with the version alone).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Outlet, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Spinner } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { Wordmark } from '../../components/Wordmark'
import { nextPoll, spectatorBoard, spectatorPath, spectatorStoreId, spectatorUrl } from '../../data/spectator'
import { showBoards, useTournament } from '../../data/tournamentStore'
import { humanError } from '../../lib/humanError'
import { TournamentContext, useTournamentCtx } from '../tournament/tournamentContext'
import { MoneyScreen } from '../tournament/MoneyScreen'
import { forgetBoards, SPECTATOR_ME, useNoIndex } from './spectatorView'

const noop = async () => undefined

type Phase = 'loading' | 'gone' | 'error' | 'in'

export function SpectatorGate() {
  const { token = '' } = useParams()
  const id = useMemo(() => spectatorStoreId(token), [token])
  const [phase, setPhase] = useState<Phase>('loading')
  const [money, setMoney] = useState(false)
  const [error, setError] = useState<unknown>(null)
  /** Ask now (the error's «Reintentar», the context's refresh). */
  const askNow = useRef<() => void>(() => undefined)
  const has = useTournament((s) => s.tournamentId === id && !!s.data)
  useNoIndex()

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    /** The version on screen: the server answers «nothing changed» with it alone. */
    let version: string | null = null
    let failures = 0
    let changedAt = Date.now()
    let asking = false
    let shown = false
    setPhase('loading')
    setError(null)

    const schedule = () => {
      clearTimeout(timer)
      const st = useTournament.getState()
      const snap = st.tournamentId === id ? st.data?.snapshot : undefined
      const wait = nextPoll({ status: snap?.tournament.status ?? null, anyRoundLive: !!snap?.rounds.some((r) => r.status === 'live'), quietMs: Date.now() - changedAt, failures })
      timer = setTimeout(() => void ask(), wait)
    }
    const ask = async () => {
      if (stopped || asking) return
      // Out of sight, or with no signal, it waits: coming back asks at once (below).
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      asking = true
      clearTimeout(timer)
      try {
        const answer = await spectatorBoard(token, version)
        if (stopped) return
        if (!answer) {
          // Wrong, changed or switched off: nothing more to ask, and what it showed goes.
          stopped = true
          forgetBoards(id)
          setPhase('gone')
          return
        }
        failures = 0
        const now = Date.now()
        if (answer.same) {
          if (useTournament.getState().tournamentId === id) useTournament.setState({ updatedAt: now, error: null })
        } else {
          version = answer.version
          changedAt = now
          showBoards(id, answer.snapshot, now)
          setMoney(answer.money)
          shown = true
          setPhase('in')
        }
      } catch (e) {
        if (stopped) return
        failures++
        // Boards already up stay up, and the header says how old they are (REL-10).
        if (shown && useTournament.getState().tournamentId === id) useTournament.setState({ error: humanError(e) })
        else {
          setError(e)
          setPhase('error')
        }
      } finally {
        asking = false
        if (!stopped) schedule()
      }
    }
    askNow.current = () => {
      failures = 0
      void ask()
    }
    const onBack = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void ask()
    }
    window.addEventListener('online', onBack)
    document.addEventListener('visibilitychange', onBack)
    void ask()
    return () => {
      stopped = true
      clearTimeout(timer)
      window.removeEventListener('online', onBack)
      document.removeEventListener('visibilitychange', onBack)
      askNow.current = () => undefined
      forgetBoards(id)
    }
  }, [token, id])

  const name = useTournament((s) => (s.tournamentId === id ? s.data?.snapshot.tournament.name : undefined))
  const tagline = useTournament((s) => (s.tournamentId === id ? s.data?.snapshot.tournament.tagline : undefined))
  const logoUrl = useTournament((s) => (s.tournamentId === id ? s.data?.snapshot.tournament.logoUrl : undefined))
  const accentColor = useTournament((s) => (s.tournamentId === id ? s.data?.snapshot.tournament.accentColor : undefined))
  const status = useTournament((s) => (s.tournamentId === id ? s.data?.snapshot.tournament.status : undefined))
  // One value per change of what it carries: a poll that moved a score renders no context consumer (PERF-09).
  const value = useMemo(
    () => ({
      tournamentId: id,
      slug: '',
      base: spectatorPath(token),
      lookup: { id, slug: '', name: name ?? '', tagline: tagline ?? null, logoUrl: logoUrl ?? null, accentColor: accentColor ?? null, status: status ?? 'setup', joinCode: '', players: [] },
      me: SPECTATOR_ME,
      spectator: { money, url: spectatorUrl(token) },
      refresh: async () => askNow.current(),
      leave: noop,
    }),
    [id, token, money, name, tagline, logoUrl, accentColor, status],
  )

  if (phase === 'gone') {
    return (
      <div className="screen">
        <Wordmark />
        <EmptyState title={t.spectator.gone} body={t.spectator.goneHint} />
      </div>
    )
  }
  if (phase === 'error' && !has) {
    return (
      <div className="screen">
        <Wordmark />
        <ErrorBox error={error} onRetry={() => askNow.current()} />
      </div>
    )
  }
  if (!has) {
    return (
      <div className="screen">
        <Wordmark />
        <Spinner />
      </div>
    )
  }
  return (
    <TournamentContext.Provider value={value}>
      <Outlet />
    </TournamentContext.Provider>
  )
}

/** Dinero on a link to watch: only «Con dinero». Without it the tab is not there, and its address leads to En vivo. */
export function SpectatorMoney() {
  const { spectator, base } = useTournamentCtx()
  if (spectator && !spectator.money) return <Navigate to={base ?? '/'} replace />
  return <MoneyScreen />
}
