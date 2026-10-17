// @vitest-environment happy-dom
/**
 * UX-23: Comité › Tarjetas under a marker's rule (`firma4`: four players, the
 * day captured, Beto's card signed). «Pendientes» names each player whose card
 * waits for its signature, «Ver» opens it, and a signed card's «Quitar firma»
 * takes that player's signature off.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  unsignPlayerCard: vi.fn(async () => undefined),
  unsignCard: vi.fn(async () => undefined),
}))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  unsignPlayerCard: api.unsignPlayerCard,
  unsignCard: api.unsignCard,
}))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/tournamentContext'
import { AdminScores } from './AdminScores'

const IB = t.admin.inbox
const SC = t.admin.scores

function mount() {
  const fx = getFixture('firma4')!
  const snap = structuredClone(fx.snapshot)
  useTournament.setState({
    tournamentId: 'fixture:firma4',
    data: dataFromSnapshot(snap),
    loading: false,
    error: null,
    realtime: 'off',
    reload: async () => undefined,
  } as never)
  render(
    <MemoryRouter>
      <TournamentContext.Provider
        value={{
          tournamentId: snap.tournament.id,
          slug: '_/firma4',
          lookup: fx.lookup,
          me: { playerId: null, isOrganizer: true, isComite: true },
          refresh: async () => undefined,
          leave: async () => undefined,
        }}
      >
        <AdminScores />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return (id: string) => snap.players.find((p) => p.id === id)!.displayName
}

afterEach(() => {
  cleanup()
  api.unsignPlayerCard.mockClear()
  api.unsignCard.mockClear()
})

describe('Comité › Tarjetas under a marker’s rule (UX-23)', () => {
  it('«Pendientes» names each player whose card waits, and «Ver» opens it', () => {
    const name = mount()
    for (const id of ['p1', 'p3', 'p4']) expect(screen.getByText(IB.unsigned(name(id)))).toBeTruthy()
    expect(screen.queryByText(IB.unsigned(name('p2')))).toBeNull()
    fireEvent.click(
      within(screen.getByText(IB.unsigned(name('p3'))).closest('div')!).getByRole('button', { name: IB.view }),
    )
    expect((screen.getByRole('combobox', { name: SC.player }) as HTMLSelectElement).value).toBe('p3')
  })

  it('a signed card says so, and «Quitar firma» takes that player’s signature off', async () => {
    mount()
    fireEvent.change(screen.getByRole('combobox', { name: SC.player }), { target: { value: 'p2' } })
    expect(screen.getByText(new RegExp(SC.signedLine))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: SC.unsign }))
    const dialog = screen.getByRole('dialog', { name: SC.unsign })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: SC.unsign })))
    expect(api.unsignPlayerCard).toHaveBeenCalledWith('r1', 'p2')
    expect(api.unsignCard).not.toHaveBeenCalled()
  })
})
