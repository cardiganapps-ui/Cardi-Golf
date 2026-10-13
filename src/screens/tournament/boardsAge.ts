import { useEffect, useState } from 'react'
import { useOnline } from '../../components/OfflineBanner'
import { useTournament } from '../../data/tournamentStore'
import { savedWhen } from '../../lib/freshness'

/**
 * The boards on screen may be behind the server: no signal, the phone's copy
 * while the live one is on its way (REL-04), or a fetch of them that failed
 * (REL-10). The header then says how old they are, and En vivo leaves its own
 * «Actualizado» line out: once is enough.
 */
export function useBoardsMayBeOld(): boolean {
  const online = useOnline()
  return useTournament((s) => !!s.data && !(s.tournamentId?.startsWith('fixture:') ?? false) && (!online || s.source === 'cache' || s.error != null))
}

/** How old the boards are, in words (REL-04), kept current every 30 s. */
export function useSavedWhen(ts: number): string | null {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return ts ? savedWhen(ts, now) : null
}
