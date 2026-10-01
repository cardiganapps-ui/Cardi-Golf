// @vitest-environment happy-dom
/**
 * TRUST-02: «Mi dinero» on the profile said «Solo tú lo ves.» Each figure
 * under it is a tournament's money, which every member of that tournament
 * sees in Dinero (and its Comité reads the published net), so the hint said
 * the same false thing the notice used to. It now says where the summary
 * shows and who sees each figure.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it } from 'vitest'
import { PROFILE_FIXTURES } from '../../dev/profileFixtures'
import { t } from '../../i18n/es-MX'
import { ProfileView } from './ProfileScreen'

afterEach(cleanup)

it('«Mi dinero» says the summary is only on the profile, and that each tournament sees its figure in Dinero', () => {
  const f = PROFILE_FIXTURES.yo!
  render(
    <MemoryRouter>
      <ProfileView card={f.card} tournaments={f.tournaments} rounds={f.rounds} money={f.money} />
    </MemoryRouter>,
  )
  const section = screen.getByText(t.profile.money).closest('section')!
  expect(within(section).getByText(t.profile.moneyHint).textContent).toBe('Solo sale en tu perfil; en cada torneo, todos lo ven en Dinero.')
  expect(section.textContent).not.toMatch(/solo tú lo ves/i)
  // Each figure opens that tournament's Dinero, where its members see the same net.
  for (const m of f.money!) expect(within(section).getByRole('link', { name: new RegExp(m.name) }).getAttribute('href')).toBe(`/t/${m.slug}/dinero`)
})
