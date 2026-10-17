// @vitest-environment happy-dom
/**
 * ARCH-06: a tournament's currency is data. <Money> and every formatMoney call wrote MXN whatever the settings
 * said; now each screen of a tournament reads `settings.currency` through the gates' provider. MXN is still the
 * only currency the settings allow (`settingsSense`, MONEY-13), so this proves the path with a stored row that
 * says USD: Dinero, Juegos and En vivo write every amount in dollars, and none in pesos.
 */
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { TournamentCurrency } from '../../components/TournamentCurrency'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { formatMoney } from '../../lib/money'
import { GamesScreen } from './GamesScreen'
import { LiveScreen } from './LiveScreen'
import { MoneyScreen } from './MoneyScreen'
import { TournamentContext } from './tournamentContext'

const TID = 'fixture:full12-finished'

function mount(screen: 'dinero' | 'juegos' | 'vivo', currency?: string) {
  const fx = getFixture('full12-finished')!
  const snap = structuredClone(fx.snapshot)
  if (currency) snap.tournament.settings = { ...(snap.tournament.settings as object), currency }
  useTournament.setState({ tournamentId: TID, data: dataFromSnapshot(snap) })
  const ui = screen === 'dinero' ? <MoneyScreen /> : screen === 'juegos' ? <GamesScreen /> : <LiveScreen />
  return render(
    <MemoryRouter>
      <TournamentContext.Provider
        value={{
          tournamentId: TID,
          slug: 'viaje',
          lookup: fx.lookup,
          me: { playerId: 'p9', isOrganizer: false, isComite: false },
          refresh: async () => undefined,
          leave: async () => undefined,
        }}
      >
        <TournamentCurrency>{ui}</TournamentCurrency>
      </TournamentContext.Provider>
    </MemoryRouter>,
  ).container
}

afterEach(cleanup)

describe('money is shown in the tournament’s currency (ARCH-06)', () => {
  it.each(['dinero', 'juegos', 'vivo'] as const)('%s: a tournament in USD writes dollars, never pesos', (screen) => {
    const text = mount(screen, 'USD').textContent ?? ''
    // es-MX writes MXN as «$10,000» and USD as «USD 10,000»: amounts in the second form, none in the first.
    expect(text).toMatch(new RegExp(formatMoney(1234, 'USD').replace('1,234', '[\\d,]+')))
    expect(text.match(/\$\d/g) ?? []).toEqual([])
  })

  it.each(['dinero', 'juegos', 'vivo'] as const)('%s: the first tournament, as stored, in pesos', (screen) => {
    const text = mount(screen).textContent ?? ''
    expect(text).toMatch(/\$[\d,]+/)
    expect(text).not.toContain('USD')
  })
})
