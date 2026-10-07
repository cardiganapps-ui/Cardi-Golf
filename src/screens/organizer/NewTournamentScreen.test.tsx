// @vitest-environment happy-dom
/**
 * UX-06: the wizard asked «¿Cuántos días (rondas)?» and created no rounds,
 * and its success screen led with the join code, so players joined a
 * tournament with nobody in it. The days become rounds, and what comes next
 * leads; the code waits, folded, until there are players.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ createTournament: vi.fn(), upsertRound: vi.fn() }))
vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  createTournament: api.createTournament,
  upsertRound: api.upsertRound,
}))
vi.mock('../../data/auth', () => ({ useAuth: () => ({ ready: true, user: { id: 'u1' }, isAnonymous: false }) }))

import { t } from '../../i18n/es-MX'
import { NewTournamentScreen } from './NewTournamentScreen'

const W = t.organizer.wizard

async function createWithDays(days: string) {
  render(
    <MemoryRouter>
      <NewTournamentScreen />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByPlaceholderText(W.namePlaceholder), { target: { value: 'Viaje a Valle' } })
  fireEvent.click(screen.getByRole('button', { name: t.common.next }))
  fireEvent.click(within(screen.getByRole('group', { name: W.rounds })).getByRole('radio', { name: days }))
  fireEvent.click(screen.getByRole('button', { name: t.common.next }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: W.create }))
  })
}

beforeEach(() => {
  api.createTournament.mockReset().mockResolvedValue({ id: 't-new', slug: 'viaje-a-valle', joinCode: 'VALLE1' })
  api.upsertRound.mockReset().mockResolvedValue({ id: 'r' })
})
afterEach(() => cleanup())

describe('Nuevo torneo (UX-06)', () => {
  it('the days asked for become the tournament\'s rounds, numbered, with no course or date yet', async () => {
    await createWithDays('2')
    expect(api.upsertRound.mock.calls).toEqual([
      ['t-new', { number: 1, date: null, course_id: null, holes: 18 }],
      ['t-new', { number: 2, date: null, course_id: null, holes: 18 }],
    ])
  })

  it('what comes next leads; the code to share waits until there are players', async () => {
    await createWithDays('1')
    const goAdmin = screen.getByRole('link', { name: W.goAdmin })
    expect(goAdmin.getAttribute('href')).toBe('/t/viaje-a-valle/admin')
    const later = screen.getByText(W.shareLater).closest('details')!
    expect(later.open).toBe(false)
    expect(within(later).getByText('VALLE1')).toBeTruthy()
    // The next steps come before the code in the page.
    expect(goAdmin.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('once created, the steps are gone: no «Paso 3 de 3» under «Torneo creado»', async () => {
    await createWithDays('1')
    expect(screen.getByRole('heading', { name: W.created })).toBeTruthy()
    expect(screen.queryByText(new RegExp(W.stepOf(3, 3)))).toBeNull()
    // The disclosure says it opens: a chevron beside its label.
    expect(screen.getByText(W.shareLater).closest('summary')!.querySelector('svg')).toBeTruthy()
  })

  it('the code\'s hint says whom to wait for: the players (N10)', async () => {
    await createWithDays('1')
    const later = screen.getByText(W.shareLater).closest('details')!
    expect(within(later).getByText(/^Compártelo cuando los jugadores ya estén dados de alta: /)).toBeTruthy()
  })

  it('the format step says where teams and fourball pairs are drawn: Equipos, in the Comité console', () => {
    render(
      <MemoryRouter>
        <NewTournamentScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByPlaceholderText(W.namePlaceholder), { target: { value: 'Viaje a Valle' } })
    fireEvent.click(screen.getByRole('button', { name: t.common.next }))
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${W.formats.team.name}`) }))
    expect(screen.getByText('Los equipos se arman en Equipos, en la consola del Comité.')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${W.formats.matchPlay.name}`) }))
    expect(screen.getByText(/Las parejas se arman en Equipos, en la consola del Comité\.$/)).toBeTruthy()
  })

  it('if the rounds can\'t be created the tournament still is, and the Comité lists what is missing', async () => {
    api.upsertRound.mockRejectedValue(new Error('sin señal'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await createWithDays('2')
    expect(screen.getByRole('link', { name: W.goAdmin })).toBeTruthy()
  })
})

describe('Nuevo torneo: a prize nobody can win (MONEY-09)', () => {
  /** Money on (50/30/20 of $500 each), for this many players, up to the review step. */
  function review(players: string) {
    render(
      <MemoryRouter>
        <NewTournamentScreen />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByPlaceholderText(W.namePlaceholder), { target: { value: 'Mano a mano' } })
    fireEvent.click(screen.getByRole('button', { name: t.common.next }))
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(W.money) }))
    fireEvent.change(screen.getByLabelText(W.players), { target: { value: players } })
    fireEvent.click(screen.getByRole('button', { name: t.common.next }))
    return screen.getByRole('button', { name: W.create }) as HTMLButtonElement
  }

  it('three places for two players: the pool balances, but the 3rd has nobody, so it cannot be created', () => {
    const create = review('2')
    expect(create.disabled).toBe(true)
    expect(screen.getByText(W.fixToCreate)).toBeTruthy()
  })

  it('the same split for three players can', () => {
    const create = review('3')
    expect(create.disabled).toBe(false)
    expect(screen.queryByText(W.fixToCreate)).toBeNull()
  })
})
