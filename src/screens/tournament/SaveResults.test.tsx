// @vitest-environment happy-dom
/**
 * STRAT-08: the launch's players join by PIN, and their results reach a
 * profile only through a confirmed link. The only offer sat in Más and the
 * Ceremonia ended on a bare «Fin.», so the trip's players would leave with
 * nothing. Now the Ceremonia's last step and En vivo once Terminado offer
 * «Guarda tus rondas» to a player on a PIN: an anonymous phone goes to
 * /entrar and comes back to the tournament; a phone with an account saves it
 * there at once. A linked player, the Comité with no player and a link to
 * watch see nothing.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
const auth = vi.hoisted(() => ({ state: { ready: true, user: { id: 'anon' }, isAnonymous: true } }))
vi.mock('../../data/auth', async (orig) => ({
  ...(await orig<typeof import('../../data/auth')>()),
  useAuth: (sel?: (s: unknown) => unknown) => (sel ? sel(auth.state) : auth.state),
}))
const link = vi.hoisted(() => vi.fn(async () => ({ ok: true })))
vi.mock('../../data/profiles', async (orig) => ({
  ...(await orig<typeof import('../../data/profiles')>()),
  linkMyProfile: link,
  useTournamentProfiles: () => [[], () => undefined],
}))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import type { Me, TournamentCtx } from './tournamentContext'
import { TournamentContext } from './tournamentContext'
const { LiveScreen } = await import('./LiveScreen')
const { CeremonyScreen } = await import('./CeremonyScreen')

const S = t.saveResults

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

function open(fixture: string, screenEl: 'live' | 'ceremony', ctx: Partial<TournamentCtx> = {}, me?: Partial<Me>) {
  const fx = getFixture(fixture)!
  const snap = structuredClone(fx.snapshot)
  useTournament.setState({
    tournamentId: `fixture:${fixture}`,
    data: dataFromSnapshot(snap),
    loading: false,
    error: null,
    realtime: 'off',
  })
  const refresh = vi.fn(async () => undefined)
  render(
    <MemoryRouter initialEntries={[`/t/_/${fixture}`]}>
      <TournamentContext.Provider
        value={{
          tournamentId: snap.tournament.id,
          slug: `_/${fixture}`,
          lookup: fx.lookup,
          me: { ...fx.me, via: 'device', ...me },
          refresh,
          leave: async () => undefined,
          ...ctx,
        }}
      >
        <Routes>
          <Route path="/t/_/:name" element={screenEl === 'live' ? <LiveScreen /> : <CeremonyScreen />} />
          <Route path="/entrar" element={<Where />} />
        </Routes>
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return { refresh, fx }
}
const card = () => screen.queryByRole('heading', { name: S.title })

beforeEach(() => {
  auth.state = { ready: true, user: { id: 'anon' }, isAnonymous: true }
  link.mockClear()
})
afterEach(() => cleanup())

describe('«Guarda tus rondas» on En vivo once Terminado (STRAT-08)', () => {
  it('an anonymous phone on a PIN goes to /entrar and comes back to the tournament', () => {
    open('full12-finished', 'live')
    expect(card()).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: S.action }))
    expect(screen.getByTestId('where').textContent).toBe(`/entrar?next=${encodeURIComponent('/t/_/full12-finished')}`)
  })

  it('a phone with an account, here by its PIN, saves the tournament in it at once', async () => {
    auth.state = { ready: true, user: { id: 'u1' }, isAnonymous: false }
    const { refresh, fx } = open('full12-finished', 'live')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: S.actionHere })))
    expect(link).toHaveBeenCalledWith(fx.me.playerId)
    expect(refresh).toHaveBeenCalled()
  })

  it('nothing for a linked player, the Comité with no player, a link to watch, or a tournament still under way', () => {
    auth.state = { ready: true, user: { id: 'u1' }, isAnonymous: false }
    open('full12-finished', 'live', {}, { via: 'profile' })
    expect(card()).toBeNull()
    cleanup()
    open('full12-finished', 'live', {}, { playerId: null })
    expect(card()).toBeNull()
    cleanup()
    auth.state = { ready: true, user: { id: 'anon' }, isAnonymous: true }
    open('full12-finished', 'live', { spectator: { money: true, url: 'https://polo.example/v/x' } })
    expect(card()).toBeNull()
    cleanup()
    open('full12-live', 'live')
    expect(card()).toBeNull()
  })
})

describe('«Guarda tus rondas» at the Ceremonia’s end (STRAT-08)', () => {
  it('follows «Fin.»: the end of the trip is where it is offered', () => {
    open('full12-finished', 'ceremony')
    fireEvent.click(screen.getByRole('button', { name: t.ceremony.start }))
    for (let i = 0; i < 60 && !screen.getByRole('button', { name: t.ceremony.next }).hasAttribute('disabled'); i++)
      fireEvent.click(screen.getByRole('button', { name: t.ceremony.next }))
    expect(screen.getByText(t.ceremony.done)).toBeTruthy()
    expect(card()).toBeTruthy()
    expect(screen.getByRole('link', { name: S.action }).getAttribute('href')).toBe(
      `/entrar?next=${encodeURIComponent('/t/_/full12-finished')}`,
    )
  })
})
