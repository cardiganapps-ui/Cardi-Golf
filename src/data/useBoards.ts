import { useRef } from 'react'
import { same } from './share'
import { useTournament, type TournamentData } from './tournamentStore'

/**
 * A value read from the boards, kept as the same object while it reads the same (`same`). A component
 * re-renders when its selector returns a new object; this returns the last one when the new one reads
 * the same, so a recompute that changed nothing the component shows renders nothing (PERF-09). Read
 * plain values (words, numbers, ids), not the engine's objects, which every recompute builds again.
 */
export function useBoards<T>(read: (data: TournamentData | null) => T): T {
  const last = useRef<{ value: T } | null>(null)
  return useTournament((s) => {
    const value = read(s.data)
    if (last.current && same(last.current.value, value)) return last.current.value
    last.current = { value }
    return value
  })
}
