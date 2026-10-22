// @vitest-environment happy-dom
/**
 * PWA-14: the installed app's shortcuts («Mi tarjeta», «En vivo») open the last tournament this phone
 * opened, and a launch while the app is open (`launch_handler: focus-existing`) goes where it says in place,
 * never a second window or a reload that would cost a hole being typed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLastTournament } from '../data/session'
import { continueTarget, launchPath, launchTarget } from './launch'

function standalone(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q === '(display-mode: standalone)',
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}
const here = (path = '/t/otro') => {
  const url = new URL(path, window.location.origin)
  return { origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash }
}
const at = (path: string) => new URL(path, window.location.origin).href

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  standalone(false)
})
afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as { launchQueue?: unknown }).launchQueue
})

describe('a shortcut opens the last tournament this phone opened (PWA-14)', () => {
  it('«Mi tarjeta» on its Tarjeta, «En vivo» on its own page', () => {
    setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho', at: Date.now() })
    expect(continueTarget('tarjeta')).toBe('/t/nachos-bachelor/tarjeta')
    expect(continueTarget('')).toBe('/t/nachos-bachelor')
  })

  it('however long ago: the person asked for it (a launch from Home waits for four days)', () => {
    setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho', at: Date.now() - 30 * 24 * 60 * 60_000 })
    expect(continueTarget('tarjeta')).toBe('/t/nachos-bachelor/tarjeta')
    setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho' })
    expect(continueTarget('')).toBe('/t/nachos-bachelor')
  })

  it('with none on the phone, Home', () => {
    expect(continueTarget('tarjeta')).toBe('/')
    expect(continueTarget('')).toBe('/')
  })

  it('it is the launch: Home, reached afterwards, stays Home', () => {
    standalone(true)
    setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho', at: Date.now() })
    continueTarget('tarjeta')
    expect(launchTarget('')).toBeNull()
  })
})

describe('a launch into the open app goes where it says (PWA-14)', () => {
  beforeEach(() => setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho', at: Date.now() }))

  it('a shortcut: the last tournament, on its tab', () => {
    expect(launchPath(at('/continuar/tarjeta'), here())).toBe('/t/nachos-bachelor/tarjeta')
    expect(launchPath(at('/continuar'), here())).toBe('/t/nachos-bachelor')
    expect(launchPath(at('/continuar/'), here())).toBe('/t/nachos-bachelor')
  })

  it('a page of the app: that page, its query and its fragment', () => {
    expect(launchPath(at('/t/otro/juegos?x=1#y'), here())).toBe('/t/otro/juegos?x=1#y')
  })

  it('nowhere for the page already on screen, another site, no address or a broken one', () => {
    expect(launchPath(at('/continuar/tarjeta'), here('/t/nachos-bachelor/tarjeta'))).toBeNull()
    expect(launchPath(at('/t/otro'), here('/t/otro'))).toBeNull()
    expect(launchPath('https://example.com/t/otro', here())).toBeNull()
    expect(launchPath(undefined, here())).toBeNull()
    expect(launchPath('no es una dirección', here())).toBeNull()
  })

  it('the launch that opened the page is its own, even once the app has moved on from it; any later one goes', async () => {
    // Opened at its start URL, the app went straight on to the tournament (launchTarget) before the queue
    // handed it the launch: going back to that URL would have bounced the first launch onto Home.
    window.history.replaceState(null, '', '/?t=nachos-bachelor')
    vi.resetModules()
    const { listenForLaunches } = await import('./launch')
    window.history.replaceState(null, '', '/t/nachos-bachelor')
    const consumers: Array<(p: { targetURL?: string }) => void> = []
    ;(globalThis as { launchQueue?: unknown }).launchQueue = {
      setConsumer: (c: (p: { targetURL?: string }) => void) => consumers.push(c),
    }
    const go = vi.fn()
    listenForLaunches(go)
    consumers[0]!({ targetURL: at('/?t=nachos-bachelor') })
    expect(go).not.toHaveBeenCalled()
    // A shortcut later, and later the same address again: both go.
    consumers[0]!({ targetURL: at('/continuar/tarjeta') })
    expect(go).toHaveBeenLastCalledWith('/t/nachos-bachelor/tarjeta')
    consumers[0]!({ targetURL: at('/?t=nachos-bachelor') })
    expect(go).toHaveBeenLastCalledWith('/?t=nachos-bachelor')
    window.history.replaceState(null, '', '/')
  })

  it('a browser with no launch queue (Safari, Firefox): nothing to listen to', async () => {
    const { listenForLaunches } = await import('./launch')
    expect(() => listenForLaunches(() => undefined)).not.toThrow()
  })
})
