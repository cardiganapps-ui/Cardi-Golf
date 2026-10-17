/**
 * Screens loaded when they are first needed (PERF-02). The entry used to carry every screen, so the landing
 * page, a player's board and the organizer's login all paid for each other: 1.5 MB of JS before the first
 * screen. A route's screens now come in a chunk of their own, as a group where they are used together (the
 * tournament's gate, header, En vivo and Tarjeta are one chunk, so a player's first open is two requests in a
 * row, never three).
 *
 * A screen whose chunk is in renders at once, with no Suspense in between: a tab or link preloaded on intent
 * (`preload`, `prefetchScreens`) swaps in the tap's own frame (MOT-22). React.lazy alone suspends for a
 * microtask even then, and the boundary drew its fallback for a frame.
 */
import { lazy, useState, type ComponentProps, type ComponentType } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any screen, whatever its props
type AnyScreen = ComponentType<any>

export interface Preloadable {
  /** Starts loading the screen's chunk (again, after a failure); the promise settles with it. */
  preload: () => Promise<unknown>
}

export type LazyScreen<C extends AnyScreen> = ComponentType<ComponentProps<C>> & Preloadable

/**
 * One chunk, loaded once, and the screens it holds: `group((m) => m.Screen)` is a component for each. Loading
 * any of them loads them all, and from then on each renders without suspending.
 */
export function lazyGroup<M>(load: () => Promise<M>) {
  let loaded: M | null = null
  let pending: Promise<M> | null = null
  const preload = (): Promise<M> =>
    (pending ??= load().then(
      (m) => (loaded = m),
      (error: unknown) => {
        // Asked again on the next render or intent: a lost signal is not the end of the screen.
        pending = null
        throw error
      },
    ))
  return function screen<C extends AnyScreen>(pick: (m: M) => C): LazyScreen<C> {
    const Suspending = lazy(async () => ({ default: pick(await preload()) }))
    function Screen(props: ComponentProps<C>) {
      // Chosen once per mount: switching from the suspending wrapper to the loaded screen would remount it.
      const [Shown] = useState<AnyScreen>(() => (loaded ? pick(loaded) : Suspending))
      return <Shown {...props} />
    }
    Screen.displayName = 'LazyScreen'
    return Object.assign(Screen, { preload })
  }
}

/** A screen alone in its chunk. */
export function lazyScreen<M, C extends AnyScreen>(load: () => Promise<M>, pick: (m: M) => C): LazyScreen<C> {
  return lazyGroup(load)(pick)
}

/**
 * Loads these screens' chunks while the page is idle, one per idle period, without a word if one fails. A chunk's
 * code runs as it arrives, so they never come all at once, and never on a deadline: with `requestIdleCallback`'s
 * timeout they ran under a tap, and the Tarjeta's double-tap guard measured the delay as time since the hole
 * changed (flows.spec.ts, UX-02). Only on a page the service worker serves: there each chunk comes from the
 * precache, and a deploy can't have taken it away (REL-13), so an idle prefetch never turns into a reload of the
 * new build the player didn't ask for.
 */
export function prefetchScreens(screens: Preloadable[], win: Window = window): () => void {
  if (!win.navigator.serviceWorker?.controller) return () => undefined
  const idle = typeof win.requestIdleCallback === 'function'
  let id = 0
  let stopped = false
  const next = (i: number) => {
    if (stopped || i >= screens.length) return
    const run = () =>
      void screens[i]!.preload().then(
        () => next(i + 1),
        () => next(i + 1),
      )
    id = idle ? win.requestIdleCallback(run) : win.setTimeout(run, 1500)
  }
  next(0)
  return () => {
    stopped = true
    if (idle) win.cancelIdleCallback(id)
    else win.clearTimeout(id)
  }
}

/**
 * A link's props that start loading the screen it opens on the first sign of intent (MOT-22): the finger
 * touching it, the pointer over it, focus on it. A tap's own load then starts some 100 ms before its click.
 */
export function preloadOnIntent(screen: Preloadable | undefined) {
  const go = () => void screen?.preload().catch(() => undefined)
  return { onPointerDown: go, onMouseEnter: go, onFocus: go }
}
