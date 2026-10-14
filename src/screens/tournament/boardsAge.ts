import { useEffect, useState } from 'react'
import { savedWhen } from '../../lib/freshness'

/**
 * How old the boards are, in words (REL-04), kept current every 30 s. The clock moves only when the words
 * would: «hace 5 min» for two ticks is one render, not two (PERF-09). Whether the boards may be old at all is
 * the connection's to say (`useBoardsMayBeOld`, ./connection).
 */
export function useSavedWhen(ts: number): string | null {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => {
      const at = Date.now()
      setNow((was) => (ts && savedWhen(ts, was) === savedWhen(ts, at) ? was : at))
    }, 30_000)
    return () => clearInterval(id)
  }, [ts])
  return ts ? savedWhen(ts, now) : null
}
