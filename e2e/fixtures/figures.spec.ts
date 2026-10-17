/**
 * No figure is cut off (found by the large-text work, PR 229): at plain 100 % text, Juegos' pairs board (each day's
 * points beside the pair), its fewest-putts board («1.69 por hoyo, 11 a uno, 2 a tres») and Dinero («Pone $6,000,
 * recibe $8,200», a settlement line's parts) set their figures on one line and clipped them with an ellipsis, or ran
 * them past their box. A line that carries figures now wraps; nothing that holds a digit is wider than its box.
 */
import type { Page } from '@playwright/test'
import { expect, open, test } from './base'

/** Every box on the page that holds a figure in its own text and is narrower than that text. */
const clipped = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('main *'))
      .filter((e) => {
        const own = Array.from(e.childNodes).some((n) => n.nodeType === 3 && /\d/.test(n.textContent ?? ''))
        const s = getComputedStyle(e)
        return own && s.display !== 'inline' && s.display !== 'none' && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 0.5
      })
      .map((e) => `«${e.textContent!.trim().slice(0, 40)}» ${e.scrollWidth} > ${e.clientWidth}`),
  )

for (const width of [375, 393]) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(({ page }) => page.setViewportSize({ width, height: 852 }))
    for (const [what, path, game] of [
      ['Juegos › the pairs', '/t/_/full12-live/juegos', 'pairs'],
      ['Juegos › fewest putts', '/t/_/full12-live/juegos', 'fewestPutts'],
      ['Dinero, under way', '/t/_/full12-live/dinero', null],
      ['Dinero, final', '/t/_/full12-finished/dinero', null],
    ] as const) {
      test(`${what}: no figure is cut off`, async ({ page }) => {
        await open(page, path)
        if (game) await page.locator(`[data-game="${game}"]`).click()
        await expect(page.locator('main').getByText(/\d/).first()).toBeVisible()
        expect(await clipped(page)).toEqual([])
      })
    }
  })
}
