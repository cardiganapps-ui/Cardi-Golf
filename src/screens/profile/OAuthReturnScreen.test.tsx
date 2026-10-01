// @vitest-environment happy-dom
/**
 * COPY-04, found by the verifier: Google's return page printed the link's
 * error_description as written. That was English at best, and anyone could
 * craft a link that put their own sentence under Polo's heading.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../../data/auth', () => ({ useAuth: () => ({ ready: false, user: null, isAnonymous: true }) }))

import { t } from '../../i18n/es-MX'
import { OAuthReturnScreen } from './OAuthReturnScreen'

afterEach(cleanup)

it('shows Polo\'s own line, never the text the link carries', () => {
  const injected = 'Tu cuenta fue suspendida. Llama al 55 1234 5678.'
  render(
    <MemoryRouter initialEntries={[`/perfil/vuelta?error=server_error&error_code=unexpected_failure&error_description=${encodeURIComponent(injected)}`]}>
      <Routes>
        <Route path="/perfil/vuelta" element={<OAuthReturnScreen />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: t.account.returnFailed })).toBeTruthy()
  expect(screen.queryByText(injected)).toBeNull()
  expect(document.body.textContent).not.toContain('suspendida')
})
