/**
 * Every main screen, at two phone widths: no uncaught error, nothing wider
 * than the screen, and no serious or critical axe violation (WCAG 2.1 A/AA).
 * The TV and the ceremony are checked at room sizes.
 *
 * Nothing wider than the screen means the phone does not zoom out either: an
 * absolutely placed element that escapes a sideways scroller widens the page,
 * and a phone fits the page to the screen, so there is no horizontal scroll to
 * see, only a page drawn smaller with its sticky bars off their edges. The
 * window's width must stay the phone's.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, open, test } from './base'
import { t } from '../../src/i18n/es-MX'

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
  // Calcutta night before the first lot and after the draw (MOT-05, UX-17).
  calcutta12: ['admin/calcutta'],
  draw12: ['admin/parejas'],
}
const PHONES = [375, 393]
const ROOMS: Array<[string, number, number]> = [
  ['full12-live/tv', 1920, 1080],
  ['full12-live/tv', 1280, 720],
  ['auction12/tv', 1920, 1080],
  ['auction12/tv', 1280, 720],
  ['hat12/tv', 1920, 1080],
  ['hat12/tv', 1280, 720],
  ['draw12/tv', 1920, 1080],
  ['draw12/tv', 1280, 720],
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
        expect(await page.evaluate(() => window.innerWidth), 'the page zoomed out to fit something wider than the phone').toBe(width)
        expect(await seriousViolations(page)).toEqual([])
      })
    }
  }
}

// A crew as its owner sees it (TRUST-11): «Sacar» beside each member, who waits to enter, «Aprobar solicitudes».
for (const width of PHONES) {
  test(`crew page (owner) at ${width}px`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height: 852 })
    await open(page, '/c/_')
    await expect(page.getByRole('checkbox', { name: t.crews.approval })).toBeVisible()
    expect(pageErrors, 'uncaught errors').toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
    expect(await seriousViolations(page)).toEqual([])
  })
}

// Admin de Polo's screens on their in-memory fixture (Salud carries the telemetry, STRAT-02; Resumen how each course
// arrived, Campos its verified and corrected cards and one verified card, STRAT-14).
for (const path of ['salud', 'resumen', 'campos', 'campos/c-quivira']) {
  for (const width of PHONES) {
    test(`admin/${path} at ${width}px`, async ({ page, pageErrors }) => {
      await page.setViewportSize({ width, height: 852 })
      await open(page, `/admin/_/${path}`)
      expect(pageErrors, 'uncaught errors').toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
      expect(await page.evaluate(() => window.innerWidth), 'the page zoomed out to fit something wider than the phone').toBe(width)
      expect(await seriousViolations(page)).toEqual([])
    })
  }
}

for (const [path, width, height] of ROOMS) {
  test(`${path} at ${width}×${height}`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height })
    await page.goto(`/t/_/${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    expect(pageErrors, 'uncaught errors').toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
    expect(await page.evaluate(() => window.innerWidth), 'the page zoomed out to fit something wider than the screen').toBe(width)
    expect(await seriousViolations(page)).toEqual([])
  })
}
