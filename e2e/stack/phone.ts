/**
 * A phone in the stack suite: its own browser context (storage, IndexedDB
 * outbox, auth session) on the app built for the local stack. The helpers act
 * as a player does (tap a face, type the PIN, step the scores, save) and read
 * the screen the way a screen reader hears it.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test as base, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { BASE_URL, lit, sql } from './env'
import { GROUP_1, PIN, PLAYERS, par, strokeIndex, totals, type HoleEntry } from './field'

/** As the players hold it (the fixture suite's phone). */
export const PHONE = {
  baseURL: BASE_URL,
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  // What is under test is the network path. The service worker only caches
  // the shell, and it would sit between the page and `context.route`.
  serviceWorkers: 'block' as const,
}

/** The suite's own marks on a page's window. */
type Marked = Window & { __e2eSavedAt?: number; __e2eShownAt?: Record<string, number | null>; __e2eObserver?: MutationObserver }

export interface Phone {
  name: string
  context: BrowserContext
  page: Page
  /** Uncaught errors on the phone's pages. */
  errors: string[]
  /** Requests for a new anonymous user (POST /auth/v1/signup) since the phone opened the link. */
  signUps: number
  /** The link every page of this phone is on, when not the runner's own (REL-11). */
  link?: Link
}

/** Every tap on «Guardar…» gets a timestamp on the phone's own clock (ms since the epoch). */
function markSaves(labels: string[]) {
  document.addEventListener(
    'click',
    (e) => {
      const button = (e.target as Element | null)?.closest?.('button')
      if (button && labels.includes((button.textContent ?? '').trim())) (window as Marked).__e2eSavedAt = performance.timeOrigin + performance.now()
    },
    true,
  )
}

/**
 * A link a phone is on (REL-11): the round trip and the bandwidth, half the
 * round trip each way. Chromium's network conditions (DevTools protocol) put
 * all of their latency on the response, so they get half of it and a route
 * holds every request back the other half before it leaves; the live
 * channel's WebSocket frames get the same from `slowSockets`, since DevTools
 * throttling leaves an open WebSocket's frames alone.
 */
export interface Link {
  latency: number
  downloadThroughput: number
  uploadThroughput: number
}

/**
 * A fair 4G signal: 150 ms of round trip, 1.6 Mbps down and 750 kbps up,
 * held for the whole round, joining included: on every request (Chromium's
 * network conditions) and on every frame of the live channel, each way.
 */
export const FOUR_G: Link = { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }

/** The live channel really was on the link: its frames went through `slowSockets` on this phone's page. */
export const slowFrames = (page: Page) => page.evaluate(() => (window as unknown as { __e2eSlowFrames?: number }).__e2eSlowFrames ?? 0)

/** In the page: every WebSocket frame, sent or received, `oneWayMs` late, in order; `__e2eSlowFrames` counts them. */
function slowSockets(oneWayMs: number) {
  const Native = window.WebSocket
  const w = window as unknown as { __e2eSlowFrames: number }
  w.__e2eSlowFrames = 0
  class Slow extends Native {
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      w.__e2eSlowFrames++
      setTimeout(() => {
        if (this.readyState === Native.OPEN) Native.prototype.send.call(this, data)
      }, oneWayMs)
    }
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      if (!listener) return
      if (type !== 'message') return super.addEventListener(type, listener, options)
      const call = typeof listener === 'function' ? listener : (e: Event) => listener.handleEvent(e)
      return super.addEventListener(
        type,
        (e) => {
          w.__e2eSlowFrames++
          setTimeout(() => call.call(this, e), oneWayMs)
        },
        options,
      )
    }
    set onmessage(fn: ((this: WebSocket, e: MessageEvent) => unknown) | null) {
      super.onmessage = fn
        ? (e: MessageEvent) => {
            w.__e2eSlowFrames++
            setTimeout(() => fn.call(this, e), oneWayMs)
          }
        : null
    }
    get onmessage() {
      return super.onmessage
    }
  }
  window.WebSocket = Slow as typeof WebSocket
}

/** Opens a page on the phone (the app again, after it was closed), watching it for uncaught errors. */
export async function openPage(phone: Phone, path: string): Promise<Page> {
  const page = await phone.context.newPage()
  page.on('pageerror', (e) => phone.errors.push(`${phone.name}: ${e.message}`))
  if (phone.link) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...phone.link, latency: phone.link.latency / 2 })
  }
  phone.page = page
  await page.goto(path)
  return page
}

/** A new phone opens the tournament's link, taps `name` and types the PIN; returns once the live board is up. On `link`, from its first request. */
export async function joinAs(browser: Browser, slug: string, name: string, link?: Link): Promise<Phone> {
  const context = await browser.newContext(PHONE)
  await context.addInitScript(markSaves, [t.card.save, t.card.saveLast])
  if (link) {
    const oneWay = link.latency / 2
    await context.addInitScript(slowSockets, oneWay)
    await context.route('**/*', async (route) => {
      await new Promise((r) => setTimeout(r, oneWay))
      await route.continue()
    })
  }
  const phone: Phone = { name, context, page: undefined as unknown as Page, errors: [], signUps: 0, link }
  context.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/auth/v1/signup')) phone.signUps++
  })
  const page = await openPage(phone, `/t/${slug}`)
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByLabel(t.enter.pin).fill(PIN)
  await expectLive(page)
  return phone
}

/**
 * Phones made with `join` are closed after the test, so no live channel from
 * one test keeps running into the next; any uncaught error on them fails it.
 */
export const test = base.extend<{ join: (slug: string, name: string, link?: Link) => Promise<Phone> }>({
  join: async ({ browser }, provide) => {
    const phones: Phone[] = []
    await provide(async (slug, name, link) => {
      const phone = await joinAs(browser, slug, name, link)
      phones.push(phone)
      return phone
    })
    for (const phone of phones) await phone.context.close()
    const errors = phones.flatMap((p) => p.errors)
    if (errors.length) throw new Error(`Uncaught errors on the phones:\n${errors.join('\n')}`)
  },
})
export { expect }

/** The boards came from the server and the live channel is joined: the header says «En vivo». */
export async function expectLive(page: Page) {
  await expect(page.locator('header').getByText(t.sync.live, { exact: true })).toBeVisible({ timeout: 30_000 })
}

/** A tab of the tournament's bar (the Tarjeta's name carries the holes still on the phone). */
export const tab = (page: Page, label: string) => page.getByRole('navigation', { name: t.common.sections }).getByRole('link', { name: new RegExp(`^${label}`) })

/** The Tarjeta's hole, as its heading reads it out. */
export const holeHeading = (page: Page, hole: number) => page.getByRole('heading', { level: 1, name: t.card.holeSpoken(hole, par(hole), strokeIndex(hole)), exact: true })

export async function openCard(page: Page) {
  await tab(page, t.nav.card).click()
  await expect(page.getByRole('heading', { level: 1, name: /^Hoyo \d+, par \d/ })).toBeVisible()
}

/** Per page, each stepper tap the suite made: ms from the click to the new value on screen (Playwright's own time included). */
const taps = new WeakMap<Page, number[]>()
/** The taps `typeHole` made on `page` so far, and forgets them. */
export function takeTaps(page: Page): number[] {
  const made = taps.get(page) ?? []
  taps.delete(page)
  return made
}

/** One stepper, stepped one tap at a time (each tap waits for the screen to change). */
async function setStepper(page: Page, label: string, target: number) {
  const group = page.getByRole('group', { name: label, exact: true })
  for (let tapped = 0; tapped <= 15; tapped++) {
    const now = Number((await group.textContent())?.trim())
    if (now === target) return
    const at = Date.now()
    await page.getByRole('button', { name: `${label}: ${now < target ? t.common.stepUp : t.common.stepDown}`, exact: true }).click()
    await expect(group).not.toHaveText(String(now))
    taps.set(page, [...(taps.get(page) ?? []), Date.now() - at])
  }
  throw new Error(`${label} did not reach ${target}`)
}

/** «Guardar hoyo» ignores taps in a hole's first 700 ms (UX-02: a double tap must not save the next hole). */
const SETTLE_MS = 800

/** Types one hole for the players in `entry`: strokes first, since lowering them caps the putts. */
export async function typeHole(page: Page, hole: number, entry: HoleEntry) {
  await expect(holeHeading(page, hole)).toBeVisible()
  const shownAt = Date.now()
  for (const [name, v] of Object.entries(entry)) {
    await setStepper(page, t.card.strokesOf(name), v.strokes)
    await setStepper(page, t.card.puttsOf(name), v.putts)
  }
  // Human speed on purpose: the product's own guard, not a wait for the network.
  const wait = SETTLE_MS - (Date.now() - shownAt)
  if (wait > 0) await page.waitForTimeout(wait)
}

/** Taps the save button; returns once the phone says the hole is saved (its outbox may be storing it still). */
export async function saveHole(page: Page, hole: number) {
  await page.getByRole('button', { name: hole === 18 ? t.card.saveLast : t.card.save, exact: true }).click()
  // The save bar's note. (On the last hole the card's live region says the same words, to a screen reader only.)
  // A hole the group had played is a correction: its note says so, and where the card went back to (UX-19).
  const notes = [t.card.savedHole(hole), t.card.correctedHole(hole, null), t.card.correctedHole(hole, 99).replace('99', '\\d+')]
  await expect(page.locator('span:not(.sr-only)', { hasText: new RegExp(`^(${notes.join('|')})$`) })).toBeVisible()
}

/** The phone's outbox holds a save of `hole` in IndexedDB, where the app opened again reads it (no signal: nothing sent it). */
export async function expectKeptOnPhone(page: Page, hole: number) {
  const kept = () =>
    page.evaluate(
      (h) =>
        new Promise<number>((resolve) => {
          const open = indexedDB.open('cardi-golf-outbox')
          open.onerror = () => resolve(0)
          open.onsuccess = () => {
            const db = open.result
            if (!db.objectStoreNames.contains('items')) {
              db.close()
              return resolve(0)
            }
            const all = db.transaction('items').objectStore('items').getAll()
            all.onsuccess = () => {
              db.close()
              resolve((all.result as Array<{ kind?: string; payload?: { hole?: number } }>).filter((x) => x.kind === 'hole' && x.payload?.hole === h).length)
            }
            all.onerror = () => {
              db.close()
              resolve(0)
            }
          }
        }),
      hole,
    )
  await expect.poll(kept, { message: `hole ${hole} in the phone's outbox` }).toBeGreaterThan(0)
}

/** When the phone last tapped «Guardar…», on its own clock (ms since the epoch). */
export async function savedAt(page: Page): Promise<number> {
  const at = await page.evaluate(() => (window as Marked).__e2eSavedAt ?? null)
  if (at == null) throw new Error('no tap on «Guardar…» was recorded')
  return at
}

/** The leaderboard, one string per row as a screen reader hears it: «empatado en 1.º, Ana, hoy 3, hoyo 1, 3». */
export function boardRows(page: Page): Promise<string[]> {
  return page.locator('button[class*="leaderRow"]').evaluateAll((rows) => rows.map((r) => r.getAttribute('aria-label') ?? ''))
}

/** A board row as the app labels it (t.live.rowLabel), from the values the test expects. */
export const row = (pos: string, name: string, figure: string, thru: string, today?: string) => t.live.rowLabel(pos, name, figure, today, thru)

/** The rows of `names` after the holes in `card`, without the position (ties move it): «Ana, hoy 34, hoyo F, 34». */
export function boardAfter(card: Map<number, HoleEntry>, thru: number, names: string[] = GROUP_1): string[] {
  const sum = totals(card, names)
  return names.map((name) => row('', name, String(sum[name]), t.round.thru(thru, 18), String(sum[name])))
}

/** The Tarjeta's steppers for group 1 showing `entry`: [label, value] pairs. */
export const cardShows = (entry: HoleEntry): Array<[string, string]> =>
  Object.entries(entry).flatMap(([name, v]) => [
    [t.card.strokesOf(name), String(v.strokes)],
    [t.card.puttsOf(name), String(v.putts)],
  ])

export type Shown = { board: string[] } | { card: Array<[label: string, value: string]> }

/**
 * Arms one watch per key on `page`, each for its `Shown` (board rows by the
 * end of their label, or the values of the Tarjeta's steppers): the first
 * moment the DOM shows all of one is recorded under its key, on the page's
 * own clock. None may show yet: a measurement that starts satisfied measures
 * nothing. Arming again forgets the last watches.
 */
export async function watchEach(page: Page, shown: Record<string, Shown>) {
  const already = await page.evaluate((all) => {
    const w = window as Marked
    const holds = (s: Shown) => {
      if ('board' in s) {
        const labels = Array.from(document.querySelectorAll('button[class*="leaderRow"]'), (b) => b.getAttribute('aria-label') ?? '')
        return s.board.every((want) => labels.some((l) => l === want || l.endsWith(`, ${want}`)))
      }
      return s.card.every(([label, value]) => {
        const group = Array.from(document.querySelectorAll('[role="group"][aria-label]')).find((g) => g.getAttribute('aria-label') === label)
        return !!group && (group.textContent ?? '').trim() === value
      })
    }
    w.__e2eObserver?.disconnect()
    const early = Object.keys(all).filter((k) => holds(all[k]!))
    if (early.length) return early
    const at: Record<string, number | null> = Object.fromEntries(Object.keys(all).map((k) => [k, null]))
    w.__e2eShownAt = at
    const observer = new MutationObserver(() => {
      const now = performance.timeOrigin + performance.now()
      for (const k of Object.keys(all)) if (at[k] == null && holds(all[k]!)) at[k] = now
      if (Object.values(at).every((v) => v != null)) observer.disconnect()
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
    w.__e2eObserver = observer
    return []
  }, shown)
  expect(already, `already on screen before the save: ${JSON.stringify(already.map((k) => shown[k]))}`).toEqual([])
}

/** When each watch armed by `watchEach` saw it all, on the page's clock; fails after `timeout` ms, naming the ones still waiting. */
export async function shownEachAt(page: Page, timeout = 15_000): Promise<Record<string, number>> {
  let at: Record<string, number | null> = {}
  await expect
    .poll(async () => {
      at = await page.evaluate(() => ({ ...((window as Marked).__e2eShownAt ?? {}) }))
      return Object.entries(at).filter(([, v]) => v == null).map(([k]) => k)
    }, { timeout, message: 'the other phone never showed these' })
    .toEqual([])
  return at as Record<string, number>
}

/** One watch: `watchEach` with a single key. */
export const watchFor = (page: Page, shown: Shown) => watchEach(page, { it: shown })

/** When the watch armed by `watchFor` saw it all, on the page's clock; fails after `timeout` ms. */
export async function shownAt(page: Page, timeout = 15_000): Promise<number> {
  return (await shownEachAt(page, timeout)).it!
}

/** The session this phone keeps (supabase-js's storage key in src/lib/supabase.ts). */
export function storedSession(page: Page): Promise<{ user?: { id?: string }; expires_at?: number } | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('cardi-golf-auth')
    return raw ? (JSON.parse(raw) as { user?: { id?: string }; expires_at?: number }) : null
  })
}

export interface ServerScore {
  hole: number
  name: string
  strokes: number | null
  putts: number | null
  by: string | null
  disputed: boolean
}

/** What the server holds for a tournament's scores, hole by hole in the field's order. */
export function serverScores(slug: string): ServerScore[] {
  return sql<ServerScore[]>(`
    select coalesce(json_agg(json_build_object('hole', s.hole, 'name', p.display_name, 'strokes', s.strokes, 'putts', s.putts,
      'by', e.display_name, 'disputed', s.disputed) order by s.hole, p.sort_order), '[]')
    from public.scores s
    join public.players p on p.id = s.player_id
    join public.rounds r on r.id = s.round_id
    join public.tournaments t on t.id = r.tournament_id
    left join public.players e on e.id = s.entered_by
    where t.slug = ${lit(slug)}`)
}

/** The rows `card` should be on the server, every one entered by `by`'s phone. */
export function expectedScores(card: Map<number, HoleEntry>, by: string): ServerScore[] {
  return expectedScoresOf([{ card, names: GROUP_1, by }])
}

/**
 * The rows the server should hold for several groups' cards, each entered by
 * its own phone, in `serverScores`' order: by hole, then by the field's order.
 */
export function expectedScoresOf(cards: Array<{ card: Map<number, HoleEntry>; names: string[]; by: string }>): ServerScore[] {
  const order = (name: string) => PLAYERS.findIndex((p) => p.name === name)
  return cards
    .flatMap(({ card, names, by }) =>
      [...card.entries()].flatMap(([hole, entry]) => names.filter((name) => entry[name]).map((name) => ({ hole, name, strokes: entry[name]!.strokes, putts: entry[name]!.putts, by, disputed: false }))),
    )
    .sort((a, b) => a.hole - b.hole || order(a.name) - order(b.name))
}

/** Nearest-rank percentile. */
export function percentile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)]!
}

/**
 * Keeps a measurement next to the run's results (test-results-stack/metrics),
 * as JSON and as the Markdown the workflow puts on the run's summary page.
 */
export function keepMetrics(outputDir: string, name: string, data: unknown, markdown: string) {
  const dir = join(outputDir, 'metrics')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`)
  writeFileSync(join(dir, `${name}.md`), `${markdown}\n`)
}
