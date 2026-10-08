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
import { GROUP_1, PIN, par, strokeIndex, totals, type HoleEntry } from './field'

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
type Marked = Window & { __e2eSavedAt?: number; __e2eShownAt?: number | null; __e2eObserver?: MutationObserver }

export interface Phone {
  name: string
  context: BrowserContext
  page: Page
  /** Uncaught errors on the phone's pages. */
  errors: string[]
  /** Requests for a new anonymous user (POST /auth/v1/signup) since the phone opened the link. */
  signUps: number
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

/** Opens a page on the phone (the app again, after it was closed), watching it for uncaught errors. */
export async function openPage(phone: Phone, path: string): Promise<Page> {
  const page = await phone.context.newPage()
  page.on('pageerror', (e) => phone.errors.push(`${phone.name}: ${e.message}`))
  phone.page = page
  await page.goto(path)
  return page
}

/** A new phone opens the tournament's link, taps `name` and types the PIN; returns once the live board is up. */
export async function joinAs(browser: Browser, slug: string, name: string): Promise<Phone> {
  const context = await browser.newContext(PHONE)
  await context.addInitScript(markSaves, [t.card.save, t.card.saveLast])
  const phone: Phone = { name, context, page: undefined as unknown as Page, errors: [], signUps: 0 }
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
export const test = base.extend<{ join: (slug: string, name: string) => Promise<Phone> }>({
  join: async ({ browser }, provide) => {
    const phones: Phone[] = []
    await provide(async (slug, name) => {
      const phone = await joinAs(browser, slug, name)
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

/** One stepper, stepped one tap at a time (each tap waits for the screen to change). */
async function setStepper(page: Page, label: string, target: number) {
  const group = page.getByRole('group', { name: label, exact: true })
  for (let taps = 0; taps <= 15; taps++) {
    const now = Number((await group.textContent())?.trim())
    if (now === target) return
    await page.getByRole('button', { name: `${label}: ${now < target ? t.common.stepUp : t.common.stepDown}`, exact: true }).click()
    await expect(group).not.toHaveText(String(now))
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

/** Taps the save button; returns once the phone says the hole is saved (on the phone: the outbox has it). */
export async function saveHole(page: Page, hole: number) {
  await page.getByRole('button', { name: hole === 18 ? t.card.saveLast : t.card.save, exact: true }).click()
  // The save bar's note. (On the last hole the card's live region says the same words, to a screen reader only.)
  await expect(page.locator('span:not(.sr-only)', { hasText: new RegExp(`^${t.card.savedHole(hole)}$`) })).toBeVisible()
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

/** Group 1's rows after the holes in `card`, without the position (ties move it): «Ana, hoy 34, hoyo F, 34». */
export function boardAfter(card: Map<number, HoleEntry>, thru: number): string[] {
  const sum = totals(card)
  return GROUP_1.map((name) => row('', name, String(sum[name]), t.round.thru(thru, 18), String(sum[name])))
}

/** The Tarjeta's steppers for group 1 showing `entry`: [label, value] pairs. */
export const cardShows = (entry: HoleEntry): Array<[string, string]> =>
  Object.entries(entry).flatMap(([name, v]) => [
    [t.card.strokesOf(name), String(v.strokes)],
    [t.card.puttsOf(name), String(v.putts)],
  ])

export type Shown = { board: string[] } | { card: Array<[label: string, value: string]> }

/**
 * Arms a watch on `page` for `shown` (board rows by the end of their label,
 * or the values of the Tarjeta's steppers): the first moment the DOM shows
 * all of it is recorded on the page's own clock. It must not show yet: a
 * measurement that starts satisfied measures nothing.
 */
export async function watchFor(page: Page, shown: Shown) {
  const already = await page.evaluate((s) => {
    const w = window as Marked
    const holds = () => {
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
    w.__e2eShownAt = null
    if (holds()) return true
    const observer = new MutationObserver(() => {
      if (w.__e2eShownAt == null && holds()) {
        w.__e2eShownAt = performance.timeOrigin + performance.now()
        observer.disconnect()
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
    w.__e2eObserver = observer
    return false
  }, shown)
  expect(already, `already on screen before the save: ${JSON.stringify(shown)}`).toBe(false)
}

/** When the watch armed by `watchFor` saw it all, on the page's clock; fails after `timeout` ms. */
export async function shownAt(page: Page, timeout = 15_000): Promise<number> {
  let at: number | null = null
  await expect
    .poll(async () => (at = await page.evaluate(() => (window as Marked).__e2eShownAt ?? null)), { timeout, message: 'the other phone never showed it' })
    .not.toBeNull()
  return at!
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
  return [...card.keys()]
    .sort((a, b) => a - b)
    .flatMap((hole) => GROUP_1.filter((name) => card.get(hole)![name]).map((name) => ({ hole, name, strokes: card.get(hole)![name]!.strokes, putts: card.get(hole)![name]!.putts, by, disputed: false })))
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
