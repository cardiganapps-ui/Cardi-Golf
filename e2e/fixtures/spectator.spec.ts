/**
 * A link to watch (STRAT-05) on the design fixtures: `/v/_/<fixture>` is the
 * link «Sin dinero», `/v/_dinero/<fixture>` «Con dinero», both through the
 * rules the phone applies to the server's answer (`forSpectators`). Every
 * screen at two phone widths: no uncaught error, nothing wider than the
 * screen, no serious or critical axe violation, no way to a Tarjeta, Más or
 * the Comité, and «Sin dinero» not a peso on screen. The TV at room sizes,
 * Calcutta night included.
 */
import AxeBuilder from '@axe-core/playwright'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

/** [path under /v/, whether the link shows money]. */
const PAGES: Array<[string, boolean]> = [
  ['_/full12-live', false],
  ['_/full12-live/juegos', false],
  ['_/full12-finished', false],
  ['_/full12-finished/juegos', false],
  ['_/friends8/juegos', false],
  ['_/team8/juegos', false],
  ['_/match8/juegos', false],
  ['_/gloria4', false],
  ['_/large60', false],
  ['_dinero/full12-live', true],
  ['_dinero/full12-live/juegos', true],
  ['_dinero/full12-live/dinero', true],
  ['_dinero/full12-finished/dinero', true],
]
const PHONES = [375, 393]
/** [path under /v/, width, height]. */
const ROOMS: Array<[string, number, number]> = [
  ['_/full12-live/tv', 1920, 1080],
  ['_/full12-live/tv', 1280, 720],
  ['_/auction12/tv', 1920, 1080],
  ['_/auction12/tv', 1280, 720],
  ['_/draw12/tv', 1920, 1080],
  ['_/hat12/tv', 1280, 720],
  ['_dinero/auction12/tv', 1920, 1080],
  ['_dinero/auction12/tv', 1280, 720],
]

async function seriousViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)
}
/** Every amount in pesos the page shows. */
const pesos = (page: import('@playwright/test').Page) => page.evaluate(() => document.body.innerText.match(/\$\s?[\d,.]+/g) ?? [])
/** The link's own address: `/v/_/<fixture>` or `/v/_dinero/<fixture>`. */
const baseOf = (path: string) => `/v/${path.split('/').slice(0, 2).join('/')}`

/** Every visible text node on the TV under the room's floor (VIS-05: 3.5vh). */
async function underFloor(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const floor = window.innerHeight * 0.035 - 0.5
    const root = document.querySelector('[class*="_tv_"]')!
    const out: string[] = []
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = (n.textContent ?? '').trim()
      if (!text) continue
      const el = n.parentElement!
      if (el.closest('.sr-only')) continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || r.bottom <= 0 || r.top >= window.innerHeight) continue
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < floor) out.push(`«${text.slice(0, 40)}» ${size.toFixed(1)}px < ${floor.toFixed(1)}px`)
    }
    return out
  })
}

for (const [path, money] of PAGES) {
  for (const width of PHONES) {
    test(`/v/${path} at ${width}px`, async ({ page, pageErrors }) => {
      await page.setViewportSize({ width, height: 852 })
      await open(page, `/v/${path}`)
      expect(pageErrors, 'uncaught errors').toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
      expect(await seriousViolations(page)).toEqual([])
      if (!money) expect(await pesos(page)).toEqual([])
      // Read-only: no Tarjeta and no Más; Dinero only «Con dinero».
      const tabs = await page.getByRole('navigation', { name: t.common.sections }).getByRole('link').allTextContents()
      expect(tabs).not.toContain(t.nav.card)
      expect(tabs).not.toContain(t.nav.more)
      expect(tabs.includes(t.nav.money)).toBe(money)
      // Every address on the page stays on the link: none leads to the tournament's own pages (Entrar, the PIN, the Comité).
      const base = baseOf(path)
      for (const href of await page.locator('a[href^="/"]').evaluateAll((els) => els.map((a) => a.getAttribute('href')!))) {
        expect(href === base || href.startsWith(`${base}/`), href).toBe(true)
      }
    })
  }
}

for (const [path, width, height] of ROOMS) {
  test(`/v/${path} at ${width}×${height}`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height })
    await page.goto(`/v/${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    expect(pageErrors, 'uncaught errors').toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
    expect(await seriousViolations(page)).toEqual([])
    expect(await underFloor(page)).toEqual([])
    if (path.startsWith('_/')) expect(await pesos(page)).toEqual([])
  })
}

test('the TV «Sin dinero»: a turn of the whole rotation, and never a peso or the Calcutta', async ({ page, pageErrors }) => {
  test.setTimeout(120_000)
  await page.clock.install()
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/v/_/full12-live/tv', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const boards = new Set<string>()
  for (let i = 0; i < 8; i++) {
    for (const title of await page.locator('section h2').allTextContents()) boards.add(title.replace(/\s*\d+–\d+ de \d+$/, '').trim())
    expect(await pesos(page), `boards ${[...boards].join(', ')}`).toEqual([])
    await page.clock.runFor(12_000)
    await page.waitForTimeout(300)
  }
  expect(boards.size).toBeGreaterThanOrEqual(3)
  expect([...boards].some((b) => b.includes('Calcutta'))).toBe(false)
  expect(pageErrors).toEqual([])
})

test('Calcutta night on a link «Sin dinero»: the TV says the auction needs the link with money', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/v/_/auction12/tv', { waitUntil: 'networkidle' })
  await expect(page.getByText(t.spectator.tvNeedsMoney)).toBeVisible()
  await expect(page.locator('[data-sold-at]')).toHaveCount(0)
})

test('a link «Con dinero» on Calcutta night: the auction board, prices and all', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/v/_dinero/auction12/tv', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-sold-at]')).toHaveCount(9)
  expect((await pesos(page)).length).toBeGreaterThan(0)
})

test('En vivo on a link: what it is, the TV and back', async ({ page }) => {
  await open(page, '/v/_/full12-live')
  await expect(page.getByText(t.spectator.note)).toBeVisible()
  await page.getByRole('link', { name: new RegExp(t.spectator.viewTv) }).click()
  await expect(page).toHaveURL(/\/v\/_\/full12-live\/tv$/)
  await page.getByRole('link', { name: t.tv.exit }).click()
  await expect(page).toHaveURL(/\/v\/_\/full12-live$/)
})

test('Dinero on a link «Sin dinero» leads back to En vivo', async ({ page }) => {
  await open(page, '/v/_/full12-live/dinero')
  await expect(page).toHaveURL(/\/v\/_\/full12-live$/)
  expect(await pesos(page)).toEqual([])
})
