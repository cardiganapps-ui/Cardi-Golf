/**
 * Where a tournament's screens hang from and whether they may show money: the
 * tournament's own (`/t/<slug>`), a design fixture's, or a link to watch's
 * (`/v/<token>`, STRAT-05). Apart from the gate (fast refresh).
 */
import { useContext } from 'react'
import { useTournament } from '../../data/tournamentStore'
import { TournamentContext, type TournamentCtx } from './tournamentContext'

/** The path a tournament's screens hang from: `/t/<slug>`, a fixture's `/t/_/<name>`, or a link to watch's `/v/<token>`. */
export const tournamentBase = (c: Pick<TournamentCtx, 'base' | 'slug'>) => c.base ?? `/t/${c.slug}`

/**
 * Whether the screens may show money: for the tournament's own people, never
 * on a link to watch made «Sin dinero» (STRAT-05). Its data has no money in it
 * either (0053); this keeps the words for money off the screen too («$0 por
 * día», a snake's «$0»). Nor while a side game this build doesn't know may
 * move money (ARCH-04): it can't count the money, and En vivo says why.
 */
export function useShowMoney(): boolean {
  const c = useContext(TournamentContext)
  const counted = useTournament((s) => !s.data?.state.flags.moneyUnknown.length)
  return (!c?.spectator || c.spectator.money) && counted
}
