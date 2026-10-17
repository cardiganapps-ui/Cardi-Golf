// @vitest-environment happy-dom
/**
 * REL-17: holes still on the phone, and writes the server refused, show on
 * the Tarjeta tab from every screen, not only inside the Tarjeta.
 *
 * REL-02, REL-04: the header's status line, from facts. It read «Sin señal:
 * mostrando lo último guardado (10:42)» whenever the live channel was off,
 * signal or not, and gave a time of day that made a two-day-old board look
 * like this morning's.
 *
 * REL-21, PWA-15: one model of the connection, said once, here; the chip is
 * «Actualizar» whenever the boards are not live.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { useOutbox } from '../../data/outbox'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from './tournamentContext'
import { TournamentShell } from './TournamentShell'
import { LiveScreen } from './LiveScreen'
import { useRefreshBoards } from './connection'

function mount() {
  const fx = getFixture('minimal4-live')!
  useTournament.setState({
    tournamentId: fx.snapshot.tournament.id,
    data: dataFromSnapshot(structuredClone(fx.snapshot)),
    loading: false,
    error: null,
    realtime: 'live',
  })
  return render(
    <MemoryRouter initialEntries={['/t/x/juegos']}>
      <Routes>
        <Route
          path="/t/:slug/*"
          element={
            <TournamentContext.Provider
              value={{
                tournamentId: fx.snapshot.tournament.id,
                slug: 'x',
                lookup: fx.lookup,
                me: fx.me,
                refresh: async () => undefined,
                leave: async () => undefined,
              }}
            >
              <TournamentShell />
            </TournamentContext.Provider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}
const cardTab = () => screen.getByRole('link', { name: new RegExp(`^${t.nav.card}`) })
const realRefreshNow = useTournament.getState().refreshNow

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useOutbox.setState({ pendingHoles: 0, rejected: [] })
  useTournament.setState({ refreshNow: realRefreshNow })
})

describe('the Tarjeta tab says what is still on the phone (REL-17)', () => {
  it('nothing waiting: no badge', () => {
    mount()
    expect(cardTab().textContent).toBe(t.nav.card)
  })

  it('holes waiting: their count, read out with the tab', () => {
    mount()
    act(() => useOutbox.setState({ pendingHoles: 3 }))
    expect(within(cardTab()).getByText('3')).toBeTruthy()
    expect(cardTab().textContent).toContain(t.sync.pendingHoles(3))
  })

  it('a refused write wins over the waiting count', () => {
    mount()
    act(() =>
      useOutbox.setState({
        pendingHoles: 3,
        rejected: [{ key: 'k', kind: 'score', tournamentId: 't', payload: {} as never, message: 'x', at: 0 }],
      }),
    )
    expect(within(cardTab()).getByText('1').className).toMatch(/tabBadgeBad/)
    expect(cardTab().textContent).toContain(t.sync.rejected(1))
  })
})

/** The boards on screen, from the phone or the server, saved `minutesAgo`. `ctx`: the gate's asks, for the chip's tap. */
function showBoards(
  state: {
    source: 'cache' | 'server'
    realtime?: 'off' | 'connecting' | 'live' | 'error'
    minutesAgo: number
    error?: string
  },
  ctx: { refresh?: () => Promise<void>; retry?: () => Promise<void> } = {},
) {
  const fx = getFixture('minimal4-live')!
  useTournament.setState({
    tournamentId: 't-real',
    data: dataFromSnapshot(structuredClone(fx.snapshot)),
    source: state.source,
    realtime: state.realtime ?? 'off',
    updatedAt: Date.now() - state.minutesAgo * 60_000,
    error: state.error ?? null,
  })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider
        value={{
          tournamentId: 't-real',
          slug: 'nacho',
          lookup: fx.lookup,
          me: fx.me,
          refresh: ctx.refresh ?? (async () => undefined),
          retry: ctx.retry,
          leave: async () => undefined,
        }}
      >
        <TournamentShell />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
const header = () => document.querySelector('header')!.textContent ?? ''
/** The connection, in the chip beside the event name. */
const chip = () => document.querySelector('header [class*="_live_"]')?.textContent ?? null
/** How old the boards are, on the header's second line. */
const age = () => document.querySelector('header [class*="_boardsAge_"]')?.textContent ?? null
async function noSignal() {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  await act(async () => {
    window.dispatchEvent(new Event('offline'))
  })
}

describe('the header says what the boards are (REL-02, REL-04)', () => {
  it("with signal, the phone's copy while the live tournament is on its way: «Conectando…», and how old it is", () => {
    showBoards({ source: 'cache', minutesAgo: 5 })
    expect(chip()).toBe(t.sync.connecting)
    expect(age()).toBe(t.sync.boardsAge('hace 5 min'))
  })

  it('with no signal: «Sin señal», and how old the boards are', async () => {
    showBoards({ source: 'cache', minutesAgo: 5 })
    await noSignal()
    expect(chip()).toBe(t.sync.offlineShort)
    expect(age()).toBe(t.sync.boardsAge('hace 5 min'))
  })

  it('with no signal and holes still on the phone, the age stays, and the holes are the Tarjeta tab’s to say (REL-21)', async () => {
    // It used to read «Sin señal, 1 hoyo en el teléfono», with no age at all; then the age line counted the
    // holes too, which the Tarjeta's tab and its line already say.
    useOutbox.setState({ pendingHoles: 1 })
    showBoards({ source: 'cache', minutesAgo: 2 * 24 * 60 })
    await noSignal()
    expect(age()).toBe(t.sync.boardsAge('hace 2 días'))
    expect(header()).not.toMatch(/hoyo/)
    expect(cardTab().textContent).toContain(t.sync.pendingHoles(1))
  })

  it('a hole saved on a two-day-old copy leaves it two days old', () => {
    showBoards({ source: 'cache', minutesAgo: 2 * 24 * 60 })
    act(() =>
      useTournament.getState().patch((s) => {
        s.scores[0]!.strokes = 9
      }),
    )
    expect(header()).toContain('hace 2 días')
    expect(header()).not.toContain('hace un momento')
  })

  it("the server's boards with the channel down never read «Sin señal», and need no age", () => {
    showBoards({ source: 'server', realtime: 'off', minutesAgo: 0 })
    expect(header()).not.toContain(t.sync.offlineShort)
    expect(age()).toBeNull()
    cleanup()
    // It read «Sin actualizaciones en vivo», 27 characters beside the event name; the channel is joining again (REL-21).
    showBoards({ source: 'server', realtime: 'error', minutesAgo: 0 })
    expect(chip()).toBe(t.sync.connecting)
    expect(age()).toBeNull()
  })

  it("the server's boards after a fetch of them failed: «Conectando…» while it is tried again, and how old they are (REL-10)", () => {
    // It read «En vivo» with no age while every fetch failed.
    showBoards({ source: 'server', realtime: 'live', minutesAgo: 7, error: t.errors.network })
    expect(chip()).toBe(t.sync.connecting)
    expect(age()).toBe(t.sync.boardsAge('hace 7 min'))
    act(() => useTournament.setState({ error: null, updatedAt: Date.now() }))
    expect(chip()).toBe(t.sync.live)
    expect(age()).toBeNull()
  })

  it('a two-day-old copy says so', () => {
    showBoards({ source: 'cache', minutesAgo: 2 * 24 * 60 })
    expect(age()).toMatch(/hace 2 días/)
  })

  it('the chip stays short, so the event name keeps its room (chips under 18 characters)', async () => {
    // «Conectando, guardado ayer, 7:49 a.m.» cut the event name to «Nach…» at 375 px.
    showBoards({ source: 'cache', minutesAgo: 26 * 60 })
    expect(chip()!.length).toBeLessThan(18)
    useOutbox.setState({ pendingHoles: 12 })
    await noSignal()
    expect(chip()!.length).toBeLessThan(18)
  })

  it('the age keeps counting while the copy is up', () => {
    vi.useFakeTimers()
    try {
      showBoards({ source: 'cache', minutesAgo: 5 })
      expect(age()).toBe(t.sync.boardsAge('hace 5 min'))
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(age()).toBe(t.sync.boardsAge('hace 6 min'))
    } finally {
      vi.useRealTimers()
    }
  })
})

/** The chip as a button: «Actualizar» after what it says (PWA-15). */
const chipButton = () => within(document.querySelector('header')!).queryByRole('button')
/** A promise and the means to end it: a refresh under way. */
function deferred() {
  let done!: () => void
  const promise = new Promise<void>((r) => (done = r))
  return { promise, done }
}

describe('one connection, said once, in the header (REL-21)', () => {
  it('the live channel joining reads «Conectando…»: it used to read nothing at all', () => {
    showBoards({ source: 'server', realtime: 'connecting', minutesAgo: 0 })
    expect(chip()).toBe(t.sync.connecting)
    expect(age()).toBeNull()
  })

  it('«En vivo» only with the server’s boards and the channel joined', () => {
    showBoards({ source: 'server', realtime: 'live', minutesAgo: 0 })
    expect(chip()).toBe(t.sync.live)
    expect(age()).toBeNull()
    cleanup()
    // The join answered over the phone's copy: still connecting until the server's boards are in.
    showBoards({ source: 'cache', realtime: 'live', minutesAgo: 3 })
    expect(chip()).toBe(t.sync.connecting)
  })
})

describe('the chip is «Actualizar» while the boards are not live (PWA-15)', () => {
  const setRefresh = (fn: () => Promise<void>) => useTournament.setState({ refreshNow: vi.fn(fn) })

  it('live, it is the state and nothing else: no button', () => {
    showBoards({ source: 'server', realtime: 'live', minutesAgo: 0 })
    expect(chipButton()).toBeNull()
  })

  it('anything else is a button named for what it says, then «Actualizar»', async () => {
    showBoards({ source: 'server', realtime: 'error', minutesAgo: 0 })
    expect(chipButton()!.getAttribute('aria-label')).toBe(t.sync.refreshLabel(t.sync.connecting))
    cleanup()
    showBoards({ source: 'cache', minutesAgo: 5 })
    await noSignal()
    expect(chipButton()!.getAttribute('aria-label')).toBe(t.sync.refreshLabel(t.sync.offlineShort))
    expect(chipButton()!.textContent).toBe(t.sync.offlineShort)
  })

  it('over the server’s boards a tap asks the store, once, and says so while it runs', async () => {
    const run = deferred()
    showBoards({ source: 'server', realtime: 'error', minutesAgo: 0 })
    setRefresh(() => run.promise)
    const refreshNow = useTournament.getState().refreshNow
    await act(async () => {
      fireEvent.click(chipButton()!)
    })
    expect(refreshNow).toHaveBeenCalledTimes(1)
    expect(chip()).toBe(t.sync.refreshing)
    expect(chipButton()!.getAttribute('aria-busy')).toBe('true')
    // A second tap while it runs starts nothing.
    await act(async () => {
      fireEvent.click(chipButton()!)
    })
    expect(refreshNow).toHaveBeenCalledTimes(1)
    await act(async () => run.done())
    expect(chip()).toBe(t.sync.connecting)
    expect(chipButton()!.getAttribute('aria-busy')).toBeNull()
  })

  it('a fetch that failed: the tap asks the store too', async () => {
    showBoards({ source: 'server', realtime: 'live', minutesAgo: 7, error: t.errors.network })
    setRefresh(async () => undefined)
    await act(async () => {
      fireEvent.click(chipButton()!)
    })
    expect(useTournament.getState().refreshNow).toHaveBeenCalledTimes(1)
  })

  it('over the phone’s copy, or with no channel, the gate asks again (session, boards and channel), not the store', async () => {
    for (const state of [
      { source: 'cache' as const, minutesAgo: 5 },
      { source: 'server' as const, realtime: 'off' as const, minutesAgo: 0 },
    ]) {
      const retry = vi.fn(async () => undefined)
      const refresh = vi.fn(async () => undefined)
      showBoards(state, { retry, refresh })
      setRefresh(async () => undefined)
      await act(async () => {
        fireEvent.click(chipButton()!)
      })
      expect(retry).toHaveBeenCalledTimes(1)
      expect(refresh).not.toHaveBeenCalled()
      expect(useTournament.getState().refreshNow).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('with no `retry` (the design fixtures), the gate’s `refresh`', async () => {
    const refresh = vi.fn(async () => undefined)
    showBoards({ source: 'cache', minutesAgo: 5 }, { refresh })
    await act(async () => {
      fireEvent.click(chipButton()!)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('two asks in the same moment (the chip, and a pull let go) are one refresh, and both get it', async () => {
    const run = deferred()
    const fx = getFixture('minimal4-live')!
    useTournament.setState({
      tournamentId: 't-real',
      data: dataFromSnapshot(structuredClone(fx.snapshot)),
      source: 'server',
      realtime: 'error',
      error: null,
    })
    setRefresh(() => run.promise)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
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
        {children}
      </TournamentContext.Provider>
    )
    const { result } = renderHook(() => useRefreshBoards(), { wrapper })
    let first: Promise<void> | undefined
    let second: Promise<void> | undefined
    act(() => {
      first = result.current.refresh()
      second = result.current.refresh()
    })
    expect(useTournament.getState().refreshNow).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    expect(result.current.refreshing).toBe(true)
    await act(async () => run.done())
    expect(result.current.refreshing).toBe(false)
  })

  it('a refresh that fails puts the chip back as it was', async () => {
    showBoards({ source: 'server', realtime: 'error', minutesAgo: 0 })
    setRefresh(async () => {
      throw new Error('sin red')
    })
    await act(async () => {
      fireEvent.click(chipButton()!)
    })
    expect(chip()).toBe(t.sync.connecting)
  })
})

/** En vivo inside the shell, as the app shows it. */
function showLive(state: { source: 'cache' | 'server'; minutesAgo: number; error?: string }) {
  const fx = getFixture('minimal4-live')!
  useTournament.setState({
    tournamentId: 't-real',
    data: dataFromSnapshot(structuredClone(fx.snapshot)),
    source: state.source,
    realtime: 'off',
    updatedAt: Date.now() - state.minutesAgo * 60_000,
    error: state.error ?? null,
  })
  return render(
    <MemoryRouter initialEntries={['/t/nacho']}>
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
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}
const times = (text: string) => (document.body.textContent ?? '').split(text).length - 1

describe('En vivo says how old the boards are once (REL-04)', () => {
  it("the phone's copy: the header says it, the status line does not repeat it", () => {
    showLive({ source: 'cache', minutesAgo: 5 })
    expect(age()).toBe(t.sync.boardsAge('hace 5 min'))
    expect(times('hace 5 min')).toBe(1)
  })

  it('with no signal, the same', async () => {
    showLive({ source: 'cache', minutesAgo: 5 })
    await noSignal()
    expect(times('hace 5 min')).toBe(1)
  })

  it("the server's boards: no age in the header, so the status line gives it, once", () => {
    showLive({ source: 'server', minutesAgo: 5 })
    expect(age()).toBeNull()
    expect(times(t.live.updated('hace 5 min'))).toBe(1)
  })

  it('a fetch that failed: the header says how old, the status line does not repeat it (REL-10)', () => {
    showLive({ source: 'server', minutesAgo: 5, error: t.errors.timeout })
    expect(age()).toBe(t.sync.boardsAge('hace 5 min'))
    expect(times('hace 5 min')).toBe(1)
  })
})
