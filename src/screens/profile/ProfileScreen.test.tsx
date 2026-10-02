// @vitest-environment happy-dom
/**
 * TRUST-02: «Mi dinero» on the profile said «Solo tú lo ves.» Each figure
 * under it is a tournament's money, which every member of that tournament
 * sees in Dinero (and its Comité reads the published net), so the hint said
 * the same false thing the notice used to. Its next wording, «Solo sale en tu
 * perfil», read as if whoever opens the profile saw it (PR #88's second
 * verifier, P3): only its owner does. It now says who sees the summary and
 * who sees each figure.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it } from 'vitest'
import { PROFILE_FIXTURES } from '../../dev/profileFixtures'
import { t } from '../../i18n/es-MX'
import { ProfileView } from './ProfileScreen'

afterEach(cleanup)

const mine = PROFILE_FIXTURES.yo!

it('«Mi dinero» says only you see the summary, and that everyone in each tournament sees its figure in Dinero', () => {
  render(
    <MemoryRouter>
      <ProfileView card={mine.card} tournaments={mine.tournaments} rounds={mine.rounds} money={mine.money} />
    </MemoryRouter>,
  )
  const section = screen.getByText(t.profile.money).closest('section')!
  const hint = within(section).getByText(t.profile.moneyHint)
  expect(hint.textContent).toBe('Este resumen solo lo ves tú; cada cifra la ven todos en el Dinero de su torneo.')
  // Each figure opens that tournament's Dinero, where its members see the same net.
  for (const m of mine.money!) expect(within(section).getByRole('link', { name: new RegExp(m.name) }).getAttribute('href')).toBe(`/t/${m.slug}/dinero`)
})

it('what makes «solo lo ves tú» true: the section is drawn for the profile\'s owner only', () => {
  render(
    <MemoryRouter>
      <ProfileView card={{ ...mine.card, isMe: false, related: true }} tournaments={mine.tournaments} rounds={mine.rounds} money={mine.money} />
    </MemoryRouter>,
  )
  expect(screen.queryByText(t.profile.money)).toBeNull()
  expect(document.body.textContent).not.toContain(t.profile.moneyHint)
})
