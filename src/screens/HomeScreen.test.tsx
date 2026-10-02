// @vitest-environment happy-dom
/**
 * REL-03 at `/`, where the installed app opens: with a stored session, an
 * expired token and no signal, home waited 8 s on a spinner for auth, then
 * showed «Polo está tardando en conectar» with no way to the boards saved on
 * the phone; «Tu último torneo» came 26 to 37 s later. The saved tournament
 * must be one tap away at once, and the error screen must open it too.
 */
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ state: { ready: false, user: null, isAnonymous: false, bootError: null as 'timeout' | 'error' | null } }))
vi.mock('../data/auth', () => ({
  useAuth: () => auth.state,
  hasStoredSession: () => true,
  retryAuth: vi.fn(async () => undefined),
}))
vi.mock('../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({}) }))
vi.mock('./profile/MiPolo', () => ({ MiPolo: () => <p>Mi Polo</p> }))

import { getFixture } from '../dev/fixtures'
import { setLastTournament } from '../data/session'
import { saveEntry, saveSnapshot } from '../data/snapshotCache'
import { t } from '../i18n/es-MX'
import { HomeScreen } from './HomeScreen'

const fx = getFixture('minimal4-live')!
const { slug, id, name } = fx.snapshot.tournament

function open() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/t/:slug" element={<p>Tablero guardado</p>} />
      </Routes>
    </MemoryRouter>,
  )
}
async function savedOnPhone() {
  await saveEntry({ slug, tournamentId: id, lookup: fx.lookup, me: fx.me })
  await saveSnapshot(id, fx.snapshot)
}

beforeEach(() => {
  setLastTournament({ slug, name })
  auth.state = { ready: false, user: null, isAnonymous: false, bootError: null }
})
afterEach(() => cleanup())

describe('the tournament saved on the phone, from home (REL-03)', () => {
  it('is one tap away while the stored session is still being confirmed', async () => {
    await savedOnPhone()
    open()
    // Auth never answers in this test: the way in must not wait for it.
    const last = await screen.findByRole('link', { name: t.home.joinButton }, { timeout: 500 })
    expect(screen.getByText(name)).toBeTruthy()
    fireEvent.click(last)
    expect(await screen.findByText('Tablero guardado')).toBeTruthy()
  })

  it('the screen that says Polo is slow to connect opens what is saved', async () => {
    await savedOnPhone()
    auth.state = { ...auth.state, ready: true, bootError: 'timeout' }
    open()
    expect(screen.getByText(t.boot.slowTitle)).toBeTruthy()
    fireEvent.click(await screen.findByRole('link', { name: t.boot.openSaved }, { timeout: 500 }))
    expect(await screen.findByText('Tablero guardado')).toBeTruthy()
  })

  it('with nothing saved on the phone, neither screen offers to open it', async () => {
    setLastTournament({ slug: 'nunca-guardado', name: 'Otro torneo' })
    open()
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByRole('link')).toBeNull()
    cleanup()
    auth.state = { ...auth.state, ready: true, bootError: 'timeout' }
    open()
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByRole('link', { name: t.boot.openSaved })).toBeNull()
  })
})
