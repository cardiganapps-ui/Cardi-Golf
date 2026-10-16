/** Every screen of a tournament shows money in its own currency (ARCH-06): the gates wrap them in this. */
import type { ReactNode } from 'react'
import { useTournament } from '../data/tournamentStore'
import { CurrencyContext } from './currency'

export function TournamentCurrency({ children }: { children: ReactNode }) {
  const currency = useTournament((s) => s.data?.settings.currency ?? null)
  return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>
}
