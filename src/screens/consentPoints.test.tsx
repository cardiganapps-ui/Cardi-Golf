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

// No network: the course list is empty and this browser can take push.
vi.mock('../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../data/api')>()), listCourses: vi.fn(async () => []) }))
vi.mock('../data/push', async (importOriginal) => ({ ...(await importOriginal<typeof import('../data/push')>()), pushState: vi.fn(async () => 'off') }))

import type { LookupResult } from '../data/api'
import { t } from '../i18n/es-MX'
import { EnterScreen } from './tournament/EnterScreen'
import { PushToggle } from './profile/PushToggle'
import { AdminCourses } from './admin/AdminCourses'

const C = t.legal.consent

afterEach(cleanup)

/** A note that ends on the notice, as the screen reads it (the link says it opens in another tab). */
const noteText = (n: { start: string; privacy: string; end: string }) => `${n.start}${n.privacy} ${t.legal.newTab}${n.end}`

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

/** The one consent line on the screen, shown, with both links. */
function consentLine(text: string): HTMLElement {
  const lines = document.querySelectorAll<HTMLElement>('[data-legal-consent]')
  expect(lines).toHaveLength(1)
  const line = lines[0]!
  expectShown(line)
  expect(line.textContent).toBe(text)
  return line
}

const enterLine = `${C.enterStart}${C.termsShort} ${t.legal.newTab}${C.middle}${C.privacy} ${t.legal.newTab}${C.end}`

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
    const line = consentLine(enterLine)
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
    const line = consentLine(enterLine)
    expect(before(line, pin)).toBe(true)
    expect(pin.getAttribute('aria-describedby')?.split(' ')).toContain(line.id)
    expect(document.activeElement).toBe(pin)
  })
})

describe('the push switch (TRUST-05)', () => {
  for (const compact of [false, true]) {
    it(`${compact ? 'Avisos (compact)' : 'Editar perfil'}: what turning them on stores, before «${t.push.enable}», with the notice`, async () => {
      render(
        <MemoryRouter>
          <PushToggle compact={compact} />
        </MemoryRouter>,
      )
      const enable = await screen.findByRole('button', { name: t.push.enable })
      const line = consentLine(noteText(t.legal.pushNote))
      expect(before(line, enable)).toBe(true)
      expect(line.querySelector('a')?.getAttribute('href')).toMatch(/^\/privacidad(\?|$)/)
    })
  }
})

describe('the scorecard photo, read by Anthropic (TRUST-05)', () => {
  it('Comité › Campos and /campos (the same screen): who reads the photo, before «Subir tarjeta», which it describes', async () => {
    render(
      <MemoryRouter>
        <AdminCourses />
      </MemoryRouter>,
    )
    const upload = await screen.findByRole('button', { name: t.admin.courses.photo })
    const line = consentLine(noteText(t.legal.scorecardNote))
    expect(line.textContent).toContain('Anthropic')
    expect(before(line, upload)).toBe(true)
    expect(upload.getAttribute('aria-describedby')).toBe(line.id)
    expect(line.querySelector('a')?.getAttribute('href')).toMatch(/^\/privacidad(\?|$)/)
  })
})
