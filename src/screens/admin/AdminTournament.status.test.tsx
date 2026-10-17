// @vitest-environment happy-dom
/**
 * A11Y-17: the tournament's state was a row of fake tabs whose every «tab»
 * moved the tournament (to En juego, to Terminado) the moment it was chosen.
 * It is a radio group now, and choosing asks first, so an arrow key or a stray
 * tap changes nothing on its own.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ updateTournament: vi.fn(async () => undefined) }))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  updateTournament: api.updateTournament,
}))
vi.mock('./entryInfo', () => ({ useEntryInfo: () => null }))

import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { getFixture } from '../../dev/fixtures'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/tournamentContext'
import { AdminTournament } from './AdminTournament'

const A = t.admin.tournament

function mount(fixture: string) {
  const fx = getFixture(fixture)!
  const snap: Snapshot = structuredClone(fx.snapshot)
  useTournament.setState({
    tournamentId: snap.tournament.id,
    data: dataFromSnapshot(snap),
    reload: async () => undefined,
    loading: false,
    error: null,
    realtime: 'off',
  })
  render(
    <MemoryRouter>
      <TournamentContext.Provider
        value={{
          tournamentId: snap.tournament.id,
          slug: snap.tournament.slug,
          lookup: fx.lookup,
          me: { playerId: null, isOrganizer: true, isComite: true },
          refresh: async () => undefined,
          leave: async () => undefined,
        }}
      >
        <AdminTournament />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return snap
}

afterEach(() => {
  cleanup()
  api.updateTournament.mockClear()
})

describe('Torneo › Estado: the state is a choice that asks first (A11Y-17)', () => {
  it('a radio group, one Tab stop, the current state checked', async () => {
    const snap = mount('full12-live')
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: A.tabs.status })))
    const group = screen.getByRole('radiogroup', { name: A.status })
    const radios = Array.from(group.querySelectorAll('[role="radio"]')) as HTMLElement[]
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent)).toEqual([
      t.status[snap.tournament.status],
    ])
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1)
  })

  it('an arrow key moves the choice, and nothing changes until it is confirmed', async () => {
    mount('full12-live')
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: A.tabs.status })))
    const checked = screen.getByRole('radio', { checked: true })
    await act(async () => fireEvent.keyDown(checked, { key: 'ArrowLeft' }))
    expect(api.updateTournament).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain(A.statusConfirmBody)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: t.common.cancel })))
    expect(api.updateTournament).not.toHaveBeenCalled()
  })

  it('confirmed, it changes', async () => {
    mount('full12-live')
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: A.tabs.status })))
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: t.status.setup })))
    expect(api.updateTournament).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    await act(async () =>
      fireEvent.click(
        Array.from(dialog.querySelectorAll('button')).find(
          (b) => b.textContent !== t.common.cancel && b.className.includes('primary'),
        )!,
      ),
    )
    expect(api.updateTournament).toHaveBeenCalledWith(expect.any(String), { status: 'setup' })
  })
})
