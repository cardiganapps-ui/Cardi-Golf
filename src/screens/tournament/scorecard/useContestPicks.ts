/**
 * Hole contests on the hole on screen (closest to the pin, greenies...): the group's pick, saved with the hole.
 * What the group picked here and not saved yet, else what the boards hold for the group.
 */
import { useLayoutEffect, useMemo, useState } from 'react'
import { CONTEST_SINGLE, contestStateOf } from '../../../engine/games/contest'
import type { TournamentState } from '../../../engine/computeTournament'
import type { TournamentSettings } from '../../../engine/settings/schema'
import type { Player, Snapshot } from '../../../engine/types'

export interface HoleContest {
  id: string
  label: string
  kind: string
  single: boolean
  eligible: Player[]
}

export function useContestPicks(o: {
  settings: TournamentSettings
  state: TournamentState
  holeAwards: Snapshot['holeAwards']
  roundId: string
  groupId: string
  hole: number
  players: Player[]
}) {
  const { settings, state, holeAwards, roundId, groupId, hole, players } = o
  const contests = useMemo(
    () =>
      settings.games.flatMap((g): HoleContest[] => {
        if (g.type !== 'contest' || !g.enabled) return []
        const gs = state.games[g.id]
        const onHole = contestStateOf(gs)?.holes.some((h) => h.roundId === roundId && h.hole === hole)
        if (!gs || !onHole) return []
        const eligible = players.filter((p) => gs.entrants.includes(p.id))
        return eligible.length
          ? [{ id: g.id, label: g.label, kind: g.options.kind, single: CONTEST_SINGLE[g.options.kind], eligible }]
          : []
      }),
    [settings.games, state.games, roundId, hole, players],
  )
  const savedPicks = (gameId: string) =>
    holeAwards
      .filter((a) => a.roundId === roundId && a.gameId === gameId && a.hole === hole && a.groupId === groupId)
      .map((a) => a.playerId)
  const [picks, setPicks] = useState<Record<string, string[] | undefined>>({})
  // With the hole, in the same task (as the drafts): the last hole's picks never stand on this one.
  useLayoutEffect(() => setPicks({}), [hole, roundId, groupId])
  const pickOf = (gameId: string) => picks[gameId] ?? savedPicks(gameId)
  const togglePick = (c: HoleContest, pid: string | null) =>
    setPicks((cur) => {
      const now = cur[c.id] ?? savedPicks(c.id)
      const next =
        pid === null
          ? []
          : c.single
            ? now.includes(pid)
              ? []
              : [pid]
            : now.includes(pid)
              ? now.filter((x) => x !== pid)
              : [...now, pid]
      return { ...cur, [c.id]: next }
    })
  /** The winners picked on this hole, contest by contest, as the save sends them. */
  const awards = contests.flatMap((c) => {
    const chosen = picks[c.id]
    return chosen ? [{ gameId: c.id, playerIds: chosen }] : []
  })
  return { contests, picks, pickOf, togglePick, awards }
}
