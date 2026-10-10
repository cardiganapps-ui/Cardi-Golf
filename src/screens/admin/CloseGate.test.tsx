// @vitest-environment happy-dom
/**
 * «Cerrar torneo» (MONEY-05) in the Comité: Datos › «Publicar resultados»
 * waits until nothing is left open. On `full12-finished` (marked Terminado
 * before this gate existed) the snake's money is held by unanswered
 * tiebreaks and cards are unsigned: publishing is refused with the list of
 * what to settle and where. The held money is not «por asignar»: answering is
 * the way out. A hole the server kept for the Comité is on the list too
 * (REL-08: «Pendientes de revisar» resolves it). Nothing is published.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const server = vi.hoisted(() => ({ rejected: 0 as number | null, published: 0 }))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), openRejectedWrites: vi.fn(async () => server.rejected) }))
vi.mock('../../data/publish', () => ({ publishFromStore: vi.fn(async () => void server.published++) }))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminData } from './AdminData'

const C = t.closeGate

function mount() {
  const fx = getFixture('full12-finished')!
  const snap = structuredClone(fx.snapshot)
  useTournament.setState({ tournamentId: 'fixture:full12-finished', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: 'full12-finished', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminData />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
const settle = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
})

afterEach(() => {
  cleanup()
  server.rejected = 0
  server.published = 0
})

describe('«Publicar resultados» waits for the close (MONEY-05)', () => {
  it('blocked: the open items are listed with where to fix them, and nothing is published', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: t.admin.data.publishButton }))
    const sheet = within(await screen.findByRole('dialog', { name: C.title }))
    expect(sheet.getByText(C.blocked)).toBeTruthy()
    const items = sheet.getAllByRole('listitem').map((li) => li.textContent)
    expect(items.some((x) => x?.includes('desempate'))).toBe(true)
    expect(items.some((x) => x?.endsWith('por asignar: el Comité decide en Dinero, Liquidación.'))).toBe(false)
    expect(items.some((x) => x?.includes('sin firmar'))).toBe(true)
    expect(sheet.queryByRole('button', { name: t.admin.data.publishButton })).toBeNull()
    fireEvent.click(sheet.getByRole('button', { name: C.understood }))
    await settle()
    expect(server.published).toBe(0)
  })

  it('a hole the server kept for the Comité is one more item: the results wait until it is resolved (REL-08)', async () => {
    server.rejected = 2
    mount()
    fireEvent.click(screen.getByRole('button', { name: t.admin.data.publishButton }))
    const sheet = within(await screen.findByRole('dialog', { name: C.title }))
    expect(sheet.getAllByRole('listitem').map((li) => li.textContent)).toContain(C.rejectedWrites(2))
    expect(sheet.queryByRole('button', { name: t.admin.data.publishButton })).toBeNull()
    fireEvent.click(sheet.getByRole('button', { name: C.understood }))
    expect(server.published).toBe(0)
  })

  it('a server without «Pendientes de revisar» yet (0028 not applied): the list is not on it, the sheet says so beside the rest', async () => {
    server.rejected = null
    mount()
    fireEvent.click(screen.getByRole('button', { name: t.admin.data.publishButton }))
    const sheet = within(await screen.findByRole('dialog', { name: C.title }))
    expect(sheet.getByText(C.rejectedUnavailable)).toBeTruthy()
    expect(sheet.getAllByRole('listitem').map((li) => li.textContent)).not.toContain(C.rejectedUnavailable)
    expect(sheet.getAllByRole('listitem').some((li) => li.textContent?.includes('sin revisar'))).toBe(false)
  })
})
