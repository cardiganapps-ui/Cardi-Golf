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
import { afterEach, describe, expect, it } from 'vitest'
import type { LookupResult } from '../data/api'
import { t } from '../i18n/es-MX'
import { EnterScreen } from './tournament/EnterScreen'

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
