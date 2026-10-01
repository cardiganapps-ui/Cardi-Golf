// @vitest-environment happy-dom
/**
 * REL-17: holes still on the phone, and writes the server refused, show on
 * the Tarjeta tab from every screen, not only inside the Tarjeta.
 *
 * REL-02, REL-04: the header's status line, from facts. It read «Sin señal:
 * mostrando lo último guardado (10:42)» whenever the live channel was off,
 * signal or not, and gave a time of day that made a two-day-old board look
 * like this morning's.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  vi.restoreAllMocks()
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

/** The boards on screen, from the phone or the server, saved `minutesAgo`. */
function showBoards(state: { source: 'cache' | 'server'; realtime?: 'off' | 'live' | 'error'; minutesAgo: number }) {
  const fx = getFixture('minimal4-live')!
  useTournament.setState({ tournamentId: 't-real', data: dataFromSnapshot(structuredClone(fx.snapshot)), source: state.source, realtime: state.realtime ?? 'off', updatedAt: Date.now() - state.minutesAgo * 60_000 })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 't-real', slug: 'nacho', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <TournamentShell />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
const header = () => document.querySelector('header')!.textContent ?? ''

describe('the header says what the boards are (REL-02, REL-04)', () => {
  it('with signal, the phone\'s copy while the live tournament is on its way: «Conectando, guardado hace 5 min»', () => {
    showBoards({ source: 'cache', minutesAgo: 5 })
    expect(header()).toContain(t.sync.revalidating('hace 5 min'))
    expect(header()).not.toContain(t.sync.offlineShort)
  })

  it('with no signal: «Sin señal, guardado hace 5 min»', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    showBoards({ source: 'cache', minutesAgo: 5 })
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(header()).toContain(t.sync.fromCache('hace 5 min'))
  })

  it('the server\'s boards with the channel down never read «Sin señal»', () => {
    showBoards({ source: 'server', realtime: 'off', minutesAgo: 0 })
    expect(header()).not.toContain(t.sync.offlineShort)
    cleanup()
    showBoards({ source: 'server', realtime: 'error', minutesAgo: 0 })
    expect(header()).toContain(t.sync.noLive)
  })

  it('a two-day-old copy says so', () => {
    showBoards({ source: 'cache', minutesAgo: 2 * 24 * 60 })
    expect(header()).toMatch(/guardado hace 2 días/)
  })
})
