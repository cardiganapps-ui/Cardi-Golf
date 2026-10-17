// @vitest-environment happy-dom
/**
 * PERF-02, MOT-22: screens load when first needed, and a load the person can't see shows nothing. A lazily loaded
 * screen used to answer a tap with a skeleton flash on every first visit (Estadísticas: nothing for 157 ms, the
 * skeleton until 456 ms, then the screen), and the first open went from the boot screen to an empty page.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Lazy } from '../components/Lazy'
import { LATE_MS, markScreenShown, resetLazyForTests } from '../components/lazyState'
import { lazyGroup, lazyScreen, prefetchScreens, preloadOnIntent } from './lazyScreen'

/** A module whose load the test settles by hand. */
function deferredModule() {
  let resolve!: () => void
  const load = vi.fn(
    () =>
      new Promise<{ Stats: () => React.JSX.Element; Rules: () => React.JSX.Element }>((ok) => {
        resolve = () => ok({ Stats: () => <h1>Estadísticas</h1>, Rules: () => <h1>Reglamento</h1> })
      }),
  )
  return { load, settle: () => resolve() }
}

beforeEach(() => {
  resetLazyForTests()
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a screen loaded when first needed (PERF-02, MOT-22)', () => {
  it('once a screen has shown, a load shows nothing for its first 200 ms, then the skeleton', async () => {
    markScreenShown()
    const m = deferredModule()
    const Stats = lazyScreen(m.load, (x) => x.Stats)
    render(
      <Lazy>
        <Stats />
      </Lazy>,
    )
    expect(screen.queryByRole('status')).toBeNull()
    await act(async () => void vi.advanceTimersByTime(LATE_MS - 1))
    expect(screen.queryByRole('status')).toBeNull()
    await act(async () => void vi.advanceTimersByTime(1))
    expect(screen.getByRole('status')).toBeTruthy()
    await act(async () => m.settle())
    expect(screen.getByRole('heading', { name: 'Estadísticas' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a load faster than that never shows the skeleton', async () => {
    markScreenShown()
    const m = deferredModule()
    const Stats = lazyScreen(m.load, (x) => x.Stats)
    render(
      <Lazy>
        <Stats />
      </Lazy>,
    )
    await act(async () => void vi.advanceTimersByTime(LATE_MS / 2))
    await act(async () => m.settle())
    await act(async () => void vi.advanceTimersByTime(LATE_MS))
    expect(screen.getByRole('heading', { name: 'Estadísticas' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a screen preloaded on intent renders in the same commit, with no fallback in between', async () => {
    markScreenShown()
    const m = deferredModule()
    const Stats = lazyScreen(m.load, (x) => x.Stats)
    const intent = preloadOnIntent(Stats)
    intent.onPointerDown()
    await act(async () => m.settle())
    render(
      <Lazy>
        <Stats />
      </Lazy>,
    )
    // No await, no timer: it is on the page in the render's own commit.
    expect(screen.getByRole('heading', { name: 'Estadísticas' })).toBeTruthy()
    expect(m.load).toHaveBeenCalledTimes(1)
  })

  it('loading one screen of a group loads them all, once', async () => {
    markScreenShown()
    const m = deferredModule()
    const group = lazyGroup(m.load)
    const Stats = group((x) => x.Stats)
    const Rules = group((x) => x.Rules)
    void Stats.preload()
    void Rules.preload()
    await act(async () => m.settle())
    render(
      <Lazy>
        <Rules />
      </Lazy>,
    )
    expect(screen.getByRole('heading', { name: 'Reglamento' })).toBeTruthy()
    expect(m.load).toHaveBeenCalledTimes(1)
  })

  it('before any screen has shown, the wait is the boot screen index.html paints, not an empty page', async () => {
    const m = deferredModule()
    const Stats = lazyScreen(m.load, (x) => x.Stats)
    render(
      <Lazy>
        <Stats />
      </Lazy>,
    )
    expect(screen.getByRole('status').textContent).toBe('Cargando…')
    expect(screen.getByRole('img', { name: 'Polo' }).getAttribute('src')).toMatch(
      /^\/brand\/boot-mark\.png\?v=[0-9a-f]{10}$/,
    )
    await act(async () => m.settle())
    expect(screen.getByRole('heading', { name: 'Estadísticas' })).toBeTruthy()
  })

  it('a load that failed is tried again by the next intent', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ Stats: () => <h1>Estadísticas</h1> })
    const Stats = lazyScreen(load, (x: { Stats: () => React.JSX.Element }) => x.Stats)
    await expect(Stats.preload()).rejects.toThrow('offline')
    await Stats.preload()
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('the idle prefetch (MOT-22)', () => {
  it('runs only where the service worker serves the page: elsewhere a deploy could have taken the chunk away', () => {
    const screens = [{ preload: vi.fn(() => Promise.resolve()) }]
    const idle = vi.fn((run: () => void) => {
      run()
      return 1
    })
    const page = (controller: object | null) =>
      ({
        navigator: { serviceWorker: { controller } },
        requestIdleCallback: idle,
        cancelIdleCallback: vi.fn(),
      }) as unknown as Window
    prefetchScreens(screens, page(null))
    expect(screens[0]!.preload).not.toHaveBeenCalled()
    prefetchScreens(screens, page({}))
    expect(screens[0]!.preload).toHaveBeenCalledTimes(1)
  })

  it('one screen per idle period, with no deadline: a chunk’s code never runs under a tap (UX-02)', async () => {
    const screens = [{ preload: vi.fn(() => Promise.resolve()) }, { preload: vi.fn(() => Promise.resolve()) }]
    const asked: Array<{ run: () => void; options: unknown }> = []
    const page = {
      navigator: { serviceWorker: { controller: {} } },
      requestIdleCallback: (run: () => void, options?: unknown) => asked.push({ run, options }),
      cancelIdleCallback: vi.fn(),
    } as unknown as Window
    prefetchScreens(screens, page)
    expect(asked).toHaveLength(1)
    expect(asked[0]!.options).toBeUndefined()
    asked[0]!.run()
    expect(screens[1]!.preload).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(asked).toHaveLength(2))
    asked[1]!.run()
    expect(screens[1]!.preload).toHaveBeenCalledTimes(1)
  })

  it('says nothing when a chunk can’t load', async () => {
    const failing = { preload: vi.fn(() => Promise.reject(new Error('offline'))) }
    const page = {
      navigator: { serviceWorker: { controller: {} } },
      setTimeout: (run: () => void) => (run(), 1),
      clearTimeout: vi.fn(),
    } as unknown as Window
    prefetchScreens([failing], page)
    await Promise.resolve()
    expect(failing.preload).toHaveBeenCalledTimes(1)
  })
})
