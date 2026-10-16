// @vitest-environment happy-dom
/**
 * UX-20: the Comité's invite opens Entrar on the player's face (`?soy=<id>`),
 * its PIN pad ready, so the WhatsApp message is one tap and four digits from
 * the board. The link names the player, never the PIN. A face the tournament
 * doesn't have shows the faces, and «No soy yo» goes back to them. On an
 * iPhone's browser the invite still says to install first.
 */
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), claimPlayer: vi.fn() }))
vi.mock('../../data/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/auth')>()), ensureSession: vi.fn(async () => ({ user: { id: 'u' } })) }))

import type { LookupResult } from '../../data/api'
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
  players: [
    { id: 'p1', displayName: 'Mauricio', fullName: 'Mauricio Lozano', tier: 'B', avatarUrl: null, isHonoree: false, hasPin: true },
    { id: 'p2', displayName: 'René', fullName: 'René Nosti', tier: 'C', avatarUrl: null, isHonoree: false, hasPin: true },
  ],
}

function open(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <EnterScreen lookup={lookup} onEntered={vi.fn()} />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the invite opens the player’s face (UX-20)', () => {
  it('straight to his PIN pad', () => {
    open('/t/bachelor?soy=p2')
    expect(screen.getByText(t.enter.enterAs('René'))).toBeTruthy()
    expect(screen.getByLabelText(t.enter.pin)).toBeTruthy()
    expect(screen.queryByText(t.enter.tapYourFace)).toBeNull()
  })

  it('«No soy yo» goes back to the faces', () => {
    open('/t/bachelor?soy=p2')
    fireEvent.click(screen.getByRole('button', { name: t.enter.notMe }))
    expect(screen.getByText(t.enter.tapYourFace)).toBeTruthy()
  })

  it('a face the tournament doesn’t have, or none, shows the faces', () => {
    open('/t/bachelor?soy=nobody')
    expect(screen.getByText(t.enter.tapYourFace)).toBeTruthy()
    cleanup()
    open('/t/bachelor')
    expect(screen.getByText(t.enter.tapYourFace)).toBeTruthy()
  })

  it('on an iPhone’s browser it still says to install first', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 })
    open('/t/bachelor?soy=p1')
    expect(screen.getByText(t.install.iosFirst, { exact: false })).toBeTruthy()
  })
})
