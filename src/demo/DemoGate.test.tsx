// @vitest-environment happy-dom
/**
 * STRAT-17: `/demo` shows a finished tournament on the link to watch's own
 * read-only screens, «Con dinero», with made-up people, and says so. It
 * starts no session and keeps nothing: it is a link page, and its boards go
 * from memory when it closes.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ ensureSession: vi.fn(), init: vi.fn() }))
vi.mock('../data/auth', async (orig) => ({ ...(await orig<typeof import('../data/auth')>()), ensureSession: auth.ensureSession }))

import { t } from '../i18n/es-MX'
import { useTournament } from '../data/tournamentStore'
import { isLinkPage } from '../lib/linkPage'
import { useTournamentCtx } from '../screens/tournament/tournamentContext'
import { DemoGate } from './DemoGate'
import { DEMO_ID } from './demoTournament'
const { LiveScreen } = await import('../screens/tournament/LiveScreen')

function Ctx() {
  const c = useTournamentCtx()
  return <p data-testid="ctx">{JSON.stringify({ me: c.me, spectator: c.spectator, base: c.base })}</p>
}

function open() {
  return render(
    <MemoryRouter initialEntries={['/demo']}>
      <Routes>
        <Route path="/demo" element={<DemoGate />}>
          <Route
            index
            element={
              <>
                <Ctx />
                <LiveScreen />
              </>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => cleanup())

describe('the example tournament (STRAT-17)', () => {
  it('shows the finished board, read-only, nobody’s phone, with money', () => {
    open()
    const ctx = JSON.parse(screen.getByTestId('ctx').textContent!)
    expect(ctx.me).toEqual({ playerId: null, isOrganizer: false, isComite: false, via: null })
    expect(ctx.spectator).toMatchObject({ money: true, demo: true })
    expect(ctx.base).toBe('/demo')
    expect(screen.getByText(t.demo.intro)).toBeTruthy()
    expect(screen.getByText(t.demo.introHint)).toBeTruthy()
    expect(screen.getByRole('link', { name: t.demo.organize }).getAttribute('href')).toBe('/organizer/login')
    // The Tarjeta's way in is nobody's here.
    expect(screen.queryByText(/Anotar el hoyo/)).toBeNull()
    expect(useTournament.getState().tournamentId).toBe(DEMO_ID)
  })

  it('starts no session, is a link page, and forgets its boards when it closes', () => {
    const { unmount } = open()
    expect(auth.ensureSession).not.toHaveBeenCalled()
    expect(isLinkPage('/demo')).toBe(true)
    expect(isLinkPage('/demo/tv')).toBe(true)
    unmount()
    expect(useTournament.getState().tournamentId).toBeNull()
    expect(useTournament.getState().data).toBeNull()
  })
})

describe('the example’s header (STRAT-17)', () => {
  it('says no connection and no age: its boards come from no server', () => {
    open()
    expect(useTournament.getState().source).toBeNull()
    expect(screen.queryByText(t.sync.connecting)).toBeNull()
    expect(screen.queryByText(/Actualizado/)).toBeNull()
  })
})
