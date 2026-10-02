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
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ state: { ready: true, user: { id: 'u-account' } as unknown, isAnonymous: false, bootError: null as 'timeout' | 'error' | null } }))
vi.mock('../data/auth', () => ({
  useAuth: () => auth.state,
  hasStoredSession: () => true,
  retryAuth: vi.fn(async () => undefined),
}))
vi.mock('../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({}) }))

/** The profile as the server gives it: never (no signal), an error (lie-fi, after the timeout), or late. */
vi.mock('../data/profiles', async (orig) => {
  const { create } = await import('zustand')
  return {
    ...(await orig<typeof import('../data/profiles')>()),
    useMyProfile: create(() => ({ profile: null as unknown, links: [] as unknown[], loading: true, error: null as string | null, load: async () => undefined })),
  }
})
vi.mock('../data/api', async (orig) => ({ ...(await orig<typeof import('../data/api')>()), listMyTournaments: () => new Promise(() => undefined) }))
vi.mock('../data/social', async (orig) => ({
  ...(await orig<typeof import('../data/social')>()),
  friendsFeed: () => new Promise(() => undefined),
  useUnread: (sel: (s: { count: number; refresh: () => Promise<void> }) => unknown) => sel({ count: 0, refresh: async () => undefined }),
}))
vi.mock('../data/crews', async (orig) => ({ ...(await orig<typeof import('../data/crews')>()), myCrews: () => new Promise(() => undefined) }))

import { getFixture } from '../dev/fixtures'
import { useMyProfile } from '../data/profiles'
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

/** What the server answers for this account, once it does. */
const PROFILE = {
  id: 'u-account',
  handle: 'ivanj',
  displayName: 'Iván Jáuregui',
  fullName: 'Iván Jáuregui',
  avatarUrl: null,
  createdAt: '2027-01-01T00:00:00Z',
  updatedAt: '2027-01-02T00:00:00Z',
}
/** The account's link to the saved tournament (it plays there). */
const LINK = { playerId: 'p1', displayName: 'Iván J.', linkStatus: 'confirmed', tournamentId: id, slug, name, tournamentStatus: 'live', logoUrl: null }
const profileArrives = (links: unknown[]) => act(() => useMyProfile.setState({ profile: PROFILE as never, links: links as never, loading: false, error: null }))

beforeEach(async () => {
  await clearAllCached()
  setLastTournament({ slug, name })
  useMyProfile.setState({ profile: null, links: [], loading: true, error: null })
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
    useMyProfile.setState({ loading: false, error: 'El servidor no respondió a tiempo.' })
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

/**
 * The profile arriving while the card is on screen (the verifier of #87, round
 * 3): the loaded view started with «Hola, Iván» exactly where the card was, so
 * a tap meant for the boards opened the profile, and an account not linked to
 * that tournament lost it from Mi Polo altogether.
 */
describe('when the profile arrives', () => {
  /** The links on screen, in order: where each one goes. */
  const order = () => screen.getAllByRole('link').map((a) => a.getAttribute('href'))

  it('the card stays where it was, first under the top bar, and the tournament is not listed twice', async () => {
    await savedOnPhone()
    open()
    await screen.findByRole('link', { name: t.home.joinButton }, { timeout: 500 })
    await profileArrives([LINK])
    expect(screen.getByText(t.mipolo.hello('Iván'))).toBeTruthy()
    const hrefs = order()
    expect(hrefs.filter((h) => h === `/t/${slug}`)).toHaveLength(1)
    expect(hrefs.indexOf(`/t/${slug}`)).toBeLessThan(hrefs.indexOf('/p/ivanj'))
    expect(screen.getByText(t.home.lastTournament)).toBeTruthy()
  })

  it('an account not linked to that tournament keeps it on Mi Polo', async () => {
    await savedOnPhone()
    open()
    await screen.findByRole('link', { name: t.home.joinButton }, { timeout: 500 })
    await profileArrives([])
    expect(screen.getByText(t.mipolo.hello('Iván'))).toBeTruthy()
    expect(screen.getByRole('link', { name: t.home.joinButton }).getAttribute('href')).toBe(`/t/${slug}`)
  })

  it('back on Mi Polo with the profile already there: a tournament in its list shows once, as a row, and nothing moves', async () => {
    await savedOnPhone()
    await profileArrives([LINK])
    open()
    expect(await screen.findByText(t.mipolo.hello('Iván'))).toBeTruthy()
    await new Promise((r) => setTimeout(r, 100))
    expect(order().filter((h) => h === `/t/${slug}`)).toHaveLength(1)
    expect(screen.queryByText(t.home.lastTournament)).toBeNull()
  })

  it('…and one not in its list is still offered', async () => {
    await savedOnPhone()
    await profileArrives([])
    open()
    const go = await screen.findByRole('link', { name: t.home.joinButton }, { timeout: 500 })
    expect(go.getAttribute('href')).toBe(`/t/${slug}`)
  })
})
