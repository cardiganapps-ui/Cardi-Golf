/**
 * QA-16: public/push-sw.js (the notice on the lock screen, the count on the icon, the tap that opens the
 * notice's page) had no test. It runs in the service worker's own scope; here, in a stand-in for it.
 *
 * PWA-12: a tap used to `focus()` the open app and then `navigate()` it, a full reload that dropped a half
 * entered hole, and was refused for a page this worker didn't control. Now the open app is asked to go there
 * with its own router, and the reload is only for a page that doesn't answer. The badge was the opaque tile.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const SOURCE = readFileSync(new URL('../../public/push-sw.js', import.meta.url), 'utf8')
const ORIGIN = 'https://golf.cardigan.mx'
type Handler = (event: unknown) => void

/** A window of the app, as `clients.matchAll` lists it, and how it behaves. */
interface Win {
  url: string
  focused?: boolean
  visibilityState?: 'visible' | 'hidden'
  /** It runs this build's app, which says it moved; an older build (or a page still loading) never answers. */
  answers?: boolean
  /** `navigate()` is refused (a page this worker doesn't control). */
  uncontrolled?: boolean
}

/** A message channel whose ports talk in a microtask, as a browser's do. */
class Channel {
  port1: { onmessage: ((e: { data: unknown }) => void) | null; close: () => void } = { onmessage: null, close: () => undefined }
  port2 = { postMessage: (data: unknown) => queueMicrotask(() => this.port1.onmessage?.({ data })) }
}

/** The worker's scope: what the handlers call, recorded. Timers are the test's to fire. */
function worker(opts: { badges?: boolean; windows?: Win[] } = {}) {
  const handlers: Record<string, Handler> = {}
  const shown: Array<[string, Record<string, unknown>]> = []
  const badge = { set: vi.fn(async () => undefined), clear: vi.fn(async () => undefined) }
  const opened: string[] = []
  const focused: string[] = []
  const navigated: string[] = []
  const asked: Array<{ to: string; message: unknown }> = []
  const timers: Array<() => void> = []
  const clients = (opts.windows ?? []).map((w) => {
    const c = {
      url: w.url,
      focused: !!w.focused,
      visibilityState: w.visibilityState ?? 'hidden',
      focus: async () => {
        focused.push(w.url)
        return c
      },
      navigate: async (to: string) => {
        if (w.uncontrolled) throw new TypeError('This service worker is not the client’s active service worker.')
        navigated.push(to)
        return c
      },
      postMessage: (message: unknown, ports: Array<{ postMessage: (d: unknown) => void }>) => {
        asked.push({ to: w.url, message })
        if (w.answers) ports[0]!.postMessage({ ok: true })
      },
    }
    return c
  })
  const self = {
    addEventListener: (type: string, fn: Handler) => void (handlers[type] = fn),
    registration: { showNotification: vi.fn(async (title: string, options: Record<string, unknown>) => void shown.push([title, options])) },
    navigator: opts.badges === false ? {} : { setAppBadge: badge.set, clearAppBadge: badge.clear },
    location: { origin: ORIGIN },
    clients: {
      matchAll: vi.fn(async () => clients),
      openWindow: vi.fn(async (url: string) => void opened.push(url)),
    },
  }
  const setTimeout = (fn: () => void) => timers.push(fn)
  new Function('self', 'MessageChannel', 'setTimeout', 'clearTimeout', SOURCE)(self, Channel, setTimeout, () => undefined)
  return { handlers, shown, badge, opened, focused, navigated, asked, timers, self }
}

/** A push event carrying `body` as the browser hands it over (JSON, or text that is not), and what it waits on. */
function push(body?: string) {
  let wait: Promise<unknown> = Promise.resolve()
  const event = {
    data: body === undefined ? null : { json: () => JSON.parse(body), text: () => body },
    waitUntil: (p: Promise<unknown>) => void (wait = p),
  }
  return { event, settled: () => wait }
}
/** A tap on a notice whose page is `url`. */
function tap(url?: unknown) {
  let wait: Promise<unknown> = Promise.resolve()
  const close = vi.fn()
  const event = { notification: { close, data: url === undefined ? undefined : { url } }, waitUntil: (p: Promise<unknown>) => void (wait = p) }
  return { event, close, settled: () => wait }
}

describe('a notice arriving (QA-16)', () => {
  it('shows its title, text and page, and puts the unread count on the icon', async () => {
    const w = worker()
    const p = push(JSON.stringify({ title: 'Solicitud de amistad', body: 'Ana quiere ser tu amiga en Polo.', url: '/avisos', tag: 'n1', badge: 3 }))
    w.handlers.push!(p.event)
    await p.settled()
    expect(w.shown).toEqual([['Solicitud de amistad', { body: 'Ana quiere ser tu amiga en Polo.', tag: 'n1', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', data: { url: '/avisos' } }]])
    expect(w.badge.set).toHaveBeenCalledWith(3)
  })

  it('nothing left unread clears the count; a phone without counts on icons still shows the notice', async () => {
    const w = worker()
    const p = push(JSON.stringify({ title: 'Resultados', body: 'Ya están', badge: 0 }))
    w.handlers.push!(p.event)
    await p.settled()
    expect(w.badge.clear).toHaveBeenCalledTimes(1)
    const plain = worker({ badges: false })
    const q = push(JSON.stringify({ title: 'Resultados', badge: 2 }))
    plain.handlers.push!(q.event)
    await q.settled()
    expect(plain.shown.map(([title]) => title)).toEqual(['Resultados'])
  })

  it('a PIN phone’s notice carries no count: the icon keeps what it shows (PWA-10)', async () => {
    const w = worker()
    const p = push(JSON.stringify({ title: 'Nacho’s Bachelor', body: 'Empezó el día 1.', url: '/t/nachos-bachelor/tarjeta', tag: 'n2' }))
    w.handlers.push!(p.event)
    await p.settled()
    expect(w.shown.map(([title, o]) => [title, o.body, (o.data as { url: string }).url])).toEqual([['Nacho’s Bachelor', 'Empezó el día 1.', '/t/nachos-bachelor/tarjeta']])
    expect(w.badge.set).not.toHaveBeenCalled()
    expect(w.badge.clear).not.toHaveBeenCalled()
  })

  it('a payload that is not JSON shows as text, and an empty one with the app’s name', async () => {
    const w = worker()
    const text = push('hola')
    w.handlers.push!(text.event)
    await text.settled()
    const empty = push()
    w.handlers.push!(empty.event)
    await empty.settled()
    expect(w.shown.map(([title, o]) => [title, o.body, (o.data as { url: string }).url])).toEqual([
      ['Polo', 'hola', '/'],
      ['Polo', '', '/'],
    ])
    expect(w.badge.set).not.toHaveBeenCalled()
  })

  it('the badge is its own image, not the opaque app icon Android drew as a white square (PWA-12)', async () => {
    const w = worker()
    const p = push(JSON.stringify({ title: 'Polo' }))
    w.handlers.push!(p.event)
    await p.settled()
    const [, options] = w.shown[0]!
    expect(options.badge).toBe('/icons/badge-96.png')
    expect(options.badge).not.toBe(options.icon)
    // The image itself: a 96 × 96 PNG with an alpha channel (npm run icons draws the P on transparent).
    const png = readFileSync(new URL('../../public/icons/badge-96.png', import.meta.url))
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([96, 96, 6])
  })
})

describe('a tap on a notice (QA-16, PWA-12)', () => {
  it('asks the open app to go there with its own router: no reload, no new window', async () => {
    const w = worker({ windows: [{ url: `${ORIGIN}/t/nachos-bachelor/tarjeta`, focused: true, visibilityState: 'visible', answers: true }] })
    const t1 = tap('/t/nachos-bachelor/tarjeta?vista=tarjeta')
    w.handlers.notificationclick!(t1.event)
    await t1.settled()
    expect(t1.close).toHaveBeenCalled()
    expect(w.focused).toEqual([`${ORIGIN}/t/nachos-bachelor/tarjeta`])
    expect(w.asked).toEqual([{ to: `${ORIGIN}/t/nachos-bachelor/tarjeta`, message: { type: 'navigate', url: `${ORIGIN}/t/nachos-bachelor/tarjeta?vista=tarjeta` } }])
    expect(w.navigated).toEqual([])
    expect(w.opened).toEqual([])
  })

  it('an app that doesn’t answer (an older build) is moved by the worker, the old way', async () => {
    const w = worker({ windows: [{ url: `${ORIGIN}/t/nachos-bachelor`, focused: true }] })
    const t1 = tap('/avisos')
    w.handlers.notificationclick!(t1.event)
    await vi.waitFor(() => expect(w.timers).toHaveLength(1))
    expect(w.navigated).toEqual([])
    w.timers[0]!()
    await t1.settled()
    expect(w.asked.map((a) => a.message)).toEqual([{ type: 'navigate', url: `${ORIGIN}/avisos` }])
    expect(w.navigated).toEqual([`${ORIGIN}/avisos`])
    expect(w.opened).toEqual([])
  })

  it('a page this worker doesn’t control, which doesn’t answer: a window on the notice’s page', async () => {
    const w = worker({ windows: [{ url: `${ORIGIN}/`, uncontrolled: true }] })
    const t1 = tap('/p/ana')
    w.handlers.notificationclick!(t1.event)
    await vi.waitFor(() => expect(w.timers).toHaveLength(1))
    w.timers[0]!()
    await t1.settled()
    expect(w.navigated).toEqual([])
    expect(w.opened).toEqual([`${ORIGIN}/p/ana`])
  })

  it('of several windows, the one in front, else one on screen', async () => {
    const front = worker({ windows: [{ url: `${ORIGIN}/a` }, { url: `${ORIGIN}/b`, visibilityState: 'visible', answers: true }, { url: `${ORIGIN}/c`, focused: true, answers: true }] })
    const t1 = tap('/avisos')
    front.handlers.notificationclick!(t1.event)
    await t1.settled()
    expect(front.asked.map((a) => a.to)).toEqual([`${ORIGIN}/c`])
    const visible = worker({ windows: [{ url: `${ORIGIN}/a` }, { url: `${ORIGIN}/b`, visibilityState: 'visible', answers: true }] })
    const t2 = tap('/avisos')
    visible.handlers.notificationclick!(t2.event)
    await t2.settled()
    expect(visible.asked.map((a) => a.to)).toEqual([`${ORIGIN}/b`])
  })

  it('with none open, opens one there', async () => {
    const none = worker()
    const t2 = tap('/p/ana')
    none.handlers.notificationclick!(t2.event)
    await t2.settled()
    expect(none.opened).toEqual([`${ORIGIN}/p/ana`])
    expect(none.asked).toEqual([])
  })

  it('a window of another site is not the app', async () => {
    const w = worker({ windows: [{ url: 'https://example.com/', focused: true, answers: true }] })
    const t = tap('/avisos')
    w.handlers.notificationclick!(t.event)
    await t.settled()
    expect(w.focused).toEqual([])
    expect(w.asked).toEqual([])
    expect(w.opened).toEqual([`${ORIGIN}/avisos`])
  })

  it('a link to another site, one it can’t read, or none opens the app’s home, never another site', async () => {
    for (const url of ['https://example.com/phish', '//example.com/x', 'http://[', undefined]) {
      const w = worker()
      const t = tap(url)
      w.handlers.notificationclick!(t.event)
      await t.settled()
      expect(w.opened, String(url)).toEqual([`${ORIGIN}/`])
    }
  })
})
