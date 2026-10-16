// @vitest-environment happy-dom
/**
 * Home's other doors, signed out. UX-25: «Jugar una ronda rápida» went to a
 * plain /entrar, and once the account existed the person landed in Mi Polo, a
 * screen away from the round; it now carries `next=/ronda`, which /entrar,
 * Google's return and the first-time profile editor all follow. STRAT-17: a
 * curious organizer can look around a finished tournament before any account.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../data/auth', () => ({ useAuth: () => ({ ready: true, user: null, isAnonymous: false, bootError: null }), hasStoredSession: () => false }))
vi.mock('../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({}) }))

import { t } from '../i18n/es-MX'
import { HomeScreen } from './HomeScreen'

afterEach(() => cleanup())

describe('Home, signed out', () => {
  it('«Jugar una ronda rápida» comes back to the round once the account exists (UX-25)', () => {
    render(
      <MemoryRouter>
        <HomeScreen />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: t.home.quickRound }).getAttribute('href')).toBe('/entrar?next=%2Fronda')
    // «Entrar a mi perfil» is a plain sign-in: it goes home.
    expect(screen.getByRole('link', { name: t.account.enterProfile }).getAttribute('href')).toBe('/entrar')
  })

  it('«Ver un torneo de ejemplo» opens the example (STRAT-17)', () => {
    render(
      <MemoryRouter>
        <HomeScreen />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: t.demo.open }).getAttribute('href')).toBe('/demo')
  })
})
