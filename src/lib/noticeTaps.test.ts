/**
 * PWA-12: a tap on a notice while the app is open goes through the app's router (src/lib/noticeTaps.ts), so
 * nothing reloads over a half-entered hole. The worker's side is src/lib/pushSw.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inAppPath, listenForNoticeTaps } from './noticeTaps'

const ORIGIN = 'https://golf.cardigan.mx'

afterEach(() => vi.unstubAllGlobals())

/** The page's service worker container, and a message from the worker with a port to answer on. */
function page(at = '/t/nachos-bachelor') {
  const sw = new EventTarget()
  const u = new URL(at, ORIGIN)
  vi.stubGlobal('navigator', { serviceWorker: sw })
  vi.stubGlobal('window', { location: { origin: ORIGIN, pathname: u.pathname, search: u.search, hash: u.hash } })
  const send = (data: unknown) => {
    const answers: unknown[] = []
    sw.dispatchEvent(
      Object.assign(new Event('message'), { data, ports: [{ postMessage: (x: unknown) => answers.push(x) }] }),
    )
    return answers
  }
  return { sw, send }
}

describe('a tap on a notice, in the open app (PWA-12)', () => {
  it('goes to the notice’s page with the router, and says so', () => {
    const { send } = page()
    const go = vi.fn()
    listenForNoticeTaps(go)
    expect(send({ type: 'navigate', url: `${ORIGIN}/t/nachos-bachelor/tarjeta?hoyo=7` })).toEqual([{ ok: true }])
    expect(go).toHaveBeenCalledWith('/t/nachos-bachelor/tarjeta?hoyo=7')
  })

  it('already there: stays, and says it is', () => {
    const { send } = page('/t/nachos-bachelor/tarjeta?hoyo=7')
    const go = vi.fn()
    listenForNoticeTaps(go)
    expect(send({ type: 'navigate', url: `${ORIGIN}/t/nachos-bachelor/tarjeta?hoyo=7` })).toEqual([{ ok: true }])
    expect(go).not.toHaveBeenCalled()
  })

  it('another site, or no link: never followed, and the worker hears it was not', () => {
    const { send } = page()
    const go = vi.fn()
    listenForNoticeTaps(go)
    expect(send({ type: 'navigate', url: 'https://example.com/phish' })).toEqual([{ ok: false }])
    expect(send({ type: 'navigate', url: 42 })).toEqual([{ ok: false }])
    expect(go).not.toHaveBeenCalled()
  })

  it('another message is not a tap: no answer, no move; and the listener can be taken off', () => {
    const { send } = page()
    const go = vi.fn()
    const off = listenForNoticeTaps(go)
    expect(send({ type: 'SKIP_WAITING' })).toEqual([])
    expect(send(null)).toEqual([])
    off()
    expect(send({ type: 'navigate', url: `${ORIGIN}/avisos` })).toEqual([])
    expect(go).not.toHaveBeenCalled()
  })

  it('a browser without service workers listens to nothing', () => {
    vi.stubGlobal('navigator', {})
    expect(() => listenForNoticeTaps(vi.fn())()).not.toThrow()
  })

  it('reads a path of this app only', () => {
    expect(inAppPath('/avisos', ORIGIN)).toBe('/avisos')
    expect(inAppPath(`${ORIGIN}/t/x?vista=tarjeta#a`, ORIGIN)).toBe('/t/x?vista=tarjeta#a')
    expect(inAppPath('//example.com/x', ORIGIN)).toBeNull()
    expect(inAppPath('http://[', ORIGIN)).toBeNull()
    expect(inAppPath(undefined, ORIGIN)).toBeNull()
  })
})
