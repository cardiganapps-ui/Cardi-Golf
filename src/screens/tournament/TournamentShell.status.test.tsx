// @vitest-environment happy-dom
/**
 * REL-21: with no signal on a phone's copy, «Sin señal» showed three times at once: the app's banner, the
 * header's chip, and a line under it; on the Tarjeta its own line said it again. Every state of the
 * connection now shows once on every tournament screen, in the header, and the app's banner stays away.
 * The age shows once too: the header's line when the boards may be old, else En vivo's own.
 */
import 'fake-indexeddb/auto'
import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from '../../data/testing/fakeSupabase'
import { snapshotToRows } from '../../data/testing/rows'
import { getFixture } from '../../dev/fixtures'

const fx = getFixture('minimal4-live')!
const server = fakeSupabase(snapshotToRows(fx.snapshot))
vi.mock('../../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))
vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

const { t } = await import('../../i18n/es-MX')
const { OfflineBanner } = await import('../../components/OfflineBanner')
const { dataFromSnapshot, useTournament } = await import('../../data/tournamentStore')
const { TournamentContext } = await import('./TournamentGate')
const { TournamentShell } = await import('./TournamentShell')
const { LiveScreen } = await import('./LiveScreen')
const { ScorecardScreen } = await import('./ScorecardScreen')
const { GamesScreen } = await import('./GamesScreen')
const { MoneyScreen } = await import('./MoneyScreen')
const { MoreScreen } = await import('./MoreScreen')

// happy-dom rejects a running animation's `finished` when the test unmounts it; nothing here waits on it.
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  return cancelAnimation.call(this)
}

type Facts = { online: boolean; source: 'cache' | 'server'; realtime: 'off' | 'connecting' | 'live' | 'error'; error?: string }
const STATES: Array<{ name: string; facts: Facts; says: string; old: boolean }> = [
  { name: 'no signal, the phone’s copy', facts: { online: false, source: 'cache', realtime: 'off' }, says: t.sync.offlineShort, old: true },
  { name: 'no signal, the server’s boards', facts: { online: false, source: 'server', realtime: 'error' }, says: t.sync.offlineShort, old: true },
  { name: 'the phone’s copy, the live tournament on its way', facts: { online: true, source: 'cache', realtime: 'off' }, says: t.sync.connecting, old: true },
  { name: 'a fetch that failed', facts: { online: true, source: 'server', realtime: 'live', error: t.errors.network }, says: t.sync.connecting, old: true },
  { name: 'the channel joining', facts: { online: true, source: 'server', realtime: 'connecting' }, says: t.sync.connecting, old: false },
  { name: 'the channel down, the boards polled', facts: { online: true, source: 'server', realtime: 'error' }, says: t.sync.connecting, old: false },
  { name: 'live', facts: { online: true, source: 'server', realtime: 'live' }, says: t.sync.live, old: false },
]
const SCREENS: Array<[string, React.ReactNode]> = [
  ['En vivo', <LiveScreen key="live" />],
  ['Tarjeta', <ScorecardScreen key="card" />],
  ['Juegos', <GamesScreen key="games" />],
  ['Dinero', <MoneyScreen key="money" />],
  ['Más', <MoreScreen key="more" />],
]
const PATH: Record<string, string> = { 'En vivo': '', Tarjeta: '/tarjeta', Juegos: '/juegos', Dinero: '/dinero', Más: '/mas' }

async function show(facts: Facts, name: string, screen: React.ReactNode) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(facts.online)
  useTournament.setState({ tournamentId: 't-real', data: dataFromSnapshot(structuredClone(fx.snapshot)), loading: false, source: facts.source, realtime: facts.realtime, error: facts.error ?? null, updatedAt: Date.now() - 5 * 60_000 })
  render(
    // The app's frame: its banner over every screen, as AppShell renders it.
    <MemoryRouter initialEntries={[`/t/nacho${PATH[name]}`]}>
      <OfflineBanner />
      <Routes>
        <Route
          path="/t/:slug"
          element={
            <TournamentContext.Provider value={{ tournamentId: 't-real', slug: 'nacho', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
              <TournamentShell />
            </TournamentContext.Provider>
          }
        >
          <Route index element={name === 'En vivo' ? screen : null} />
          <Route path="*" element={screen} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

/** How many times `text` shows on the page, the tab bar left out (its first tab is «En vivo», a place, not a state). */
function times(text: string): number {
  const page = document.body.cloneNode(true) as HTMLElement
  page.querySelectorAll('nav').forEach((n) => n.remove())
  return (page.textContent ?? '').split(text).length - 1
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useTournament.getState().unsubscribe()
})

describe('every tournament screen says the connection once, in the header (REL-21)', () => {
  for (const state of STATES) {
    for (const [name, screen] of SCREENS) {
      it(`${state.name}, on ${name}`, async () => {
        await show(state.facts, name, screen)
        const header = document.querySelector('header')!
        expect(header.textContent).toContain(state.says)
        // Once on the page, and none of the other states' words anywhere.
        expect(times(state.says)).toBe(1)
        for (const other of [t.sync.offlineShort, t.sync.connecting, t.sync.live, t.sync.refreshing].filter((w) => w !== state.says)) expect(times(other)).toBe(0)
        // The app's banner stays away from a tournament screen (MOT-17).
        expect(times(t.sync.offline)).toBe(0)
        // The age: the header's line when the boards may be old; else only En vivo's own line gives it.
        const ages = times(t.sync.boardsAge(''))
        expect(ages).toBe(state.old || name === 'En vivo' ? 1 : 0)
        expect(!!header.querySelector('[class*="_boardsAge_"]')).toBe(state.old)
      })
    }
  }
})
