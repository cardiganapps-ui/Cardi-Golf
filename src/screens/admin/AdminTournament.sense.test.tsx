// @vitest-environment happy-dom
/**
 * MONEY-13: a tournament could hold settings the schema accepts but that
 * make no sense, and Torneo showed the check green. Now Torneo names each
 * one beside Guardar, on what is stored as well as on a draft, and saves
 * nothing until it is fixed; the editor no longer offers what does nothing
 * (guests bidding) or past what the rules allow.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ updateSettings: vi.fn(async () => ({ settings: {}, name: 'x', tagline: null, accent_color: null })) }))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), updateSettings: api.updateSettings }))
vi.mock('./entryInfo', () => ({ useEntryInfo: () => null }))

import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { getFixture } from '../../dev/fixtures'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminTournament } from './AdminTournament'

const A = t.admin.tournament
const S = t.admin.sense

function mount(edit: (s: TournamentSettings) => void) {
  const fx = getFixture('full12-live')!
  const snap: Snapshot = structuredClone(fx.snapshot)
  edit(snap.tournament.settings as TournamentSettings)
  useTournament.setState({ tournamentId: snap.tournament.id, data: dataFromSnapshot(snap), reload: async () => undefined, loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: snap.tournament.slug, lookup: fx.lookup, me: { playerId: null, isOrganizer: true, isAdmin: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminTournament />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
const click = (el: HTMLElement) => act(async () => fireEvent.click(el))
const type = (el: HTMLElement, value: string) => act(async () => fireEvent.change(el, { target: { value } }))
const saveButton = () => screen.getByRole('button', { name: t.common.save }) as HTMLButtonElement

afterEach(() => {
  cleanup()
  api.updateSettings.mockClear()
})

describe('Torneo refuses settings that make no sense (MONEY-13)', () => {
  it('what is stored is named beside Guardar, and nothing saves until it is fixed', async () => {
    mount((s) => (s.handicap.cap = 0))
    // Stored, nothing typed yet: the Comité sees it.
    expect(screen.getByText(S.cap)).toBeTruthy()
    await click(screen.getByRole('tab', { name: A.tabs.rules }))
    await type(screen.getByLabelText(A.lastPlaceLabel), 'La Cuchara')
    expect(saveButton().disabled).toBe(true)
    await click(saveButton())
    expect(api.updateSettings).not.toHaveBeenCalled()
    // Fixed: the line goes, and Guardar saves.
    await type(screen.getByLabelText(A.cap), '54')
    expect(screen.queryByText(S.cap)).toBeNull()
    expect(saveButton().disabled).toBe(false)
  })

  it('a Calcutta that pays a place nobody can take holds the save, named with the field', async () => {
    mount((s) => (s.auction.payout = [{ slot: 'place', place: 1, share: 0.5 }, { slot: 'place', place: 40, share: 0.5 }]))
    expect(screen.getByText(S.placeUnreachable('40.º', '12 jugadores'))).toBeTruthy()
  })

  it('the editor offers no switch wired to nothing, and says what 0 % means', async () => {
    mount((s) => (s.handicap.allowance = 0))
    await click(screen.getByRole('tab', { name: A.tabs.rules }))
    expect(screen.getByText(S.scratch)).toBeTruthy()
    await click(screen.getByRole('tab', { name: A.tabs.auction }))
    expect(screen.queryByText('Pueden pujar invitados')).toBeNull()
  })
})
