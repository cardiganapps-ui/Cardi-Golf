import { useMemo } from 'react'
import { useTournament } from '../../data/tournamentStore'
import type { Group, Round } from '../../engine/types'
import { useTournamentCtx } from './TournamentGate'

/** The round to score now: the tournament's current round if live, else the first live round, else the next scheduled. */
export function pickActiveRound(rounds: Round[], currentRoundId: string | null): Round | null {
  const cur = rounds.find((r) => r.id === currentRoundId)
  if (cur && cur.status === 'live') return cur
  return rounds.find((r) => r.status === 'live') ?? cur ?? rounds.find((r) => r.status === 'scheduled') ?? rounds.at(-1) ?? null
}

export function useActiveRound(): Round | null {
  const data = useTournament((s) => s.data)
  return useMemo(() => (data ? pickActiveRound(data.snapshot.rounds, data.snapshot.tournament.currentRoundId) : null), [data])
}

/** My group in the active round (or null for an organizer who does not play). */
export function useMyGroup(round: Round | null): Group | null {
  const data = useTournament((s) => s.data)
  const { me } = useTournamentCtx()
  return useMemo(() => {
    if (!data || !round) return null
    const groups = data.snapshot.groups.filter((g) => g.roundId === round.id)
    if (me.playerId) return groups.find((g) => g.playerIds.includes(me.playerId!)) ?? null
    return null
  }, [data, round, me.playerId])
}
