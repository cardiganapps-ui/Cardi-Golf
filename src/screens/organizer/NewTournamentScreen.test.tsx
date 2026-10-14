// @vitest-environment happy-dom
/**
 * UX-06: the wizard asked «¿Cuántos días (rondas)?» and created no rounds,
 * and its success screen led with the join code, so players joined a
 * tournament with nobody in it. The days become rounds, and what comes next
 * leads; the code waits, folded, until there are players.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
import { DEFAULT_SETTINGS } from '../../engine/settings/presets'
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

async function createWithDays(days: string) {
  renderWizard()
  fireEvent.change(screen.getByPlaceholderText(W.namePlaceholder), { target: { value: 'Viaje a Valle' } })
  fireEvent.click(screen.getByRole('button', { name: t.common.next }))
  fireEvent.click(within(screen.getByRole('group', { name: W.rounds })).getByRole('radio', { name: days }))
  fireEvent.click(screen.getByRole('button', { name: t.common.next }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: W.create }))
  })
}

beforeEach(() => {
  sessionStorage.clear()
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
    renderWizard()
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
    renderWizard()
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

/** Name, then Siguiente: step 2. */
function toStep2(name = 'Viaje a Valle') {
  fireEvent.change(screen.getByPlaceholderText(W.namePlaceholder), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: t.common.next }))
}
/** A review line's value, read from its label. */
function reviewValue(label: string): HTMLElement {
  const key = screen.getByText(label, { selector: 'dt' })
  const value = key.nextElementSibling as HTMLElement
  expect(value.tagName).toBe('DD')
  return value
}
const gamesList = () => screen.getByText(W.reviewGamesTitle).nextElementSibling as HTMLElement

describe('Nuevo torneo: the review reads as lines, a label beside its value (UX-03)', () => {
  // Vitest names any class it is asked for, defined or not, so whether the classes exist is
  // src/styles/module-classes.test.ts's to check, and the layout is e2e/fixtures/wizard.spec.ts's.
  it('each line is a term and its definition, never two spans run together', () => {
    renderWizard()
    toStep2()
    fireEvent.click(screen.getByRole('button', { name: t.common.next }))
    const value = reviewValue(W.reviewFormat)
    expect(value.textContent).toBe('Stableford, puntos')
    expect((value.previousElementSibling as HTMLElement).textContent).toBe(W.reviewFormat)
    expect(value.closest('dl')).toBeTruthy()
    expect(reviewValue(W.name).textContent).toBe('Viaje a Valle')
  })
})

describe('Nuevo torneo: the review names every game with its prize (UX-04)', () => {
  it('«Viaje con Calcutta» reviews its Calcutta and its pairs, each with what it pays', () => {
    renderWizard()
    toStep2()
    fireEvent.click(screen.getByRole('button', { name: W.templateLink }))
    fireEvent.click(screen.getByRole('radio', { name: /^Viaje con Calcutta/ }))
    fireEvent.click(screen.getByRole('button', { name: t.common.next }))
    const calcutta = reviewValue('La Calcutta')
    expect(calcutta.textContent).toContain(W.reviewOwnPot)
    expect(calcutta.textContent).toContain('Campeón 55%')
    expect(reviewValue('Los Matrimonios').textContent).toBe('$3,000$2,000 + $1,000')
    expect(reviewValue('La Víbora').textContent).toMatch(/^\$3,600/)
    expect(reviewValue('Mejor ronda').textContent).toMatch(/^\$2,400/)
    expect(reviewValue('Menos putts').textContent).toMatch(/^\$1,000/)
    expect(reviewValue('Individual').textContent).toMatch(/^\$20,000/)
    expect(reviewValue(W.reviewPrizes).textContent).toBe(`$30,000${W.reviewBalanced('$30,000')}`)
    // Nothing says there are no games.
    expect(screen.queryByText(/Ninguno por ahora/)).toBeNull()
    expect((screen.getByRole('button', { name: W.create }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('a Stableford-only draft with no money reviews just that game', () => {
    renderWizard()
    toStep2()
    fireEvent.click(screen.getByRole('button', { name: t.common.next }))
    const rows = within(gamesList()).getAllByRole('term')
    expect(rows.map((r) => r.textContent)).toEqual(['Individual'])
    expect(reviewValue('Individual').textContent).toBe(W.reviewNoPrize)
  })

  it('the labels are the tournament\'s own', () => {
    sessionStorage.setItem('cardi-golf:wizard-draft', JSON.stringify(draftWith((s) => {
      s.modules.individual.label = 'La Copa'
    })))
    renderWizard('/organizer/new?paso=3')
    expect(reviewValue('La Copa').textContent).toBe(W.reviewNoPrize)
  })
})

/** A stored draft as the wizard writes it, on the blank settings, edited by `fn`. */
function draftWith(fn: (s: ReturnType<typeof blankSettings>) => void = () => undefined) {
  const settings = blankSettings()
  fn(settings)
  return { v: 1, name: 'Copa guardada', tagline: '', players: 8, settings, pristine: false }
}
function blankSettings() {
  return structuredClone(DEFAULT_SETTINGS)
}

describe('Nuevo torneo: the system back goes back a step, and nothing typed is lost (UX-05)', () => {
  it('each step is an address of its own: back returns to the step before with what was typed, forward comes back', async () => {
    const router = renderWizard()
    toStep2()
    expect(router.state.location.search).toBe('?paso=2')
    fireEvent.click(screen.getByRole('button', { name: t.common.next }))
    expect(router.state.location.search).toBe('?paso=3')
    await act(() => router.navigate(-1))
    expect(screen.getByText(new RegExp(W.stepOf(2, 3)))).toBeTruthy()
    await act(() => router.navigate(-1))
    expect((screen.getByPlaceholderText(W.namePlaceholder) as HTMLInputElement).value).toBe('Viaje a Valle')
    await act(() => router.navigate(1))
    expect(screen.getByText(new RegExp(W.stepOf(2, 3)))).toBeTruthy()
    await act(() => router.navigate(1))
    expect(reviewValue(W.name).textContent).toBe('Viaje a Valle')
  })

  it('«Atrás» is the same back: it adds no entry, so the next back leaves nothing half-done behind', async () => {
    const router = renderWizard()
    toStep2()
    fireEvent.click(screen.getByRole('button', { name: t.common.next }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: t.common.back })))
    expect(router.state.historyAction).toBe('POP')
    expect(router.state.location.search).toBe('?paso=2')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: t.common.back })))
    expect(router.state.location.search).toBe('')
    expect((screen.getByPlaceholderText(W.namePlaceholder) as HTMLInputElement).value).toBe('Viaje a Valle')
  })

  it('a reload keeps the step and the draft', () => {
    renderWizard()
    toStep2('Copa de Otoño')
    fireEvent.change(screen.getByLabelText(W.players), { target: { value: '14' } })
    cleanup()
    renderWizard('/organizer/new?paso=3')
    expect(reviewValue(W.name).textContent).toBe('Copa de Otoño')
    expect(reviewValue(W.rounds).textContent).toContain(W.reviewField(14))
  })

  it('a step the draft can\'t be on yet opens on the first it can, and the address says so', () => {
    const router = renderWizard('/organizer/new?paso=3')
    expect(screen.getByPlaceholderText(W.namePlaceholder)).toBeTruthy()
    expect(router.state.location.search).toBe('')
  })

  it('a stored draft that no longer reads is dropped: the wizard starts blank', () => {
    sessionStorage.setItem('cardi-golf:wizard-draft', JSON.stringify({ ...draftWith(), settings: { modules: 'roto' } }))
    renderWizard('/organizer/new?paso=2')
    expect((screen.getByPlaceholderText(W.namePlaceholder) as HTMLInputElement).value).toBe('')
    expect(sessionStorage.getItem('cardi-golf:wizard-draft')).toBeNull()
    cleanup()
    sessionStorage.setItem('cardi-golf:wizard-draft', '{no es json')
    renderWizard()
    expect((screen.getByPlaceholderText(W.namePlaceholder) as HTMLInputElement).value).toBe('')
  })

  it('creating the tournament clears the draft', async () => {
    await createWithDays('1')
    expect(screen.getByRole('heading', { name: W.created })).toBeTruthy()
    expect(sessionStorage.getItem('cardi-golf:wizard-draft')).toBeNull()
  })

  it('leaving with a draft asks first: «Seguir aquí» keeps it, «Salir y borrar» goes and clears it', async () => {
    const router = renderWizard()
    toStep2()
    await act(() => router.navigate('/organizer'))
    expect(screen.getByRole('heading', { name: W.leaveTitle })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: W.leaveStay })))
    expect(router.state.location.pathname).toBe('/organizer/new')
    expect(screen.getByText(new RegExp(W.stepOf(2, 3)))).toBeTruthy()
    expect(sessionStorage.getItem('cardi-golf:wizard-draft')).toContain('Viaje a Valle')
    await act(() => router.navigate('/organizer'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: W.leaveConfirm })))
    expect(await screen.findByText('Mis torneos', undefined, { timeout: 3000 })).toBeTruthy()
    expect(sessionStorage.getItem('cardi-golf:wizard-draft')).toBeNull()
  })

  it('the system back on the first step asks too, and «Salir y borrar» goes back where it came from', async () => {
    const router = renderWizard()
    fireEvent.change(screen.getByPlaceholderText(W.namePlaceholder), { target: { value: 'Viaje a Valle' } })
    await act(() => router.navigate(-1))
    expect(screen.getByRole('heading', { name: W.leaveTitle })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: W.leaveConfirm })))
    expect(await screen.findByText('La página de antes', undefined, { timeout: 3000 })).toBeTruthy()
  })

  it('with nothing typed, leaving asks nothing', async () => {
    const router = renderWizard()
    await act(() => router.navigate('/organizer'))
    expect(screen.getByText('Mis torneos')).toBeTruthy()
  })

  it('the demo route behaves the same, on a draft of its own', async () => {
    const router = renderWizard('/organizer/new', true)
    toStep2('Copa de prueba')
    expect(router.state.location.search).toBe('?paso=2')
    expect(sessionStorage.getItem('cardi-golf:wizard-draft:demo')).toContain('Copa de prueba')
    expect(sessionStorage.getItem('cardi-golf:wizard-draft')).toBeNull()
    await act(() => router.navigate('/organizer'))
    expect(screen.getByRole('heading', { name: W.leaveTitle })).toBeTruthy()
  })
})
