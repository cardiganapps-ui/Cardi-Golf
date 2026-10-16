import type { TournamentSettings } from './schema'

/**
 * Whether a tournament plays for money: an entry fee, the Calcutta, or a side
 * game with a pot. The wizard and Comité › Torneo then ask the Comité to say
 * every player is 18 or older (TRUST-13).
 */
export function moneyInPlay(s: Pick<TournamentSettings, 'entryFee' | 'modules' | 'games'>): boolean {
  return s.entryFee > 0 || s.modules.auction.enabled || s.games.some((g) => g.money.source !== 'none')
}
