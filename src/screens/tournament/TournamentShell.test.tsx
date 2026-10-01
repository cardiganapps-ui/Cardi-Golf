// @vitest-environment happy-dom
/**
 * REL-17: holes still on the phone, and writes the server refused, show on
 * the Tarjeta tab from every screen, not only inside the Tarjeta.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { useOutbox } from '../../data/outbox'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from './TournamentGate'
import { TournamentShell } from './TournamentShell'

function mount() {
  const fx = getFixture('minimal4-live')!
  useTournament.setState({ tournamentId: fx.snapshot.tournament.id, data: dataFromSnapshot(structuredClone(fx.snapshot)), loading: false, error: null, realtime: 'live' })
  return render(
    <MemoryRouter initialEntries={['/t/x/juegos']}>
      <Routes>
        <Route
          path="/t/:slug/*"
          element={
            <TournamentContext.Provider value={{ tournamentId: fx.snapshot.tournament.id, slug: 'x', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
              <TournamentShell />
            </TournamentContext.Provider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}
const cardTab = () => screen.getByRole('link', { name: new RegExp(`^${t.nav.card}`) })

afterEach(() => {
  cleanup()
  useOutbox.setState({ pendingHoles: 0, rejected: [] })
})

describe('the Tarjeta tab says what is still on the phone (REL-17)', () => {
  it('nothing waiting: no badge', () => {
    mount()
    expect(cardTab().textContent).toBe(t.nav.card)
  })

  it('holes waiting: their count, read out with the tab', () => {
    mount()
    act(() => useOutbox.setState({ pendingHoles: 3 }))
    expect(within(cardTab()).getByText('3')).toBeTruthy()
    expect(cardTab().textContent).toContain(t.sync.pendingHoles(3))
  })

  it('a refused write wins over the waiting count', () => {
    mount()
    act(() => useOutbox.setState({ pendingHoles: 3, rejected: [{ key: 'k', kind: 'score', tournamentId: 't', payload: {} as never, message: 'x', at: 0 }] }))
    expect(within(cardTab()).getByText('1').className).toMatch(/tabBadgeBad/)
    expect(cardTab().textContent).toContain(t.sync.rejected(1))
  })
})
