// @vitest-environment happy-dom
/**
 * TRUST-05: every place that collects data shows the terms and the notice,
 * rendered for real: in the page, not hidden, and before the action. The
 * old test only read the source for the tag, so a line behind `{false && …}`
 * or inside `<div hidden>` still passed. The browser suite
 * (e2e/fixtures/consent.spec.ts) adds where it lands on a small phone.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

// No network: no Google, no courses, no PINs or profiles to list, and this browser can take push.
vi.mock('../data/account', async (importOriginal) => ({ ...(await importOriginal<typeof import('../data/account')>()), googleAvailable: vi.fn(async () => false) }))
vi.mock('../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/api')>()),
  listCourses: vi.fn(async () => []),
  playersWithPin: vi.fn(async () => new Set<string>()),
}))
vi.mock('../data/profiles', async (importOriginal) => ({ ...(await importOriginal<typeof import('../data/profiles')>()), useTournamentProfiles: () => [[], () => undefined] }))
vi.mock('../data/push', async (importOriginal) => ({ ...(await importOriginal<typeof import('../data/push')>()), pushState: vi.fn(async () => 'off') }))

import { googleAvailable } from '../data/account'
import type { LookupResult } from '../data/api'
import { dataFromSnapshot, useTournament } from '../data/tournamentStore'
import { getFixture } from '../dev/fixtures'
import { QuickFixture } from '../dev/socialFixtures'
import { t } from '../i18n/es-MX'
import { AdminCourses } from './admin/AdminCourses'
import { AdminPlayers } from './admin/AdminPlayers'
import { OrganizerLoginScreen } from './organizer/OrganizerLoginScreen'
import { EntrarScreen } from './profile/EntrarScreen'
import { PushToggle } from './profile/PushToggle'
import { EnterScreen } from './tournament/EnterScreen'
import { TournamentContext } from './tournament/TournamentGate'

const C = t.legal.consent

afterEach(cleanup)

/** In the page and not hidden by itself or by anything around it. */
function expectShown(el: HTMLElement) {
  expect(el.isConnected).toBe(true)
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const what = `<${n.tagName.toLowerCase()}${n.className ? ` class="${n.className}"` : ''}>`
    expect(n.hidden, `${what} is hidden`).toBe(false)
    expect(n.getAttribute('aria-hidden'), `${what} is aria-hidden`).not.toBe('true')
    const style = getComputedStyle(n)
    expect(style.display, `${what} has display: none`).not.toBe('none')
    expect(style.visibility, `${what} has visibility: hidden`).not.toBe('hidden')
  }
}

/** `a` comes before `b` in reading and keyboard order. */
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

/** The one consent line on the screen: shown, saying `text`, its links to these pages. */
function consentLine(text: string, pages: string[]): HTMLElement {
  const lines = document.querySelectorAll<HTMLElement>('[data-legal-consent]')
  expect(lines).toHaveLength(1)
  const line = lines[0]!
  expectShown(line)
  expect(line.textContent).toBe(text)
  expect([...line.querySelectorAll('a')].map((a) => a.getAttribute('href')?.split('?')[0])).toEqual(pages)
  return line
}

/** «Al continuar…» and «Al entrar…» with both links, and a note ending on the notice, as a screen reader hears them. */
const continueLine = `${C.start}${C.terms} ${t.legal.newTab}${C.middle}${C.privacy} ${t.legal.newTab}${C.end}`
const enterLine = `${C.enterStart}${C.termsShort} ${t.legal.newTab}${C.middle}${C.privacy} ${t.legal.newTab}${C.end}`
const noteText = (n: { start: string; privacy: string; end: string }) => `${n.start}${n.privacy} ${t.legal.newTab}${n.end}`
const BOTH = ['/terminos', '/privacidad']
const NOTICE = ['/privacidad']

const NAMES = ['Andrés', 'Diego', 'Emiliano', 'Justo', 'Martín', 'Mateo', 'Mauricio', 'Nicolás', 'René', 'Rodrigo', 'Ignacio', 'Pablo']
const lookup: LookupResult = {
  id: 't1',
  slug: 'bachelor',
  name: 'Invitacional',
  tagline: null,
  logoUrl: null,
  accentColor: null,
  status: 'live',
  joinCode: 'ABC123',
  players: NAMES.map((n, i) => ({ id: `p${i + 1}`, displayName: n, fullName: `${n} Pérez`, tier: 'ABCD'[i % 4]!, avatarUrl: null, isHonoree: i === 3, hasPin: true })),
}

describe('the face grid and the PIN step (TRUST-05, P1)', () => {
  it('the grid says it above the faces, where a full field still shows it', () => {
    render(
      <MemoryRouter>
        <EnterScreen lookup={lookup} onEntered={() => undefined} />
      </MemoryRouter>,
    )
    const faces = screen.getAllByRole('button').filter((b) => NAMES.some((n) => b.textContent?.includes(n)))
    expect(faces).toHaveLength(12)
    const line = consentLine(enterLine, BOTH)
    expect(before(line, faces[0]!)).toBe(true)
  })

  it('the PIN step says it above the field, and the field, which takes focus, is described by it', () => {
    render(
      <MemoryRouter>
        <EnterScreen lookup={lookup} onEntered={() => undefined} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Andrés'))!)
    const pin = screen.getByLabelText(t.enter.pin)
    const line = consentLine(enterLine, BOTH)
    expect(before(line, pin)).toBe(true)
    expect(pin.getAttribute('aria-describedby')?.split(' ')).toContain(line.id)
    expect(document.activeElement).toBe(pin)
  })
})

describe('/entrar: an account by email code or Google', () => {
  for (const google of [false, true]) {
    it(google ? 'with Google' : 'email only', async () => {
      vi.mocked(googleAvailable).mockResolvedValue(google)
      render(
        <MemoryRouter initialEntries={['/entrar']}>
          <EntrarScreen />
        </MemoryRouter>,
      )
      const googleButton = google ? await screen.findByRole('button', { name: new RegExp(t.account.google) }) : null
      const line = consentLine(continueLine, BOTH)
      // Before every way in: Google, the email and its button (P3: it came two controls after Google).
      if (googleButton) expect(before(line, googleButton)).toBe(true)
      expect(before(line, screen.getByLabelText(t.account.email))).toBe(true)
      expect(before(line, screen.getByRole('button', { name: t.account.sendCode }))).toBe(true)
    })
  }
})

describe('organizer sign-in and sign-up', () => {
  for (const mode of ['in', 'up'] as const) {
    it(mode === 'in' ? 'sign in' : 'sign up', () => {
      render(
        <MemoryRouter>
          <OrganizerLoginScreen />
        </MemoryRouter>,
      )
      if (mode === 'up') fireEvent.click(screen.getByRole('button', { name: t.auth.toggleToSignUp }))
      const submit = screen.getByRole('button', { name: mode === 'in' ? t.auth.signIn : t.auth.signUp })
      expect(before(consentLine(continueLine, BOTH), submit)).toBe(true)
    })
  }
})

describe('Ronda rápida: friends and guests added by the organizer', () => {
  it('the line, before the round starts', async () => {
    render(
      <MemoryRouter>
        <QuickFixture />
      </MemoryRouter>,
    )
    const start = await screen.findByRole('button', { name: t.quick.start })
    expect(before(consentLine(continueLine, BOTH), start)).toBe(true)
  })
})

describe('Comité › Jugadores: other people\'s data (TRUST-05, TRUST-16)', () => {
  function mount() {
    const fx = getFixture('full12-live')!
    useTournament.setState({ tournamentId: 'fixture:full12-live', data: dataFromSnapshot(structuredClone(fx.snapshot)), loading: false, error: null })
    render(
      <MemoryRouter>
        <TournamentContext.Provider value={{ tournamentId: 'fixture:full12-live', slug: '_/full12-live', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
          <AdminPlayers />
        </TournamentContext.Provider>
      </MemoryRouter>,
    )
  }

  it('a new player: the sheet opens on who sees what you type, and the name field, which takes focus below it, is described by it', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: t.admin.players.add }))
    const line = consentLine(noteText(t.legal.othersData), NOTICE)
    const name = screen.getByLabelText(t.admin.players.fullName)
    expect(before(line, name)).toBe(true)
    // P3: focus lands below the notice, so a screen reader would start past it.
    expect(document.activeElement).toBe(name)
    expect(name.getAttribute('aria-describedby')?.split(' ')).toContain(line.id)
  })

  it('an existing player: the same', () => {
    mount()
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Arturo'))!)
    const line = consentLine(noteText(t.legal.othersData), NOTICE)
    expect(before(line, screen.getByLabelText(t.admin.players.fullName))).toBe(true)
  })
})

describe('the push switch', () => {
  for (const compact of [false, true]) {
    it(`${compact ? 'Avisos (compact)' : 'Editar perfil'}: what turning them on stores, before «${t.push.enable}»`, async () => {
      render(
        <MemoryRouter>
          <PushToggle compact={compact} />
        </MemoryRouter>,
      )
      const enable = await screen.findByRole('button', { name: t.push.enable })
      const line = consentLine(noteText(t.legal.pushNote), NOTICE)
      expect(before(line, enable)).toBe(true)
      // P3: like the PIN field and «Subir tarjeta», a screen reader hears the note with the button.
      expect(line.id).not.toBe('')
      expect(enable.getAttribute('aria-describedby')?.split(' ')).toContain(line.id)
    })
  }
})

describe('the scorecard photo, read by Anthropic', () => {
  it('Comité › Campos and /campos (the same screen): who reads the photo, before «Subir tarjeta», which it describes', async () => {
    render(
      <MemoryRouter>
        <AdminCourses />
      </MemoryRouter>,
    )
    const upload = await screen.findByRole('button', { name: t.admin.courses.photo })
    const line = consentLine(noteText(t.legal.scorecardNote), NOTICE)
    expect(line.textContent).toContain('Anthropic')
    expect(before(line, upload)).toBe(true)
    expect(upload.getAttribute('aria-describedby')).toBe(line.id)
  })
})
