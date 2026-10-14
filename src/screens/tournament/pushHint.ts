import { t } from '../../i18n/es-MX'
import type { TournamentSettings } from '../../engine/settings/schema'

const T = t.push.tournament

/** What a tournament's notices tell (PWA-10), for the games it plays: no card to sign without the pairs game, no snake without the snake. */
export function tournamentPushHint(settings: TournamentSettings | null | undefined): string {
  const things: string[] = [T.day]
  if (settings?.modules.pairs.enabled) things.push(T.card)
  if (settings?.modules.snake.enabled) things.push(T.snake(settings.modules.snake.label))
  things.push(T.results)
  return T.hint(things)
}
