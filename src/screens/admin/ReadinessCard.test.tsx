// @vitest-environment happy-dom
/**
 * UX-06: «Para empezar» at the top of Comité › Torneo. Each line says what is
 * done or missing and opens the section that fixes it; a screen reader hears
 * which is which.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ playersWithPin: vi.fn() }))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), playersWithPin: api.playersWithPin }))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'
import { ReadinessCard } from './ReadinessCard'

const R = t.admin.ready

function mount(name: string, edit?: (s: Snapshot) => void, tournamentId = 't-real') {
  const fx = getFixture(name)!
  const snapshot = structuredClone(fx.snapshot)
  edit?.(snapshot)
  useTournament.setState({ tournamentId, data: dataFromSnapshot(snapshot) })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId, slug: 'viaje', lookup: fx.lookup, me: { playerId: null, isOrganizer: true, isAdmin: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <ReadinessCard />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  api.playersWithPin.mockReset()
})

describe('Para empezar (UX-06)', () => {
  it('a new tournament: each missing thing links to the section that fixes it', () => {
    api.playersWithPin.mockResolvedValue(new Set())
    mount('new-setup')
    expect(screen.getByRole('heading', { name: R.title })).toBeTruthy()
    const players = screen.getByRole('link', { name: `${R.todoLabel}: ${R.playersMissing}` })
    expect(players.getAttribute('href')).toBe('/t/viaje/admin/jugadores')
    const rounds = screen.getByRole('link', { name: `${R.todoLabel}: ${R.roundSetupMissing('día 1 y día 2')}` })
    expect(rounds.getAttribute('href')).toBe('/t/viaje/admin/rondas')
    expect(screen.getByRole('link', { name: `${R.doneLabel}: ${R.rounds(2)}` })).toBeTruthy()
  })

  it('the PIN line arrives with the server\'s answer', async () => {
    api.playersWithPin.mockResolvedValue(new Set(['p1', 'p2', 'p3']))
    mount('minimal4-setup')
    expect(await screen.findByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(1)}` })).toBeTruthy()
    expect(api.playersWithPin).toHaveBeenCalledWith('t-real')
  })

  it('ready to play: one quiet line instead of the list', async () => {
    api.playersWithPin.mockResolvedValue(new Set(['p1', 'p2', 'p3', 'p4']))
    mount('minimal4-setup')
    await waitFor(() => expect(api.playersWithPin).toHaveBeenCalled())
    expect(await screen.findByText(R.allSet)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: R.title })).toBeNull()
  })

  it('a quick round, created ready to play, never shows it', () => {
    api.playersWithPin.mockResolvedValue(new Set())
    mount('new-setup', (s) => {
      s.tournament.quick = true
    })
    expect(screen.queryByRole('heading', { name: R.title })).toBeNull()
  })

  it('the design fixtures, with no server, leave the PIN line out instead of guessing', () => {
    mount('new-setup', undefined, 'fixture:new-setup')
    expect(api.playersWithPin).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: R.title })).toBeTruthy()
  })
})
