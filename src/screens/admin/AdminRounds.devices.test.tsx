// @vitest-environment happy-dom
/**
 * Rondas › «Teléfonos del torneo» (STRAT-02): the phones' heartbeats (0037)
 * tell the Comité which phone still has holes to send, by its player, and
 * «Terminar ronda» names them before the day closes and their holes are
 * refused. A database without 0037 says the list is not available.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', async (original) => ({ ...(await original<typeof import('../../lib/supabase')>()), supabase: () => ({ rpc }) }))
vi.mock('../../data/api', async (original) => ({ ...(await original<typeof import('../../data/api')>()), openRejectedWrites: vi.fn(async () => 0) }))
vi.mock('./useCourses', async () => {
  const { getFixture } = await import('../../dev/fixtures')
  return { useCourses: () => ({ courses: getFixture('full12-live')!.snapshot.courses, loading: false, reload: async () => undefined }) }
})

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { useRejectedInbox } from '../../data/rejectedInbox'
import { loadTournamentDevices, useTournamentDevices, type TournamentDevice } from '../../data/tournamentDevices'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminRounds } from './AdminRounds'

const R = t.admin.rounds
const D = t.admin.devices
const fx = getFixture('full12-live')!
const tid = fx.snapshot.tournament.id
const name = (id: string) => fx.snapshot.players.find((p) => p.id === id)!.displayName

afterEach(() => {
  cleanup()
  rpc.mockReset()
  useRejectedInbox.setState({ tournamentId: null, items: [], status: 'idle', error: null, fixture: false })
  useTournamentDevices.setState({ tournamentId: null, items: [], status: 'idle', fixture: false })
})

function mount(devices: TournamentDevice[] | null) {
  if (devices) useTournamentDevices.setState({ tournamentId: tid, items: devices, status: 'ready', fixture: true })
  useRejectedInbox.setState({ tournamentId: tid, items: [], status: 'ready', error: null, fixture: true })
  const snapshot = structuredClone(fx.snapshot)
  useTournament.setState({ tournamentId: tid, data: dataFromSnapshot(snapshot) })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: tid, slug: 'viaje', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminRounds />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}

describe('Rondas › Teléfonos del torneo', () => {
  it('lists the phone behind first, by its player, with how many holes and since when', () => {
    mount(fx.devices!)
    const list = screen.getByRole('region', { name: D.title })
    const rows = [...list.querySelectorAll('strong, span')].map((x) => x.textContent)
    const first = rows.indexOf(name('p5'))
    expect(first).toBeGreaterThan(-1)
    expect(rows.indexOf(name('p1'))).toBeGreaterThan(first)
    expect(list.textContent).toMatch(/3 hoyos sin mandar, el primero /)
    expect(list.textContent).toContain(D.rejected(1))
    expect(list.textContent).toContain(D.noPlayer)
    expect(list.textContent).toContain(D.clear)
  })

  it('«Terminar ronda» names the phones with holes to send', () => {
    mount(fx.devices!)
    fireEvent.click(screen.getByRole('button', { name: R.finish }))
    const dialog = screen.getByRole('dialog', { name: R.finish })
    expect(dialog.textContent).toContain(R.devicesBeforeFinish(3, [name('p5')]))
    expect(dialog.textContent).toContain(R.phonesBeforeFinish)
  })

  it('…and says nothing of phones when none has holes to send', () => {
    mount(fx.devices!.map((d) => ({ ...d, pending: 0 })))
    fireEvent.click(screen.getByRole('button', { name: R.finish }))
    expect(screen.getByRole('dialog', { name: R.finish }).textContent).not.toContain('sin mandar (Teléfonos')
  })

  it('names two or more phones in one sentence', () => {
    expect(R.devicesBeforeFinish(5, ['Justo', 'Diego'])).toBe('Los teléfonos de Justo y Diego reportan 5 hoyos sin mandar (Teléfonos del torneo, abajo).')
    expect(R.devicesBeforeFinish(1, ['Justo'])).toBe('El teléfono de Justo reporta un hoyo sin mandar (Teléfonos del torneo, abajo).')
  })
})

describe('reading the list', () => {
  it('a database without 0037 is «no disponible», never an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    await loadTournamentDevices(tid)
    expect(useTournamentDevices.getState()).toMatchObject({ tournamentId: tid, status: 'unavailable', items: [] })
    // The screen reads it again when it opens: the answer is the same.
    mount(null)
    expect(await screen.findByText(D.unavailable)).toBeTruthy()
  })

  it('a refusal or no signal is an error the screen says, and a new read clears it', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Solo el Comité' } })
    await loadTournamentDevices(tid)
    expect(useTournamentDevices.getState().status).toBe('error')
    rpc.mockResolvedValueOnce({ data: [], error: null })
    await loadTournamentDevices(tid)
    expect(useTournamentDevices.getState()).toMatchObject({ status: 'ready', items: [] })
    expect(rpc).toHaveBeenCalledWith('tournament_devices', { p_tournament_id: tid })
  })

  it('a fixture\'s list is never read from a server', async () => {
    useTournamentDevices.setState({ tournamentId: tid, items: fx.devices!, status: 'ready', fixture: true })
    await loadTournamentDevices(tid)
    expect(rpc).not.toHaveBeenCalled()
  })
})
