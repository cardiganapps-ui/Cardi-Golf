// @vitest-environment happy-dom
/**
 * SEC-04: strangers' wrong PINs used to lock a player out of every phone, and
 * the Comité saw nothing. The lock now stops only phones that never held him;
 * Comité › Jugadores says which player is locked, and his PIN sheet says why
 * and until when, with «Desbloquear», which keeps the PIN.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { PinLock } from '../../data/pinPhones'
import { t } from '../../i18n/es-MX'
import { clockTime } from '../../lib/freshness'
import { TournamentContext } from '../tournament/TournamentGate'

const fx = getFixture('full12-live')!
const ana = fx.snapshot.players[0]!
const beto = fx.snapshot.players[1]!
const until = '2027-04-09T15:14:00Z'
const server = vi.hoisted(() => ({ locks: [] as PinLock[] }))
const pins = vi.hoisted(() => ({
  pinLocks: vi.fn(async () => server.locks),
  unlockPin: vi.fn(async (id: string) => void (server.locks = server.locks.filter((l) => l.playerId !== id))),
}))
vi.mock('../../data/pinPhones', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/pinPhones')>()),
  playerPhones: vi.fn(async () => []),
  pinLocks: pins.pinLocks,
  unlockPin: pins.unlockPin,
}))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), playersWithPin: vi.fn(async () => new Set<string>()) }))
vi.mock('../../data/profiles', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/profiles')>()), useTournamentProfiles: () => [[], () => undefined] }))
const { AdminPlayers } = await import('./AdminPlayers')

const P = t.admin.players

function mount() {
  useTournament.setState({ tournamentId: 't-locks', data: dataFromSnapshot(structuredClone(fx.snapshot)), reload: async () => undefined })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 't-locks', slug: 'nacho', lookup: fx.lookup, me: { playerId: null, isOrganizer: true, isAdmin: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminPlayers />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
const rowOf = (name: string) => screen.getByText(name).closest('[class*="_row_"]') as HTMLElement

afterEach(() => {
  cleanup()
  pins.pinLocks.mockClear()
  pins.unlockPin.mockClear()
})

describe('a PIN locked by wrong guesses (SEC-04)', () => {
  it('the locked player’s row says so; the others say nothing', async () => {
    server.locks = [{ playerId: ana.id, failed: 15, lockedUntil: until }]
    mount()
    expect(await within(rowOf(ana.fullName)).findByText(new RegExp(P.pinLocked))).toBeTruthy()
    expect(within(rowOf(beto.fullName)).queryByText(new RegExp(P.pinLocked))).toBeNull()
  })

  it('his PIN sheet says why and until when, and «Desbloquear» opens it with the same PIN', async () => {
    server.locks = [{ playerId: ana.id, failed: 15, lockedUntil: until }]
    mount()
    await within(rowOf(ana.fullName)).findByText(new RegExp(P.pinLocked))
    await act(async () => fireEvent.click(within(rowOf(ana.fullName)).getByRole('button', { name: P.setPin })))
    expect(await screen.findByText(P.pinLockedLine(15, clockTime(until)))).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: P.unlockPin })))
    expect(pins.unlockPin).toHaveBeenCalledWith(ana.id)
    expect(screen.queryByText(P.pinLockedLine(15, clockTime(until)))).toBeNull()
    expect(within(rowOf(ana.fullName)).queryByText(new RegExp(P.pinLocked))).toBeNull()
  })
})
