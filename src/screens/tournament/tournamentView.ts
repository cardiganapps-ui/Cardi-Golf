/**
 * Where a tournament's screens hang from and whether they may show money: the
 * tournament's own (`/t/<slug>`), a design fixture's, or a link to watch's
 * (`/v/<token>`, STRAT-05). Apart from the gate (fast refresh).
 */
import { useContext } from 'react'
import { TournamentContext, type TournamentCtx } from './TournamentGate'

/** The path a tournament's screens hang from: `/t/<slug>`, a fixture's `/t/_/<name>`, or a link to watch's `/v/<token>`. */
export const tournamentBase = (c: Pick<TournamentCtx, 'base' | 'slug'>) => c.base ?? `/t/${c.slug}`

/**
 * Whether the screens may show money: always for the tournament's own people,
 * never on a link to watch made «Sin dinero» (STRAT-05). Its data has no money
 * in it either (0052); this keeps the words for money off the screen too
 * («$0 por día», a snake's «$0»).
 */
export function useShowMoney(): boolean {
  const c = useContext(TournamentContext)
  return !c?.spectator || c.spectator.money
}
