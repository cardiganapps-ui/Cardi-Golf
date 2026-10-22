// @vitest-environment happy-dom
/**
 * UX-20: twelve PINs cost some seventy inputs and twelve messages written by
 * hand, and the Comité had to remember each PIN to send it again.
 * «Generar PINs» makes one for every player without one, saves each through
 * `set_player_pin` (one call per player; the server keeps the hash), and opens
 * the «Lista de PINs» with each player's invite; closing the list forgets them.
 * A player's PIN sheet holds his invite: the link opens his face and never
 * carries the PIN; the message carries it only while it is on screen.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/tournamentContext'

const fx = getFixture('full12-live')!
const players = fx.snapshot.players
const server = vi.hoisted(() => ({
  withPin: new Set<string>(),
  set: [] as Array<[string, string]>,
  failFor: null as string | null,
}))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  playersWithPin: vi.fn(async () => new Set(server.withPin)),
  setPlayerPin: vi.fn(async (id: string, pin: string) => {
    if (id === server.failFor) throw new Error('network')
    server.set.push([id, pin])
    server.withPin.add(id)
  }),
}))
vi.mock('../../data/pinPhones', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/pinPhones')>()),
  playerPhones: vi.fn(async () => []),
  pinLocks: vi.fn(async () => []),
}))
vi.mock('../../data/profiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/profiles')>()),
  useTournamentProfiles: () => [[], () => undefined],
}))
const toast = vi.hoisted(() => vi.fn())
vi.mock('../../components/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/toast')>()),
  toast,
}))
const share = vi.hoisted(() => vi.fn(async (_text: string) => undefined))
vi.mock('../../lib/pins', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/pins')>()),
  shareToWhatsApp: share,
}))
const { AdminPlayers } = await import('./AdminPlayers')

const P = t.admin.players
const N = P.pins

function mount() {
  useTournament.setState({
    tournamentId: 't-pins',
    data: dataFromSnapshot(structuredClone(fx.snapshot)),
    reload: async () => undefined,
  })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider
        value={{
          tournamentId: 't-pins',
          slug: 'nacho',
          lookup: fx.lookup,
          me: { playerId: null, isOrganizer: true, isComite: true },
          refresh: async () => undefined,
          leave: async () => undefined,
        }}
      >
        <AdminPlayers />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
const rowOf = (name: string) => screen.getByText(name).closest('[class*="_row_"]') as HTMLElement

beforeEach(() => {
  server.withPin = new Set(players.slice(0, 2).map((p) => p.id))
  server.set = []
  server.failFor = null
  share.mockClear()
  toast.mockClear()
})
afterEach(() => cleanup())

describe('«Generar PINs» (UX-20)', () => {
  it('makes one for each player without one, saved one call per player, then lists them', async () => {
    mount()
    expect(await screen.findByText(N.missing(10))).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: N.generate })))
    const confirm = screen.getByRole('dialog', { name: N.generateTitle })
    await act(async () => fireEvent.click(within(confirm).getByRole('button', { name: N.generate })))
    // Ten calls, ten players, ten different PINs of four digits, none of the two that had one.
    expect(server.set).toHaveLength(10)
    expect(new Set(server.set.map(([id]) => id))).toEqual(new Set(players.slice(2).map((p) => p.id)))
    expect(new Set(server.set.map(([, pin]) => pin)).size).toBe(10)
    for (const [, pin] of server.set) expect(pin).toMatch(/^\d{4}$/)
    const list = screen.getByRole('dialog', { name: N.list })
    for (const [id, pin] of server.set) {
      const p = players.find((x) => x.id === id)!
      const row = within(list).getByText(p.fullName).closest('[class*="_row_"]') as HTMLElement
      expect(within(row).getByText(pin)).toBeTruthy()
    }
    expect(screen.getByText(N.allSet)).toBeTruthy()
  })

  it('each line sends that player his invite and his PIN; closing the list forgets them', async () => {
    mount()
    await screen.findByText(N.missing(10))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: N.generate })))
    await act(async () =>
      fireEvent.click(
        within(screen.getByRole('dialog', { name: N.generateTitle })).getByRole('button', { name: N.generate }),
      ),
    )
    const [id, pin] = server.set[0]!
    const p = players.find((x) => x.id === id)!
    await act(async () => fireEvent.click(screen.getByRole('button', { name: N.whatsappTo(p.displayName) })))
    const text = share.mock.calls[0]![0]
    expect(text).toContain(`Tu PIN: ${pin}`)
    expect(text).toContain(`/t/nacho?soy=${p.id}`)
    // The link itself never carries the PIN.
    expect(/https?:\/\/\S+/.exec(text)![0]).not.toContain(pin)
    await act(async () =>
      fireEvent.click(
        within(screen.getByRole('dialog', { name: N.list })).getByRole('button', { name: t.common.close }),
      ),
    )
    await act(async () => new Promise((r) => setTimeout(r, 400)))
    expect(screen.queryByText(pin)).toBeNull()
  })

  it('a PIN that did not save is said, and the rest are listed', async () => {
    server.failFor = players[5]!.id
    mount()
    await screen.findByText(N.missing(10))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: N.generate })))
    await act(async () =>
      fireEvent.click(
        within(screen.getByRole('dialog', { name: N.generateTitle })).getByRole('button', { name: N.generate }),
      ),
    )
    expect(server.set).toHaveLength(9)
    expect(toast).toHaveBeenCalledWith(N.failed(1))
    // Never the error's text: nothing about a PIN goes to a toast.
    expect(toast.mock.calls.flat().join(' ')).not.toContain('network')
    expect(screen.getByText(N.missing(1))).toBeTruthy()
    expect(within(screen.getByRole('dialog', { name: N.list })).queryByText(players[5]!.fullName)).toBeNull()
  })
})

describe('a player’s PIN sheet (UX-20)', () => {
  it('«Generar uno», then the saved PIN and his invite, with the PIN in the message while it is on screen', async () => {
    const p = players[4]!
    mount()
    await screen.findByText(N.missing(10))
    await act(async () => fireEvent.click(within(rowOf(p.fullName)).getByRole('button', { name: P.setPin })))
    const sheet = screen.getByRole('dialog')
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: N.random })))
    const typed = (within(sheet).getByLabelText(P.pinInput) as HTMLInputElement).value
    expect(typed).toMatch(/^\d{4}$/)
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: t.common.save })))
    expect(server.set).toEqual([[p.id, typed]])
    expect(within(sheet).getByText(typed)).toBeTruthy()
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: N.whatsapp })))
    expect(share.mock.calls[0]![0]).toContain(`Tu PIN: ${typed}`)
  })

  it('a player who has a PIN: his invite without it', async () => {
    const p = players[0]!
    mount()
    await screen.findByText(N.missing(10))
    await act(async () => fireEvent.click(within(rowOf(p.fullName)).getByRole('button', { name: P.resetPin })))
    await act(async () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: N.whatsapp })))
    const text = share.mock.calls[0]![0]
    expect(text).toContain(`/t/nacho?soy=${p.id}`)
    expect(text).not.toMatch(/Tu PIN: \d/)
  })
})
