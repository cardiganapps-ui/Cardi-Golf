/**
 * The currency a tournament's money is shown in (ARCH-06): its `settings.currency`, which the gates provide
 * (`TournamentCurrency`) to every screen of the tournament. `<Money>` reads it, and so does a screen's own
 * `formatMoney(amount, useCurrency())`. Outside a tournament a screen passes the currency its data carries (a
 * profile's nets, a Ronda rápida's settings).
 */
import { createContext, useCallback, useContext } from 'react'
import type { Msg } from '../engine/messages'
import { renderMsg } from '../i18n/explain'
import { PLATFORM_CURRENCY } from '../lib/money'

export const CurrencyContext = createContext<string | null>(null)

/** This tournament's currency; the platform's where no tournament provides one. */
export function useCurrency(): string {
  return useContext(CurrencyContext) ?? PLATFORM_CURRENCY
}


/** What the engine says, in words (ARCH-05): a warning or an explanation's line, money in this tournament's currency. */
export function useWords(): (m: Msg) => string {
  const currency = useCurrency()
  return useCallback((m: Msg) => renderMsg(m, currency), [currency])
}
