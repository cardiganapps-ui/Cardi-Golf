// @vitest-environment happy-dom
/**
 * COPY-04: on the course, with one bar of signal, a PIN that could not reach
 * the server printed «TypeError: Failed to fetch» under the field. The real
 * screen, with claim_player failing the way supabase-js reports it.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), claimPlayer: vi.fn() }))

import { ApiError, claimPlayer, type LookupResult } from '../../data/api'
import { t } from '../../i18n/es-MX'
import { EnterScreen } from './EnterScreen'

const lookup: LookupResult = {
  id: 't1',
  slug: 'bachelor',
  name: 'Invitacional',
  tagline: null,
  logoUrl: null,
  accentColor: null,
  status: 'live',
  joinCode: 'ABC123',
  players: [{ id: 'p1', displayName: 'Mauricio', fullName: 'Mauricio Lozano', tier: 'B', avatarUrl: null, isHonoree: false, hasPin: true }],
}

async function typePin(error: unknown) {
  vi.mocked(claimPlayer).mockRejectedValueOnce(error)
  render(
    <MemoryRouter>
      <EnterScreen lookup={lookup} onEntered={vi.fn()} />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Mauricio/ }))
  fireEvent.change(screen.getByLabelText(t.enter.pin), { target: { value: '1234' } })
}

afterEach(cleanup)

describe('EnterScreen PIN error', () => {
  it.each([
    ['Chrome', 'TypeError: Failed to fetch'],
    ['Safari', 'TypeError: Load failed'],
  ])('%s with no signal says so in Spanish, not the browser text', async (_browser, raw) => {
    // What claimPlayer throws when postgrest-js reports a fetch that never got an answer.
    await typePin(new ApiError(raw, ''))
    expect(await screen.findByText(t.errors.network)).toBeTruthy()
    expect(screen.queryByText(new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeNull()
    expect(document.body.textContent).not.toContain('TypeError')
  })

  it('a refusal from the database shows copy, not the policy text', async () => {
    await typePin(new ApiError('permission denied for function claim_player', '42501'))
    expect(await screen.findByText(t.errors.permission)).toBeTruthy()
    expect(document.body.textContent).not.toContain('permission denied')
  })
})
