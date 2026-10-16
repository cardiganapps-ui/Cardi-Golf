// @vitest-environment happy-dom
/**
 * TRUST-13: a tournament that plays for money is for adults. Comité › Torneo › Dinero says when the Comité
 * confirmed it, warns while a tournament with money has not, and records or takes back its word (confirm_adults,
 * 0070). Pedidos de corrección (TRUST-16) reach the Comité in Jugadores and are marked done there.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import type { TournamentSettings } from '../../engine/settings/schema'

const api = vi.hoisted(() => ({
  adultsConfirmedAt: vi.fn(async (_tid: string): Promise<string | null | undefined> => null),
  confirmAdults: vi.fn(async (_tid: string, on: boolean) => (on ? '2026-10-16T18:00:00Z' : null)),
  correctionRequests: vi.fn(async (_tid: string) => [{ id: 7, playerId: 'p1', text: 'Mi hándicap es 14', at: '2026-10-16T17:00:00Z', doneAt: null as string | null }]),
  resolveCorrection: vi.fn(async (_id: number) => undefined),
}))
vi.mock('../../data/myData', () => api)
const { AdultsCard } = await import('./AdultsCard')
const { CorrectionsCard } = await import('./CorrectionsCard')

const M = t.money.adults
const fx = getFixture('full12-live')!
beforeEach(() => {
  for (const f of Object.values(api)) f.mockClear()
  useTournament.setState({ tournamentId: 't', data: dataFromSnapshot(structuredClone(fx.snapshot)) })
})
afterEach(cleanup)

describe('«Mayores de edad» (TRUST-13)', () => {
  it('with money and no word yet, it warns; the toggle records the word, and takes it back', async () => {
    render(<AdultsCard tournamentId="t" settings={fx.snapshot.tournament.settings as TournamentSettings} timeZone="America/Mazatlan" />)
    expect(await screen.findByText(M.missing)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(M.check) })))
    expect(api.confirmAdults).toHaveBeenCalledWith('t', true)
    expect(screen.queryByText(M.missing)).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(M.check) })))
    expect(api.confirmAdults).toHaveBeenLastCalledWith('t', false)
  })

  it('a database without 0070 shows nothing', async () => {
    api.adultsConfirmedAt.mockResolvedValueOnce(undefined)
    const { container } = render(<AdultsCard tournamentId="t" settings={fx.snapshot.tournament.settings as TournamentSettings} timeZone="America/Mazatlan" />)
    await act(async () => undefined)
    expect(container.textContent).toBe('')
  })
})

describe('«Pedidos de corrección» (TRUST-16)', () => {
  it('lists what a player asked, with whose it is, and marks it done', async () => {
    render(<CorrectionsCard tournamentId="t" />)
    expect(await screen.findByText('Mi hándicap es 14')).toBeTruthy()
    expect(document.body.textContent).toContain(fx.snapshot.players.find((p) => p.id === 'p1')!.displayName)
    api.correctionRequests.mockResolvedValueOnce([])
    await act(async () => fireEvent.click(screen.getByRole('button', { name: t.myData.done })))
    expect(api.resolveCorrection).toHaveBeenCalledWith(7)
    expect(screen.queryByText('Mi hándicap es 14')).toBeNull()
  })
})
