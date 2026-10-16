import { useEffect, useState } from 'react'
import { roundRivalries, type RoundRivalry } from '../../../data/quick'
import { useTournament } from '../../../data/tournamentStore'
import type { Group } from '../../../engine/types'
import { t } from '../../../i18n/es-MX'
import { useTournamentCtx } from '../tournamentContext'

/** My sliding-stroke rivalries with others in this group (0016), one line each. Accounts only. */
export function RivalryLines({ tournamentId, group }: { tournamentId: string; group: Group }) {
  const { me } = useTournamentCtx()
  const players = useTournament((s) => s.data?.snapshot.players)
  const [list, setList] = useState<RoundRivalry[]>([])
  const eligible = me.via === 'profile' && !tournamentId.startsWith('fixture:')
  useEffect(() => {
    if (!eligible) return
    let live = true
    roundRivalries(tournamentId)
      .then((r) => live && setList(r))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [eligible, tournamentId])
  const shown = list.filter((r) => group.playerIds.includes(r.myPlayerId) && group.playerIds.includes(r.theirPlayerId))
  if (!shown.length) return null
  return (
    <>
      {shown.map((r) => (
        <span key={r.theirPlayerId}>{t.quick.rivalryLine(players?.find((p) => p.id === r.theirPlayerId)?.displayName ?? '', r.myStrokes)}</span>
      ))}
    </>
  )
}
