// @vitest-environment happy-dom
/**
 * TRUST-24: nothing showed which phones held a player's PIN, so a second one
 * took him without a word. Comité › Jugadores now says when a player is on
 * more than one phone, and his PIN sheet lists them, numbered as Historial
 * numbers them, each with «Sacar» and a reason.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { PinPhone } from '../../data/pinPhones'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/tournamentContext'

const fx = getFixture('full12-live')!
const ana = fx.snapshot.players[0]!
const beto = fx.snapshot.players[1]!
const server = vi.hoisted(() => ({ phones: [] as PinPhone[] }))
const pins = vi.hoisted(() => ({
  playerPhones: vi.fn(async () => server.phones),
  releasePhone: vi.fn(async (id: number) => void (server.phones = server.phones.filter((p) => p.id !== id))),
}))
vi.mock('../../data/pinPhones', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/pinPhones')>()), playerPhones: pins.playerPhones, releasePhone: pins.releasePhone }))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), playersWithPin: vi.fn(async () => new Set<string>()) }))
vi.mock('../../data/profiles', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/profiles')>()), useTournamentProfiles: () => [[], () => undefined] }))
const { AdminPlayers } = await import('./AdminPlayers')

const P = t.admin.players

function mount() {
  useTournament.setState({ tournamentId: 't-phones', data: dataFromSnapshot(structuredClone(fx.snapshot)), reload: async () => undefined })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 't-phones', slug: 'nacho', lookup: fx.lookup, me: { playerId: null, isOrganizer: true, isComite: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminPlayers />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
/** The player's row: its name button and its PIN button (the module's `row` class, not `rowTitle` or `rowSub`). */
const rowOf = (name: string) => screen.getByText(name).closest('[class*="_row_"]') as HTMLElement

afterEach(() => {
  cleanup()
  pins.playerPhones.mockClear()
  pins.releasePhone.mockClear()
})

describe('the phones holding a player’s PIN (TRUST-24)', () => {
  it('a player on two phones says so on his row; one on a single phone says nothing', async () => {
    server.phones = [
      { id: 1, playerId: ana.id, kind: 'other', since: '2027-04-08T20:00:00Z', n: 1, of: 2 },
      { id: 2, playerId: ana.id, kind: 'ios', since: '2027-04-09T15:00:00Z', n: 2, of: 2 },
      { id: 3, playerId: beto.id, kind: 'android', since: '2027-04-08T20:05:00Z', n: 1, of: 1 },
    ]
    mount()
    expect(await within(rowOf(ana.fullName)).findByText(new RegExp(P.phonesCount(2)))).toBeTruthy()
    expect(within(rowOf(beto.fullName)).queryByText(/teléfonos/)).toBeNull()
  })

  it('his PIN sheet lists them, numbered as Historial numbers them, and «Sacar» takes one off with a reason', async () => {
    server.phones = [
      { id: 1, playerId: ana.id, kind: 'other', since: '2027-04-08T20:00:00Z', n: 1, of: 2 },
      { id: 2, playerId: ana.id, kind: 'ios', since: '2027-04-09T15:00:00Z', n: 2, of: 2 },
    ]
    mount()
    await within(rowOf(ana.fullName)).findByText(new RegExp(P.phonesCount(2)))
    await act(async () => fireEvent.click(within(rowOf(ana.fullName)).getByRole('button', { name: P.setPin })))
    const list = await screen.findByRole('region', { name: P.phones })
    expect(within(list).getByText(/^Teléfono 1, desde /)).toBeTruthy()
    expect(within(list).getByText(/^Teléfono 2, iPhone, desde /)).toBeTruthy()
    // Each «Sacar» names its phone.
    expect(within(list).getByRole('button', { name: P.removePhoneOf(1) })).toBeTruthy()
    await act(async () => fireEvent.click(within(list).getByRole('button', { name: P.removePhoneOf(2) })))
    const confirm = screen.getByRole('dialog', { name: P.removePhoneTitle })
    await act(async () => fireEvent.change(within(confirm).getByRole('textbox'), { target: { value: 'No es su teléfono' } }))
    await act(async () => fireEvent.click(within(confirm).getByRole('button', { name: P.removePhone })))
    expect(pins.releasePhone).toHaveBeenCalledWith(2, 'No es su teléfono')
    await vi.waitFor(() => expect(within(screen.getByRole('region', { name: P.phones })).queryByText(/^Teléfono 2/)).toBeNull())
    expect(within(screen.getByRole('region', { name: P.phones })).getByText(/^Teléfono 1, desde /)).toBeTruthy()
  })
})
