/**
 * VIS-19: a laptop and an iPad. The wizard, the organizer's screens and En vivo were a 560 px phone column centred in
 * 1440 px, and the iPad's board left its right half blank under a tab bar spread across 1024 px. Now:
 * - from 900 px the wizard is two columns, the form and a live preview of the event as it is typed;
 * - from 900 px En vivo is the board and, beside it, the feed;
 * - the tab bar keeps its tabs together in the middle, never spread across the screen;
 * - no paragraph runs past about 70 characters a line.
 * Each at the laptop's and the iPad's sizes, with the suite's checks: no uncaught error, no sideways scroll.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, open, test } from './base'

const SIZES: Array<[string, number, number]> = [
  ['laptop', 1440, 900],
  ['iPad', 1024, 1366],
  ['iPad landscape', 1366, 1024],
]
const sound = async (page: import('@playwright/test').Page, pageErrors: string[], width: number) => {
  expect(pageErrors, 'uncaught errors').toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
  expect(await page.evaluate(() => window.innerWidth)).toBe(width)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)).toEqual([])
}
/** The widest line any paragraph on the page sets, in its own font's «0»s. */
const widestMeasure = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    let widest = 0
    for (const p of Array.from(document.querySelectorAll('main p'))) {
      const s = getComputedStyle(p)
      if (s.display === 'none' || !p.textContent?.trim()) continue
      const probe = document.createElement('span')
      probe.textContent = '0'.repeat(10)
      probe.style.font = s.font
      document.body.append(probe)
      const ch = probe.getBoundingClientRect().width / 10
      probe.remove()
      widest = Math.max(widest, p.getBoundingClientRect().width / ch)
    }
    return widest
  })

for (const [what, width, height] of SIZES) {
  test.describe(`on a ${what} (${width}×${height})`, () => {
    test.use({ isMobile: false, hasTouch: what !== 'laptop' })
    test.beforeEach(({ page }) => page.setViewportSize({ width, height }))

    test('the wizard is the form and a live preview side by side (VIS-19)', async ({ page, pageErrors }) => {
      await open(page, '/organizer/nuevo/_')
      const form = page.locator('form').first()
      const preview = page.locator('[data-wizard-preview]')
      await expect(preview).toBeVisible()
      await form.getByRole('textbox').first().fill('Copa de la Villa')
      await expect(preview).toContainText('Copa de la Villa')
      const f = (await form.boundingBox())!
      const p = (await preview.boundingBox())!
      expect(p.x, 'the preview stands beside the form').toBeGreaterThanOrEqual(f.x + f.width - 1)
      expect(Math.abs(p.y - f.y), 'side by side, not below').toBeLessThan(200)
      expect(f.width + p.width, 'the two columns use the screen').toBeGreaterThan(Math.min(width - 80, 900))
      expect(await widestMeasure(page)).toBeLessThanOrEqual(72)
      await sound(page, pageErrors, width)
    })

    test('En vivo is the board with the feed beside it (VIS-19)', async ({ page, pageErrors }) => {
      await open(page, '/t/_/full12-live')
      const board = page.locator('div:has(> [class*="_boardHead_"][aria-hidden="true"])').first()
      const feed = page.locator('[data-live-side]')
      await expect(feed).toBeVisible()
      const b = (await board.boundingBox())!
      const f = (await feed.boundingBox())!
      expect(f.x, 'the feed stands beside the board').toBeGreaterThanOrEqual(b.x + b.width - 1)
      expect(f.y, 'the feed starts near the top, not under the board').toBeLessThan(b.y + b.height / 2)
      // The tabs sit together, not spread across the screen.
      const tabs = await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))
      const span = tabs.at(-1)!.right - tabs[0]!.left
      expect(span, 'the tab bar spans').toBeLessThanOrEqual(720)
      expect(await widestMeasure(page)).toBeLessThanOrEqual(72)
      await sound(page, pageErrors, width)
    })
  })
}

// The other main screens at the same sizes: sound, the tabs together, prose at a reading measure.
for (const [what, width, height] of SIZES) {
  for (const path of ['tarjeta', 'juegos', 'dinero', 'mas', 'reglamento', 'admin/torneo']) {
    test(`${path} on a ${what} (${width}×${height}) (VIS-19)`, async ({ page, pageErrors }) => {
      await page.setViewportSize({ width, height })
      await open(page, `/t/_/full12-live/${path}`)
      expect(await widestMeasure(page)).toBeLessThanOrEqual(72)
      await sound(page, pageErrors, width)
    })
  }
}

test('a phone keeps one column (VIS-19)', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await open(page, '/organizer/nuevo/_')
  await expect(page.locator('[data-wizard-preview]')).toBeHidden()
  await open(page, '/t/_/full12-live')
  const board = (await page.locator('div:has(> [class*="_boardHead_"][aria-hidden="true"])').first().boundingBox())!
  const feed = (await page.locator('[data-live-side]').boundingBox())!
  expect(feed.y, 'the feed is under the board').toBeGreaterThan(board.y + board.height - 1)
})
