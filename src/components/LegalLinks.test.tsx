// @vitest-environment happy-dom
/**
 * TRUST-05: where someone gives their data (an account, a PIN on a
 * tournament's faces, a quick round, the Comité typing other people's), the
 * notice and the terms are a tap away first. They open beside the form, so a
 * half-typed email, code or PIN survives the read.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { t } from '../i18n/es-MX'
import { LegalConsent, OthersDataNotice } from './LegalLinks'

afterEach(() => cleanup())

describe('the consent line', () => {
  it('links the terms and the notice, each in a new tab, and says so to a screen reader', () => {
    render(<LegalConsent />)
    const terms = screen.getByRole('link', { name: `${t.legal.consent.terms} ${t.legal.newTab}` })
    const privacy = screen.getByRole('link', { name: `${t.legal.consent.privacy} ${t.legal.newTab}` })
    expect(terms.getAttribute('href')).toBe('/terminos')
    expect(privacy.getAttribute('href')).toBe('/privacidad')
    for (const a of [terms, privacy]) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
    }
    expect(screen.getByText(/Al continuar aceptas los/).textContent).toBe(`Al continuar aceptas los Términos de uso ${t.legal.newTab} y el Aviso de privacidad ${t.legal.newTab}.`)
  })

  it('the Comité, typing other people\'s data, is told what happens to it', () => {
    render(<OthersDataNotice />)
    expect(screen.getByRole('link', { name: `${t.legal.othersData.privacy} ${t.legal.newTab}` }).getAttribute('href')).toBe('/privacidad')
  })
})

describe('every place that collects data shows it', () => {
  const src = (f: string) => readFileSync(join(process.cwd(), 'src', f), 'utf8')
  for (const f of ['screens/profile/EntrarScreen.tsx', 'screens/organizer/OrganizerLoginScreen.tsx', 'screens/tournament/EnterScreen.tsx', 'screens/profile/QuickRoundScreen.tsx']) {
    it(f, () => expect(src(f)).toContain('<LegalConsent />'))
  }
  it('screens/admin/AdminPlayers.tsx', () => expect(src('screens/admin/AdminPlayers.tsx')).toContain('<OthersDataNotice />'))
})
