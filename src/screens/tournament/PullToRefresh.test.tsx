// @vitest-environment happy-dom
/**
 * PWA-15: the installed app had no way to bring the boards again by hand. `body { overscroll-behavior-y:
 * none }` turns the browser's pull-to-refresh off (it reloaded the whole app, a typed hole with it), and a
 * home-screen app has no reload button. The boards take a pull now, in the real shell:
 * - only past its threshold, only from the top of the page;
 * - on En vivo, Juegos and Dinero, never on the Tarjeta, never under a sheet or from inside one;
 * - one at a time, shared with the header's chip.
 */
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from '../../data/testing/fakeSupabase'
import { snapshotToRows } from '../../data/testing/rows'
import { getFixture } from '../../dev/fixtures'

const fx = getFixture('minimal4-live')!
const server = fakeSupabase(snapshotToRows(fx.snapshot))
vi.mock('../../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))
vi.mock('../../data/quick', () => ({ roundRivalries: vi.fn(async () => []) }))
vi.mock('../../data/profiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/profiles')>()),
  useTournamentProfiles: () => [[], () => undefined],
}))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

const { t } = await import('../../i18n/es-MX')
const { dataFromSnapshot, useTournament } = await import('../../data/tournamentStore')
const { TournamentContext } = await import('./tournamentContext')
const { TournamentShell } = await import('./TournamentShell')
const { LiveScreen } = await import('./LiveScreen')
const { ScorecardScreen } = await import('./ScorecardScreen')
const { GamesScreen } = await import('./GamesScreen')
const { MoneyScreen } = await import('./MoneyScreen')
const { PULL_RATE, PULL_SLOP_PX, PULL_THRESHOLD_PX } = await import('./pull')

const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  cancelAnimation.call(this)
}

/** The finger's travel that brings the mark just to its threshold. */
const FAR = PULL_SLOP_PX + PULL_THRESHOLD_PX / PULL_RATE
const realRefreshNow = useTournament.getState().refreshNow

/** The shell on `path`, the server's boards on screen; `refreshNow` stands in for the store's fetch. */
async function open(path = '', realtime: 'live' | 'error' = 'live') {
  let finish!: () => void
  const refreshNow = vi.fn(() => new Promise<void>((r) => (finish = r)))
  useTournament.setState({
    tournamentId: 't-real',
    data: dataFromSnapshot(structuredClone(fx.snapshot)),
    loading: false,
    source: 'server',
    realtime,
    error: null,
    updatedAt: Date.now(),
    refreshNow,
  })
  render(
    <MemoryRouter initialEntries={[`/t/nacho${path}`]}>
      <Routes>
        <Route
          path="/t/:slug"
          element={
            <TournamentContext.Provider
              value={{
                tournamentId: 't-real',
                slug: 'nacho',
                lookup: fx.lookup,
                me: fx.me,
                refresh: async () => undefined,
                leave: async () => undefined,
              }}
            >
              <TournamentShell />
            </TournamentContext.Provider>
          }
        >
          <Route index element={<LiveScreen />} />
          <Route path="tarjeta" element={<ScorecardScreen />} />
          <Route path="juegos" element={<GamesScreen />} />
          <Route path="dinero" element={<MoneyScreen />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
  return { refreshNow, finish: () => act(async () => finish()) }
}

/** The screen under the header: a pull starts on anything inside it. */
const boards = () => document.querySelector('[class*="_body_"] > div')!.lastElementChild!
const mark = () => document.querySelector('[data-pull]')
/** A finger from (x, 200) down by `dy` and across by `dx`, let go there; `onWay` runs before it lets go. */
async function drag(dy: number, dx = 0, on: Element = boards(), onWay?: () => void) {
  await act(async () => {
    fireEvent.touchStart(on, { touches: [{ clientX: 150, clientY: 200 }] })
    fireEvent.touchMove(on, { touches: [{ clientX: 150 + dx / 2, clientY: 200 + dy / 2 }] })
    fireEvent.touchMove(on, { touches: [{ clientX: 150 + dx, clientY: 200 + dy }] })
  })
  onWay?.()
  await act(async () => {
    fireEvent.touchEnd(on, { changedTouches: [{ clientX: 150 + dx, clientY: 200 + dy }] })
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useTournament.setState({ refreshNow: realRefreshNow })
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})

describe('a pull on the boards brings them again (PWA-15)', () => {
  it('past its threshold: armed under the finger, waiting once let go, idle when they are in', async () => {
    const { refreshNow, finish } = await open()
    let during: string | null = null
    await drag(FAR, 0, boards(), () => (during = mark()!.getAttribute('data-pull')))
    expect(during).toBe('armed')
    expect(refreshNow).toHaveBeenCalledTimes(1)
    expect(mark()!.getAttribute('data-pull')).toBe('waiting')
    // The chip says it too: the header is where the boards' state is read.
    expect(document.querySelector('header')!.textContent).toContain(t.sync.refreshing)
    await finish()
    expect(mark()!.getAttribute('data-pull')).toBe('idle')
    expect(document.querySelector('header')!.textContent).toContain(t.sync.live)
  })

  it('short of it, nothing', async () => {
    const { refreshNow } = await open()
    await drag(FAR - 2)
    expect(refreshNow).not.toHaveBeenCalled()
    expect(mark()!.getAttribute('data-pull')).toBe('idle')
  })

  it('only from the top of the page: further down, a drag down is the page scrolling back up', async () => {
    const { refreshNow } = await open()
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true })
    await drag(FAR + 100)
    expect(refreshNow).not.toHaveBeenCalled()
  })

  it('a sideways or upward drag is not one', async () => {
    const { refreshNow } = await open()
    await drag(20, 200)
    await drag(-FAR)
    expect(refreshNow).not.toHaveBeenCalled()
  })

  it('on Juegos and Dinero too', async () => {
    for (const path of ['/juegos', '/dinero']) {
      const { refreshNow } = await open(path)
      await drag(FAR)
      expect(refreshNow).toHaveBeenCalledTimes(1)
      cleanup()
    }
  })

  it('never on the Tarjeta, whose swipes move between holes: no mark, no refresh', async () => {
    const { refreshNow } = await open('/tarjeta')
    expect(mark()).toBeNull()
    await drag(FAR + 50)
    expect(refreshNow).not.toHaveBeenCalled()
  })

  it('never while a sheet is open, from under it or from inside it', async () => {
    const { refreshNow } = await open()
    // A row opens the player's sheet.
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(fx.snapshot.players[0]!.displayName) })[0]!)
    })
    const sheet = screen.getByRole('dialog')
    await drag(FAR, 0, within(sheet).getAllByRole('button')[0])
    await drag(FAR)
    expect(refreshNow).not.toHaveBeenCalled()
  })

  it('one at a time: a pull while one is under way starts nothing, and neither does the chip', async () => {
    const { refreshNow, finish } = await open('', 'error')
    await drag(FAR)
    await drag(FAR)
    await act(async () => {
      fireEvent.click(within(document.querySelector('header')!).getByRole('button'))
    })
    expect(refreshNow).toHaveBeenCalledTimes(1)
    await finish()
    await drag(FAR)
    expect(refreshNow).toHaveBeenCalledTimes(2)
  })

  it('a tap of the chip under way: a pull starts nothing either, not even the mark under the finger', async () => {
    const { refreshNow } = await open('', 'error')
    await act(async () => {
      fireEvent.click(within(document.querySelector('header')!).getByRole('button'))
    })
    let during: string | null = null
    await drag(FAR, 0, boards(), () => (during = mark()!.getAttribute('data-pull')))
    expect(during).toBe('idle')
    expect(refreshNow).toHaveBeenCalledTimes(1)
    // The chip's refresh brings no mark down: the header already says it.
    expect(mark()!.getAttribute('data-pull')).toBe('idle')
  })
})
