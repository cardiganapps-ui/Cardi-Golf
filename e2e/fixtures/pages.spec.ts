/**
 * Every main screen, at two phone widths: no uncaught error, nothing wider
 * than the screen, and no serious or critical axe violation (WCAG 2.1 A/AA).
 * The TV and the ceremony are checked at room sizes.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, open, test } from './base'

const PAGES: Record<string, string[]> = {
  'full12-live': ['', 'tarjeta', 'juegos', 'dinero', 'mas', 'reglamento', 'stats', 'admin/torneo', 'admin/jugadores', 'admin/rondas', 'admin/grupos', 'admin/scores', 'admin/calcutta', 'admin/parejas', 'admin/datos'],
  'full12-finished': ['', 'dinero', 'juegos'],
  'minimal4-live': ['', 'tarjeta', 'dinero'],
  'minimal4-setup': ['', 'admin/torneo'],
  'new-setup': ['', 'admin/torneo'],
  friends8: ['', 'juegos', 'tarjeta'],
  stroke8: ['', 'juegos'],
  match8: ['', 'juegos'],
  team8: ['', 'juegos'],
}
const PHONES = [375, 393]
const ROOMS: Array<[string, number, number]> = [
  ['full12-live/tv', 1920, 1080],
  ['full12-live/tv', 1280, 720],
  ['auction12/tv', 1920, 1080],
  ['auction12/tv', 1280, 720],
  ['full12-finished/ceremonia', 1920, 1080],
]

async function seriousViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)
}

for (const [fixture, paths] of Object.entries(PAGES)) {
  for (const path of paths) {
    for (const width of PHONES) {
      test(`${fixture}/${path || 'envivo'} at ${width}px`, async ({ page, pageErrors }) => {
        await page.setViewportSize({ width, height: 852 })
        await open(page, `/t/_/${fixture}/${path}`)
        expect(pageErrors, 'uncaught errors').toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
        expect(await seriousViolations(page)).toEqual([])
      })
    }
  }
}

for (const [path, width, height] of ROOMS) {
  test(`${path} at ${width}×${height}`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height })
    await page.goto(`/t/_/${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    expect(pageErrors, 'uncaught errors').toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
    expect(await seriousViolations(page)).toEqual([])
  })
}
