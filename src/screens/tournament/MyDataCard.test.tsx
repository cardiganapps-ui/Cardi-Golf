// @vitest-environment happy-dom
/**
 * TRUST-16: most people Polo keeps data on never signed up: the Comité typed their name, photo, handicap and form
 * guide, and nobody told them. After the PIN, En vivo now shows once what the Comité saved and lets the player ask
 * for a correction, which reaches the Comité (request_player_correction, 0070). Never on a link to watch, for the
 * Comité with no player, or once dismissed.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext, type TournamentCtx } from './tournamentContext'

const api = vi.hoisted(() => ({ requestCorrection: vi.fn(async (_tid: string, _m: string) => 1) }))
vi.mock('../../data/myData', () => api)
const { MyDataCard } = await import('./MyDataCard')

const M = t.myData
const fx = getFixture('minimal4-live')!
const me = fx.snapshot.players.find((p) => p.id === fx.me.playerId)!
beforeEach(() => {
  localStorage.clear()
  api.requestCorrection.mockClear()
  useTournament.setState({ tournamentId: fx.snapshot.tournament.id, data: dataFromSnapshot(structuredClone(fx.snapshot)), loading: false, error: null })
})
afterEach(cleanup)

function mount(over: Partial<TournamentCtx> = {}) {
  const ctx: TournamentCtx = { tournamentId: fx.snapshot.tournament.id, slug: 'x', lookup: fx.lookup, me: { ...fx.me, via: 'device' }, refresh: async () => undefined, leave: async () => undefined, ...over }
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={ctx}>
        <MyDataCard />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

describe('«Esto es lo que el Comité guardó de ti» (TRUST-16)', () => {
  it('after the PIN: what the Comité typed, and who sees it', () => {
    mount()
    expect(screen.getByRole('heading', { name: M.title })).toBeTruthy()
    expect(screen.getByText(M.lede)).toBeTruthy()
    expect(document.body.textContent).toContain(me.displayName)
  })

  it('«Pedir corrección» sends it to the Comité and the card goes', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: M.ask }))
    fireEvent.change(screen.getByLabelText(M.what), { target: { value: 'Mi hándicap es 14' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: M.send })))
    expect(api.requestCorrection).toHaveBeenCalledWith(fx.snapshot.tournament.id, 'Mi hándicap es 14')
    expect(screen.queryByRole('heading', { name: M.title })).toBeNull()
  })

  it('«Está bien» puts it away for good on this phone', () => {
    const { unmount } = mount()
    fireEvent.click(screen.getByRole('button', { name: M.ok }))
    expect(screen.queryByRole('heading', { name: M.title })).toBeNull()
    unmount()
    mount()
    expect(screen.queryByRole('heading', { name: M.title })).toBeNull()
  })

  it('never on a link to watch, for an account-linked or Comité-only phone', () => {
    const a = mount({ spectator: { money: false, url: 'https://x/v/abc' } })
    expect(screen.queryByRole('heading', { name: M.title })).toBeNull()
    a.unmount()
    const b = mount({ me: { ...fx.me, via: 'profile' } })
    expect(screen.queryByRole('heading', { name: M.title })).toBeNull()
    b.unmount()
    mount({ me: { playerId: null, isOrganizer: true, isComite: true, via: 'device' } })
    expect(screen.queryByRole('heading', { name: M.title })).toBeNull()
  })
})
