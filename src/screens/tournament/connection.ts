/**
 * The connection, as one model (REL-21). What the phone knows about the boards on screen, read from facts,
 * shown in one place: the tournament's header. Nothing else on a tournament screen says it again. The shell's
 * banner steps aside (MOT-17), and the Tarjeta's line says what the phone's own writes are doing, not the
 * signal.
 *
 * - `offline`: the phone has no signal, and the boards are the last ones it had.
 * - `connecting`: with signal, the boards are not live yet. It is one of these:
 *   - the phone's copy while the live tournament is on its way (REL-02);
 *   - a fetch of the boards that failed and is tried again (REL-10);
 *   - the live channel joining, or joining again after it failed (meanwhile the boards move every 15 s);
 *   - no channel yet, which the gate keeps asking about.
 *   While the channel joined the header said nothing, and while it was down «Sin actualizaciones en vivo».
 * - `live`: the server's boards, and the live channel up. A link to watch (STRAT-05) has no channel: its page
 *   asks for the boards every few seconds instead, so for it live is its last ask answered.
 *
 * `mayBeOld`: the boards may be behind the server (no signal, the phone's copy, a fetch that failed). The
 * header's second line then says how old they are, and En vivo leaves its own «Actualizado» line out.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { useOnline } from '../../components/online'
import { SPECTATOR_PREFIX, useTournament } from '../../data/tournamentStore'
import { useTournamentCtx } from './tournamentContext'

export type ConnectionKind = 'offline' | 'connecting' | 'live'
export interface Connection {
  kind: ConnectionKind
  mayBeOld: boolean
}

export interface ConnectionFacts {
  online: boolean
  /** Boards on screen at all: before them the gate shows its own loading. */
  hasData: boolean
  /** A design fixture (`/t/_/…`) has no server. It shows a connection only when it acts one out (`?net=`), or offline. */
  fixture: boolean
  /** A link to watch (`/v/…`): the boards come by asking, never on a channel, so a good ask is as live as it gets. */
  polled: boolean
  source: 'cache' | 'server' | null
  realtime: 'off' | 'connecting' | 'live' | 'error'
  /** The last fetch of the boards failed (the store's `error`, over boards it has). */
  fetchFailed: boolean
}

/** The connection, from the facts: null when there is nothing to say (no boards, or a fixture that acts nothing out). */
export function connectionOf(f: ConnectionFacts): Connection | null {
  if (!f.hasData) return null
  // A fixture's boards are its own: no age to give, but losing the signal still shows (MOT-17's check).
  if (f.fixture && f.source == null) return f.online ? null : { kind: 'offline', mayBeOld: false }
  if (!f.online) return { kind: 'offline', mayBeOld: true }
  if (f.source !== 'server') return { kind: 'connecting', mayBeOld: f.source === 'cache' }
  if (f.fetchFailed) return { kind: 'connecting', mayBeOld: true }
  if (f.polled) return { kind: 'live', mayBeOld: false }
  // «En vivo» only with the channel joined; joining, failed or not open yet, it is still connecting.
  return f.realtime === 'live' ? { kind: 'live', mayBeOld: false } : { kind: 'connecting', mayBeOld: false }
}

interface StoreFacts { data: unknown; tournamentId: string | null; source: ConnectionFacts['source']; realtime: ConnectionFacts['realtime']; error: string | null }
export const factsOf = (s: StoreFacts, online: boolean): ConnectionFacts => ({
  online,
  hasData: !!s.data,
  fixture: s.tournamentId?.startsWith('fixture:') ?? false,
  // A link's design fixture (`/v/_/…`, `fixture:spectator:…`) reads as a healthy link: its boards are as live as a link's.
  polled: (s.tournamentId?.startsWith(SPECTATOR_PREFIX) || s.tournamentId?.startsWith(`fixture:${SPECTATOR_PREFIX}`)) ?? false,
  source: s.source,
  realtime: s.realtime,
  fetchFailed: s.error != null && !!s.data,
})

/** The connection of the tournament on screen. Renders only when its kind or its age flag changes. */
export function useConnection(): Connection | null {
  const online = useOnline()
  const kind = useTournament((s) => connectionOf(factsOf(s, online))?.kind ?? null)
  const mayBeOld = useTournament((s) => connectionOf(factsOf(s, online))?.mayBeOld ?? false)
  return useMemo(() => (kind ? { kind, mayBeOld } : null), [kind, mayBeOld])
}

/** The boards on screen may be behind the server: the header says how old (REL-04), so En vivo and the TV need not, or must. */
export function useBoardsMayBeOld(): boolean {
  const online = useOnline()
  return useTournament((s) => connectionOf(factsOf(s, online))?.mayBeOld ?? false)
}

/**
 * «Actualizar» (PWA-15): the boards from the server now, from the header's chip or a pull on a board. The
 * installed app has no reload of its own. Until the live tournament is on screen (the phone's copy, or no
 * live channel), the gate brings it, with the session and the channel. After that the store fetches the
 * boards, and tries a failed channel again now. One at a time: a tap or a pull while one is under way gets
 * that one.
 */
export function useRefreshBoards(): { refreshing: boolean; refresh: () => Promise<void> } {
  const { refresh: resolve, retry } = useTournamentCtx()
  const [refreshing, setRefreshing] = useState(false)
  const out = useRef<Promise<void> | null>(null)
  const refresh = useCallback(() => {
    if (out.current) return out.current
    const st = useTournament.getState()
    const ask = st.source !== 'server' || st.realtime === 'off' ? (retry ?? resolve)() : st.refreshNow()
    setRefreshing(true)
    const p = ask
      .catch(() => undefined)
      .finally(() => {
        out.current = null
        setRefreshing(false)
      })
    out.current = p
    return p
  }, [resolve, retry])
  return { refreshing, refresh }
}
