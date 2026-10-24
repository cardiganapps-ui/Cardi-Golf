// @vitest-environment happy-dom
/**
 * Entrar for a screen reader. A11Y-14: a wrong PIN emptied the field and put
 * a plain line under it, so the person heard the digits vanish and nothing
 * else. A11Y-12: «No soy yo» dropped focus to <body>. A11Y-13: the event name
 * was no heading, and the page was titled «Polo». A11Y-23: a face was heard as
 * «Santiago A. A» (the tier glued to the name) and the honoree's ring as nothing.
 */
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/api')>()),
  claimPlayer: vi.fn(),
}))
vi.mock('../../data/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/auth')>()),
  ensureSession: vi.fn(async () => ({ user: { id: 'u' } })),
}))

import { claimPlayer, type LookupResult } from '../../data/api'
import { t } from '../../i18n/es-MX'
import { usePageTitleOverride } from '../../app/pageTitle'
import { EnterScreen } from './EnterScreen'

const lookup: LookupResult = {
  id: 't1',
  slug: 'bachelor',
  name: 'Invitacional',
  tagline: null,
  logoUrl: null,
  accentColor: null,
  status: 'live',
  joinCode: 'ABC123',
  players: [
    {
      id: 'p1',
      displayName: 'Pablo',
      fullName: 'Pablo Rentería',
      tier: 'B',
      avatarUrl: null,
      isHonoree: false,
      hasPin: true,
    },
    {
      id: 'p2',
      displayName: 'Álvaro',
      fullName: 'Álvaro Quintero',
      tier: 'C',
      avatarUrl: null,
      isHonoree: false,
      hasPin: true,
    },
    { id: 'p3', displayName: 'Santiago A.', fullName: null, tier: 'A', avatarUrl: null, isHonoree: true, hasPin: true },
    {
      id: 'p4',
      displayName: 'Jugador 12',
      fullName: null,
      tier: null,
      avatarUrl: null,
      isHonoree: false,
      hasPin: true,
    },
    {
      id: 'p5',
      displayName: 'Iván',
      fullName: null,
      tier: 'D',
      avatarUrl: null,
      isHonoree: false,
      hasPin: true,
      pendingMe: true,
    },
  ],
}

function Title() {
  return <output data-testid="title">{usePageTitleOverride()}</output>
}
function open() {
  render(
    <MemoryRouter>
      <EnterScreen lookup={lookup} onEntered={vi.fn()} />
      <Title />
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('Entrar for a screen reader', () => {
  it('a wrong PIN is an alert the field points to, said as it shows (A11Y-14)', async () => {
    vi.mocked(claimPlayer).mockResolvedValueOnce({ ok: false, reason: 'wrong_pin', attemptsLeft: 3 } as never)
    open()
    fireEvent.click(screen.getByRole('button', { name: /Álvaro/ }))
    const pin = screen.getByLabelText(t.enter.pin)
    expect(pin.getAttribute('aria-invalid')).toBeNull()
    await act(async () => {
      fireEvent.change(pin, { target: { value: '1234' } })
    })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(t.enter.wrongPin)
    expect(pin.getAttribute('aria-invalid')).toBe('true')
    expect(pin.getAttribute('aria-describedby')!.split(' ')).toContain(alert.id)
  })

  it('«No soy yo» goes back to the face that was tapped, not to the top of the page (A11Y-12)', () => {
    open()
    const face = screen.getByRole('button', { name: /Álvaro/ })
    face.focus()
    fireEvent.click(face)
    const notMe = screen.getByRole('button', { name: t.enter.notMe })
    notMe.focus()
    fireEvent.click(notMe)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Álvaro/ }))
  })

  it('each face is said as what it shows, then the honoree, never «Santiago A. A» (A11Y-23)', () => {
    open()
    const faces = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-player'))
    // Named by its content (WCAG 2.5.3, axe 4.14): an aria-label left out the initials a face without a photo shows.
    for (const b of faces) expect(b.hasAttribute('aria-label')).toBe(false)
    for (const name of [
      'Pablo, Categoría B',
      'Álvaro, Categoría C',
      'Santiago A., Categoría A, homenajeado',
      'Jugador 12',
      'Iván, ¿Eres tú?',
    ])
      // The hidden comma is a box of its own, so the name has a space before it, which a voice never says.
      expect(faces).toContain(screen.getByRole('button', { name: (said) => said.replace(/ ,/g, ',') === name }))
    // The name a sighted person reads starts the spoken one, so a voice command by name still works.
    for (const b of faces) {
      const shown = b.querySelector('[class*="faceName"]')!.firstChild!.textContent!
      expect(screen.getByRole('button', { name: new RegExp(`^${shown.replace(/[.?]/g, '\\$&')}`) })).toBe(b)
    }
  })

  it('the event name is the page’s h1, and the page says it is Entrar (A11Y-13)', () => {
    open()
    expect(screen.getByRole('heading', { level: 1, name: lookup.name })).toBeTruthy()
    expect(screen.getByTestId('title').textContent).toBe(t.titles.inTournament(t.titles.enter, lookup.name))
  })
})
