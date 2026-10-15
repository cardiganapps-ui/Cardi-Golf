import { t } from '../../i18n/es-MX'
import { cardSigningMode } from '../../engine/core/cardSigning'
import type { TournamentSettings } from '../../engine/settings/schema'

const T = t.push.tournament

/**
 * What a tournament's notices tell (PWA-10), for the games it plays: a card to sign only where cards are signed
 * (its signing rule, UX-23), no snake without the snake, and a Comité correction to one of his holes (TRUST-14).
 */
export function tournamentPushHint(settings: TournamentSettings | null | undefined): string {
  const things: string[] = [T.day]
  if (settings && cardSigningMode(settings) !== 'none') things.push(T.card)
  if (settings?.modules.snake.enabled) things.push(T.snake(settings.modules.snake.label))
  things.push(T.corrected, T.results)
  return T.hint(things)
}
