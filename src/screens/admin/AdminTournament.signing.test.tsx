// @vitest-environment happy-dom
/**
 * UX-23: Comité › Torneo › Reglas says who signs the cards. A tournament
 * stored without the setting shows the rule it always had; the pairs' rule is
 * offered only with the pairs game; a change saves only that key; and the
 * pairs' rule stored with the game off holds the save until it is changed.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ updateSettings: vi.fn(async (_tid: string, _seen: unknown, _set: unknown) => ({ settings: {}, name: 'x', tagline: null, accent_color: null })) }))
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

function mount(fixture: string, edit: (s: TournamentSettings) => void = () => undefined) {
  const fx = getFixture(fixture)!
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
const field = () => screen.getByLabelText(new RegExp(`^${A.cardSigning}`)) as HTMLSelectElement
const options = () => [...field().options].map((o) => o.value)
const saveButton = () => screen.getByRole('button', { name: t.common.save }) as HTMLButtonElement

afterEach(() => {
  cleanup()
  api.updateSettings.mockClear()
})

describe('Torneo: who signs the cards (UX-23)', () => {
  it('the first tournament, stored without the setting: the pairs’ rule, explained, and the others offered', async () => {
    mount('full12-live')
    await click(screen.getByRole('tab', { name: A.tabs.rules }))
    expect(field().value).toBe('pairs')
    expect(options()).toEqual(['pairs', 'marker', 'none'])
    expect(screen.getByText(A.cardSigningHint.pairs)).toBeTruthy()
  })

  it('without the pairs game: no pairs’ rule to pick, and a marker saved as the one key changed', async () => {
    mount('minimal4-live')
    await click(screen.getByRole('tab', { name: A.tabs.rules }))
    expect(field().value).toBe('none')
    expect(options()).toEqual(['marker', 'none'])
    await act(async () => fireEvent.change(field(), { target: { value: 'marker' } }))
    expect(screen.getByText(A.cardSigningHint.marker)).toBeTruthy()
    await click(saveButton())
    expect(api.updateSettings).toHaveBeenCalledOnce()
    const set = api.updateSettings.mock.calls[0]![2] as Record<string, unknown>
    expect(set).toEqual({ settings: { cardSigning: 'marker' } })
  })

  it('the pairs’ rule stored with the game off is named beside Guardar until it is changed', async () => {
    mount('minimal4-live', (s) => (s.cardSigning = 'pairs'))
    expect(screen.getByText(t.admin.sense.signingPairs('Parejas'))).toBeTruthy()
    await click(screen.getByRole('tab', { name: A.tabs.rules }))
    expect(field().value).toBe('pairs')
    expect(options()).toEqual(['pairs', 'marker', 'none'])
    await act(async () => fireEvent.change(field(), { target: { value: 'none' } }))
    expect(screen.queryByText(t.admin.sense.signingPairs('Parejas'))).toBeNull()
    expect(saveButton().disabled).toBe(false)
  })
})
