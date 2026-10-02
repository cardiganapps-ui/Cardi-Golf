// @vitest-environment happy-dom
/**
 * TRUST-05: every place that collects data shows the terms and the notice,
 * rendered for real: in the page, not hidden, readable, and before the
 * action. The old test only read the source for the tag, so a line behind
 * `{false && …}` or inside `<div hidden>` still passed. The browser suite
 * (e2e/fixtures/consent.spec.ts) adds where it lands on a small phone.
 *
 * Each line is held word for word here, as the reader gets it (with what a
 * screen reader adds after each link), and not rebuilt from the strings it
 * checks: PR #88's second verifier changed those strings and every test still
 * passed.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// No network: no Google, no courses, no PINs or profiles to list, and this browser can take push.
vi.mock('../data/account', async (importOriginal) => ({ ...(await importOriginal<typeof import('../data/account')>()), googleAvailable: vi.fn(async () => false) }))
vi.mock('../data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/api')>()),
  listCourses: vi.fn(async () => []),
  playersWithPin: vi.fn(async () => new Set<string>()),
}))
vi.mock('../data/profiles', async (importOriginal) => ({ ...(await importOriginal<typeof import('../data/profiles')>()), useTournamentProfiles: () => [[], () => undefined] }))
vi.mock('../data/push', async (importOriginal) => ({ ...(await importOriginal<typeof import('../data/push')>()), pushState: vi.fn(async () => 'off') }))
/** Holes this phone queued before its session lapsed (REL-16): the grid shows them above the faces. */
const queued = vi.hoisted(() => ({ held: 0 }))
vi.mock('../data/outbox', async (importOriginal) => {
  const real = await importOriginal<typeof import('../data/outbox')>()
  return { ...real, queuedFor: (id: string) => (queued.held ? { holes: queued.held, heldHoles: queued.held } : real.queuedFor(id)) }
})

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
import { expectShown, loadTokens } from './testing/shown'
import { EnterScreen } from './tournament/EnterScreen'
import { TournamentContext } from './tournament/TournamentGate'

beforeAll(loadTokens)
afterEach(() => {
  cleanup()
  queued.held = 0
})

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

/** Each line as a screen reader hears it: «(se abre en otra pestaña)» after each link. */
const ENTER_LINE = 'Al entrar aceptas los Términos (se abre en otra pestaña) y el Aviso de privacidad (se abre en otra pestaña).'
const CONTINUE_LINE = 'Al continuar aceptas los Términos de uso (se abre en otra pestaña) y el Aviso de privacidad (se abre en otra pestaña).'
const OTHERS_NOTE = 'Lo que captures de cada jugador, salvo su PIN, lo ven todos en el torneo; quién más lo ve está en el Aviso de privacidad (se abre en otra pestaña).'
const PUSH_NOTE = 'Al activarlos, Polo guarda la dirección de avisos de este navegador, como dice el Aviso de privacidad (se abre en otra pestaña).'
const SCORECARD_NOTE =
  'Foto o PDF de la tarjeta del campo: se la mandamos a Anthropic para que Claude la lea, y tú revisas todo antes de guardar. Más en el Aviso de privacidad (se abre en otra pestaña).'
const BOTH = ['/terminos', '/privacidad']
const NOTICE = ['/privacidad']

const NAMES = ['Andrés', 'Diego', 'Emiliano', 'Justo', 'Martín', 'Mateo', 'Mauricio', 'Nicolás', 'René', 'Rodrigo', 'Ignacio', 'Pablo']
const field = (names: string[]): LookupResult => ({
  id: 't1',
  slug: 'bachelor',
  name: 'Invitacional',
  tagline: null,
  logoUrl: null,
  accentColor: null,
  status: 'live',
  joinCode: 'ABC123',
  players: names.map((n, i) => ({ id: `p${i + 1}`, displayName: n, fullName: `${n} Pérez`, tier: 'ABCD'[i % 4]!, avatarUrl: null, isHonoree: i === 3, hasPin: true })),
})
const lookup = field(NAMES)
/** Past 16 the grid goes dense and gets a name filter (EnterScreen's DENSE_FROM). */
const BIG = Array.from({ length: 24 }, (_, i) => `Jugador ${i + 1}`)

function enter(l: LookupResult = lookup) {
  render(
    <MemoryRouter>
      <EnterScreen lookup={l} onEntered={() => undefined} />
    </MemoryRouter>,
  )
}
const faces = (names: string[]) => screen.getAllByRole('button').filter((b) => names.some((n) => b.textContent?.includes(n)))

describe('the face grid and the PIN step (TRUST-05, P1)', () => {
  it('the grid says it above the faces, where a full field still shows it', () => {
    enter()
    const shown = faces(NAMES)
    expect(shown).toHaveLength(12)
    expect(before(consentLine(ENTER_LINE, BOTH), shown[0]!)).toBe(true)
  })

  it('a field past 16 (the dense grid with its name filter): the line still comes first', () => {
    enter(field(BIG))
    const shown = faces(BIG)
    expect(shown).toHaveLength(24)
    const filter = screen.getByRole('searchbox', { name: t.enter.search })
    const line = consentLine(ENTER_LINE, BOTH)
    expect(before(line, filter)).toBe(true)
    expect(before(line, shown[0]!)).toBe(true)
  })

  it('a phone holding holes from before its session lapsed (REL-16): the line and those holes, before the faces', () => {
    queued.held = 3
    enter()
    expect(screen.getByRole('status').textContent).toBe(t.sync.heldForPin(3))
    expect(before(consentLine(ENTER_LINE, BOTH), faces(NAMES)[0]!)).toBe(true)
  })

  it('the PIN step says it above the field, and the field, which takes focus, is described by it', () => {
    enter()
    fireEvent.click(faces(['Andrés'])[0]!)
    const pin = screen.getByLabelText(t.enter.pin)
    const line = consentLine(ENTER_LINE, BOTH)
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
      const line = consentLine(CONTINUE_LINE, BOTH)
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
      expect(before(consentLine(CONTINUE_LINE, BOTH), submit)).toBe(true)
    })
  }
})

describe('Ronda rápida: friends and guests added by the organizer', () => {
  it('the line from the start, while the round is still being set up, and before it starts', async () => {
    render(
      <MemoryRouter>
        <QuickFixture />
      </MemoryRouter>,
    )
    // The tees are still loading, so the round cannot start: the organizer is adding friends and guests.
    const start = screen.getByRole('button', { name: t.quick.start }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    expect(before(consentLine(CONTINUE_LINE, BOTH), start)).toBe(true)
    await waitFor(() => expect(start.disabled).toBe(false))
    expect(before(consentLine(CONTINUE_LINE, BOTH), start)).toBe(true)
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
    const line = consentLine(OTHERS_NOTE, NOTICE)
    const name = screen.getByLabelText(t.admin.players.fullName)
    expect(before(line, name)).toBe(true)
    // P3: focus lands below the notice, so a screen reader would start past it.
    expect(document.activeElement).toBe(name)
    expect(name.getAttribute('aria-describedby')?.split(' ')).toContain(line.id)
  })

  it('an existing player: the same, and the name field is described by it too', () => {
    mount()
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Arturo'))!)
    const line = consentLine(OTHERS_NOTE, NOTICE)
    const name = screen.getByLabelText(t.admin.players.fullName)
    expect(before(line, name)).toBe(true)
    expect(name.getAttribute('aria-describedby')?.split(' ')).toContain(line.id)
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
      // What the switch promises, word for word: only the app's own notices are free of amounts (platform_broadcast is free text).
      expectShown(screen.getByText('Te llega como notificación cada aviso nuevo: solicitudes de amistad, rivalidades, resultados y más. Los de la app nunca llevan montos.'))
      const line = consentLine(PUSH_NOTE, NOTICE)
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
    const line = consentLine(SCORECARD_NOTE, NOTICE)
    expect(before(line, upload)).toBe(true)
    expect(upload.getAttribute('aria-describedby')).toBe(line.id)
  })
})
