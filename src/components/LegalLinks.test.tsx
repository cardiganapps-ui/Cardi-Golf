// @vitest-environment happy-dom
/**
 * TRUST-05: the consent line and the notes link the terms and the notice,
 * each in a new tab (a half-typed email, code or PIN survives the read), and
 * say so to a screen reader only. Where each one shows, rendered for real, is
 * src/screens/consentPoints.test.tsx.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { t } from '../i18n/es-MX'
import { LegalConsent, NoticeNote, OthersDataNotice } from './LegalLinks'

const C = t.legal.consent

afterEach(cleanup)

/** Its page, in a new tab that cannot reach back to the form's window, and «(se abre en otra pestaña)» for a screen reader only. */
function expectNewTabLink(a: HTMLElement, page: string) {
  expect(a.getAttribute('href')?.split('?')[0]).toBe(page)
  expect(a.getAttribute('target')).toBe('_blank')
  expect(a.getAttribute('rel')).toContain('noopener')
  const said = [...a.querySelectorAll('span')].filter((s) => s.textContent?.trim() === t.legal.newTab)
  expect(said).toHaveLength(1)
  expect(said[0]!.className).toBe('sr-only')
}

describe('the consent line', () => {
  it('«Al continuar»: the terms, then the notice', () => {
    render(<LegalConsent />)
    const terms = screen.getByRole('link', { name: `${C.terms} ${t.legal.newTab}` })
    expectNewTabLink(terms, '/terminos')
    expectNewTabLink(screen.getByRole('link', { name: `${C.privacy} ${t.legal.newTab}` }), '/privacidad')
    expect(terms.closest('p')!.textContent).toBe('Al continuar aceptas los Términos de uso (se abre en otra pestaña) y el Aviso de privacidad (se abre en otra pestaña).')
  })

  it('«Al entrar»: short enough to sit above a tournament\'s faces, with an id for the field it describes', () => {
    render(<LegalConsent enter id="consent" />)
    const terms = screen.getByRole('link', { name: `${C.termsShort} ${t.legal.newTab}` })
    expectNewTabLink(terms, '/terminos')
    expectNewTabLink(screen.getByRole('link', { name: `${C.privacy} ${t.legal.newTab}` }), '/privacidad')
    const line = terms.closest('p')!
    expect(line.id).toBe('consent')
    expect(line.textContent).toBe('Al entrar aceptas los Términos (se abre en otra pestaña) y el Aviso de privacidad (se abre en otra pestaña).')
  })
})

describe('the notes that end on the notice', () => {
  it('the Comité, typing other people\'s data, is told who sees it', () => {
    render(<OthersDataNotice id="others" />)
    const link = screen.getByRole('link', { name: `${t.legal.othersData.privacy} ${t.legal.newTab}` })
    expectNewTabLink(link, '/privacidad')
    expect(link.closest('p')!.id).toBe('others')
  })

  it('the push switch and the scorecard photo', () => {
    for (const note of [t.legal.pushNote, t.legal.scorecardNote]) {
      render(<NoticeNote note={note} />)
      expectNewTabLink(screen.getByRole('link', { name: `${note.privacy} ${t.legal.newTab}` }), '/privacidad')
      expect(document.querySelector('[data-legal-consent]')!.textContent).toBe(`${note.start}${note.privacy} ${t.legal.newTab}${note.end}`)
      cleanup()
    }
  })
})
