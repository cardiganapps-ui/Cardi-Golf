// @vitest-environment happy-dom
/**
 * A11Y-12: each step of Nuevo torneo replaces the last in place, «Siguiente»
 * with it, and focus fell to <body>: «Paso 2 de 3, Formato» was never focused
 * or said. Each step now takes focus at the line that says which step it is,
 * and «Torneo creado» at its heading.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
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

/**
 * The wizard in a data router (it blocks a navigation away, which needs one),
 * opened from another page so a back has somewhere to go.
 */
function renderWizard(path = '/organizer/new', demo = false) {
  const router = createMemoryRouter(
    [
      { path: '/organizer/new', element: <NewTournamentScreen /> },
      { path: '/organizer/nuevo/_', element: <NewTournamentScreen demo /> },
      { path: '/organizer', element: <p>Mis torneos</p> },
      { path: '/antes', element: <p>La página de antes</p> },
    ],
    { initialEntries: ['/antes', demo ? path.replace('/organizer/new', '/organizer/nuevo/_') : path], initialIndex: 1 },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  sessionStorage.clear()
  api.createTournament.mockReset().mockResolvedValue({ id: 't-new', slug: 'viaje-a-valle', joinCode: 'VALLE1' })
  api.upsertRound.mockReset().mockResolvedValue({ id: 'r' })
})
afterEach(() => cleanup())

function press(el: HTMLElement) {
  el.focus()
  fireEvent.click(el)
}
const stepLine = (n: number, name: string) => `${W.stepOf(n, 3)}, ${name}`

describe('Nuevo torneo keeps the person’s place from step to step (A11Y-12)', () => {
  it('«Siguiente» and «Atrás» focus the line naming the step; «Crear» focuses «Torneo creado»', async () => {
    renderWizard()
    fireEvent.change(screen.getByPlaceholderText(W.namePlaceholder), { target: { value: 'Viaje a Valle' } })
    press(screen.getByRole('button', { name: t.common.next }))
    expect(document.activeElement?.textContent).toBe(stepLine(2, W.step2))
    press(screen.getByRole('button', { name: t.common.next }))
    expect(document.activeElement?.textContent).toBe(stepLine(3, W.review))
    press(screen.getByRole('button', { name: t.common.back }))
    await act(async () => undefined)
    expect(document.activeElement?.textContent).toBe(stepLine(2, W.step2))
    press(screen.getByRole('button', { name: t.common.next }))
    await act(async () => {
      press(screen.getByRole('button', { name: W.create }))
    })
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: W.created }))
  })
})
