// @vitest-environment happy-dom
/**
 * REL-15 at `/` for account holders (the Comité, anyone who saved a profile):
 * their home is Mi Polo, which waits for the profile from the server. With no
 * signal it showed a spinner and then an error with only «Reintentar» (10 s on
 * lie-fi), and no way to the boards saved on the phone, which need neither the
 * session nor the server. «Tu último torneo» must be there at once, while the
 * profile loads and after it fails.
 */
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ state: { ready: true, user: { id: 'u-account' } as unknown, isAnonymous: false, bootError: null as 'timeout' | 'error' | null } }))
vi.mock('../data/auth', () => ({
  useAuth: () => auth.state,
  hasStoredSession: () => true,
  retryAuth: vi.fn(async () => undefined),
}))
vi.mock('../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({}) }))

/** The profile as the server would give it: never (no signal), or an error (lie-fi, after the timeout). */
const profile = vi.hoisted(() => ({ state: { profile: null, links: [] as unknown[], loading: true, error: null as string | null, load: async () => undefined } }))
vi.mock('../data/profiles', async (orig) => ({
  ...(await orig<typeof import('../data/profiles')>()),
  useMyProfile: Object.assign(() => profile.state, { getState: () => profile.state }),
}))
vi.mock('../data/api', async (orig) => ({ ...(await orig<typeof import('../data/api')>()), listMyTournaments: () => new Promise(() => undefined) }))
vi.mock('../data/social', async (orig) => ({
  ...(await orig<typeof import('../data/social')>()),
  friendsFeed: () => new Promise(() => undefined),
  useUnread: (sel: (s: { count: number; refresh: () => Promise<void> }) => unknown) => sel({ count: 0, refresh: async () => undefined }),
}))
vi.mock('../data/crews', async (orig) => ({ ...(await orig<typeof import('../data/crews')>()), myCrews: () => new Promise(() => undefined) }))

import { getFixture } from '../dev/fixtures'
import { setLastTournament } from '../data/session'
import { clearAllCached, saveEntry, saveSnapshot } from '../data/snapshotCache'
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

beforeEach(async () => {
  await clearAllCached()
  setLastTournament({ slug, name })
  profile.state = { ...profile.state, profile: null, loading: true, error: null }
})
afterEach(() => cleanup())

describe('an account holder at home with no signal (REL-15)', () => {
  it('reaches the saved boards while Mi Polo is still waiting for the profile', async () => {
    await savedOnPhone()
    open()
    const go = await screen.findByRole('link', { name: t.home.joinButton }, { timeout: 500 })
    expect(go.getAttribute('href')).toBe(`/t/${slug}`)
    expect(screen.getByText(name)).toBeTruthy()
    fireEvent.click(go)
    expect(await screen.findByText('Tablero guardado')).toBeTruthy()
  })

  it('still has them once the profile failed, next to «Reintentar»', async () => {
    await savedOnPhone()
    profile.state = { ...profile.state, loading: false, error: 'El servidor no respondió a tiempo.' }
    open()
    const go = await screen.findByRole('link', { name: t.home.joinButton }, { timeout: 500 })
    expect(screen.getByRole('button', { name: t.common.retry })).toBeTruthy()
    fireEvent.click(go)
    expect(await screen.findByText('Tablero guardado')).toBeTruthy()
  })

  it('offers nothing when the phone has no boards saved', async () => {
    open()
    await new Promise((r) => setTimeout(r, 100))
    expect(screen.queryByRole('link', { name: t.home.joinButton })).toBeNull()
    expect(screen.queryByText(name)).toBeNull()
  })
})
