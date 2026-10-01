// @vitest-environment happy-dom
/**
 * UX-06: «Para empezar» at the top of Comité › Torneo. Each line says what is
 * done or missing and opens the section that fixes it; a screen reader hears
 * which is which. «Listo para jugar» waits for the PINs; once the tournament
 * is under way the card prepares the next day.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ playersWithPin: vi.fn(), tournamentProfiles: vi.fn(async () => [] as unknown[]) }))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), playersWithPin: api.playersWithPin }))
vi.mock('../../data/profiles', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/profiles')>()), tournamentProfiles: api.tournamentProfiles }))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'
import { entryChanged } from './entryInfo'
import { ReadinessCard } from './ReadinessCard'

const R = t.admin.ready
let tid = 0

function mount(name: string, edit?: (s: Snapshot) => void, tournamentId = `t-real-${++tid}`) {
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
  api.tournamentProfiles.mockReset()
  api.tournamentProfiles.mockResolvedValue([])
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
    const { unmount } = mount('minimal4-setup', undefined, 't-pins')
    expect(await screen.findByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(1)}` })).toBeTruthy()
    expect(api.playersWithPin).toHaveBeenCalledWith('t-pins')
    // A PIN set in Jugadores: the card asks again.
    api.playersWithPin.mockResolvedValue(new Set(['p1', 'p2', 'p3', 'p4']))
    await act(async () => entryChanged())
    expect(await screen.findByText(R.allSet)).toBeTruthy()
    expect(api.playersWithPin).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('a player linked to an account needs no PIN', async () => {
    api.playersWithPin.mockResolvedValue(new Set(['p1', 'p2', 'p3']))
    api.tournamentProfiles.mockResolvedValue([{ playerId: 'p4', handle: 'camilo', displayName: 'Camilo', avatarUrl: null, status: 'confirmed' }])
    mount('minimal4-setup')
    expect(await screen.findByText(R.allSet)).toBeTruthy()
  })

  it('ready to play: one quiet line instead of the list, and only once the PINs are known', async () => {
    let answer: (pins: Set<string>) => void = () => undefined
    api.playersWithPin.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    mount('minimal4-setup')
    // Everything else is done, but nobody knows the PINs yet: no «Listo».
    expect(screen.queryByText(R.allSet)).toBeNull()
    await act(async () => answer(new Set(['p1', 'p2', 'p3', 'p4'])))
    expect(await screen.findByText(R.allSet)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: R.title })).toBeNull()
  })

  it('without signal the PINs stay unknown, and «Listo» is not said', async () => {
    api.playersWithPin.mockRejectedValue(new Error('Sin conexión'))
    mount('minimal4-setup')
    await waitFor(() => expect(api.playersWithPin).toHaveBeenCalled())
    await act(async () => undefined)
    expect(screen.queryByText(R.allSet)).toBeNull()
  })

  it('a quick round, created ready to play, never shows it', () => {
    api.playersWithPin.mockResolvedValue(new Set())
    mount('new-setup', (s) => {
      s.tournament.quick = true
    })
    expect(screen.queryByRole('heading', { name: R.title })).toBeNull()
  })

  it('the design fixtures, with no server, count their players as able to get in', () => {
    mount('minimal4-setup', undefined, 'fixture:minimal4-setup')
    expect(api.playersWithPin).not.toHaveBeenCalled()
    expect(screen.getByText(R.allSet)).toBeTruthy()
  })

  it('under way: the card prepares the next day, and the groups line opens Grupos on it', async () => {
    api.playersWithPin.mockResolvedValue(new Set(getFixture('bracket8')!.snapshot.players.map((p) => p.id)))
    mount('bracket8')
    expect(await screen.findByRole('heading', { name: R.titleNext(2) })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: R.title })).toBeNull()
    const groups = screen.getByRole('link', { name: `${R.todoLabel}: ${R.groupsMissing(2)}` })
    expect(groups.getAttribute('href')).toBe('/t/viaje/admin/grupos?ronda=r2')
  })
})
