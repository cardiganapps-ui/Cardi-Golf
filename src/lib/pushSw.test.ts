/**
 * QA-16: public/push-sw.js (the notice on the lock screen, the count on the icon, the tap that opens the
 * notice's page) had no test. It runs in the service worker's own scope; here, in a stand-in for it.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const SOURCE = readFileSync(new URL('../../public/push-sw.js', import.meta.url), 'utf8')
const ORIGIN = 'https://golf.cardigan.mx'
type Handler = (event: unknown) => void

/** The worker's scope: what the handlers call, recorded. */
function worker(opts: { badges?: boolean; windows?: string[] } = {}) {
  const handlers: Record<string, Handler> = {}
  const shown: Array<[string, Record<string, unknown>]> = []
  const badge = { set: vi.fn(async () => undefined), clear: vi.fn(async () => undefined) }
  const opened: string[] = []
  const focused: string[] = []
  const navigated: string[] = []
  const self = {
    addEventListener: (type: string, fn: Handler) => void (handlers[type] = fn),
    registration: { showNotification: vi.fn(async (title: string, options: Record<string, unknown>) => void shown.push([title, options])) },
    navigator: opts.badges === false ? {} : { setAppBadge: badge.set, clearAppBadge: badge.clear },
    location: { origin: ORIGIN },
    clients: {
      matchAll: vi.fn(async () =>
        (opts.windows ?? []).map((url) => ({
          url,
          focus: async () => {
            focused.push(url)
            return { navigate: async (to: string) => void navigated.push(to) }
          },
        })),
      ),
      openWindow: vi.fn(async (url: string) => void opened.push(url)),
    },
  }
  new Function('self', SOURCE)(self)
  return { handlers, shown, badge, opened, focused, navigated }
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
    expect(w.shown).toEqual([['Solicitud de amistad', { body: 'Ana quiere ser tu amiga en Polo.', tag: 'n1', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: '/avisos' } }]])
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
})

describe('a tap on a notice (QA-16)', () => {
  it('brings the open app to the front on the notice’s page; with none open, opens one there', async () => {
    const open = worker({ windows: [`${ORIGIN}/t/nachos-bachelor`] })
    const t1 = tap('/avisos')
    open.handlers.notificationclick!(t1.event)
    await t1.settled()
    expect(t1.close).toHaveBeenCalled()
    expect(open.focused).toEqual([`${ORIGIN}/t/nachos-bachelor`])
    expect(open.navigated).toEqual([`${ORIGIN}/avisos`])
    expect(open.opened).toEqual([])

    const none = worker()
    const t2 = tap('/p/ana')
    none.handlers.notificationclick!(t2.event)
    await t2.settled()
    expect(none.opened).toEqual([`${ORIGIN}/p/ana`])
  })

  it('a window of another site is not the app', async () => {
    const w = worker({ windows: ['https://example.com/'] })
    const t = tap('/avisos')
    w.handlers.notificationclick!(t.event)
    await t.settled()
    expect(w.focused).toEqual([])
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
