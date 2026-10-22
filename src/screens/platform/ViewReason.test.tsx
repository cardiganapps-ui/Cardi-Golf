// @vitest-environment happy-dom
/**
 * TRUST-22: the Admin de Polo opened any tournament, account or crew without a trace. Now the server asks for his
 * reason (PV001, 0068) and logs it; the panel answers by asking, in place of the detail, and opens it once he
 * types one. A change made from the detail reloads without asking again (the server lets two hours go by).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../data/apiError'
import { PlatformApiContext, type PlatformApi, type PlatformCrew, type PlatformTournament } from '../../data/platform'
import { t } from '../../i18n/es-MX'
import { TournamentDetail } from './TournamentDetail'
import { CrewDetail } from './CatalogCrews'

const V = t.platform.view
afterEach(cleanup)

const tournament: PlatformTournament = {
  id: 't1',
  slug: 'copa',
  name: 'Copa del Jueves',
  tagline: null,
  logoUrl: null,
  status: 'live',
  joinCode: 'COPA12',
  quick: false,
  practice: false,
  protected: false,
  createdAt: '2026-10-01T00:00:00Z',
  timezone: 'America/Mazatlan',
  currency: 'MXN',
  crew: null,
  unlockedUntil: null,
  organizers: [],
  rounds: [],
  counts: { players: 4, linked: 0, devices: 0, groups: 1, payments: 0, disputes: 0 },
  audit: [],
}
const crew: PlatformCrew = {
  id: 'c1',
  slug: 'jueves',
  name: 'Los jueves',
  createdAt: '2026-10-01T00:00:00Z',
  ownerId: 'p1',
  members: [],
  outings: [],
  activity: [],
}

/** The server's rule: a reason the first time, none after. */
function server() {
  let seen = false
  const ask = <T,>(value: T) =>
    vi.fn(async (_id: string, reason?: string) => {
      if (!reason && !seen)
        throw new ApiError('Escribe por qué lo abres: queda en el registro, y lo ve a quien le toca.', 'PV001')
      seen = true
      return value
    })
  return { tournament: ask(tournament), crew: ask(crew) }
}

function mount(path: string, api: Partial<PlatformApi>) {
  return render(
    <PlatformApiContext.Provider value={api as PlatformApi}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/torneos/:id" element={<TournamentDetail />} />
          <Route path="/admin/crews/:id" element={<CrewDetail />} />
        </Routes>
      </MemoryRouter>
    </PlatformApiContext.Provider>,
  )
}

describe('the admin says why before a detail opens (TRUST-22)', () => {
  it('a tournament: asked first, opened with the reason, and the reason sent as typed', async () => {
    const api = server()
    mount('/admin/torneos/t1', api)
    expect(await screen.findByRole('heading', { name: V.title })).toBeTruthy()
    expect(screen.getByText(V.body.tournament)).toBeTruthy()
    expect(screen.queryByText('Copa del Jueves')).toBeNull()
    const open = screen.getByRole('button', { name: V.open }) as HTMLButtonElement
    // Under three characters there is nothing to send.
    fireEvent.change(screen.getByLabelText(t.platform.reason), { target: { value: ' ok ' } })
    expect(open.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(t.platform.reason), { target: { value: '  Soporte: no ve su marcador ' } })
    await act(async () => fireEvent.click(open))
    expect(await screen.findByRole('heading', { name: 'Copa del Jueves' })).toBeTruthy()
    expect(api.tournament).toHaveBeenLastCalledWith('t1', 'Soporte: no ve su marcador')
  })

  it('a crew: the same, and its detail shows no join code', async () => {
    const api = server()
    mount('/admin/crews/c1', api)
    expect(await screen.findByText(V.body.crew)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(t.platform.reason), { target: { value: 'Reportaron a un intruso' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: V.open })))
    expect(await screen.findByRole('heading', { name: 'Los jueves' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('JUEV3S')
    expect(document.body.textContent).not.toContain('Código ')
  })

  it('once given, a reload opens with no question', async () => {
    const api = server()
    await api.tournament('t1', 'Antes')
    mount('/admin/torneos/t1', api)
    expect(await screen.findByRole('heading', { name: 'Copa del Jueves' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: V.title })).toBeNull()
  })
})
