/**
 * Light, dark, more contrast and forced colors (VIS-09, VIS-10, VIS-11, VIS-12, A11Y-09, A11Y-19).
 * - The main screens in the dark theme have no uncaught error and no serious or critical axe violation (WCAG 2.1
 *   AA, color contrast included), as pages.spec.ts holds the light one; with more contrast in both themes too.
 * - Figures (a board's points and holes, the Tarjeta's points, the bank's verdict) meet AAA (color-contrast-enhanced)
 *   in both themes.
 * - Más › Apariencia switches the theme at once and the next load opens in it before the app runs.
 * - The TV and the ceremony keep their board in either theme; the share card is light.
 * - Inside a tournament everything interactive is the event's accent; under forced colors the chosen segment, the
 *   tab you are on and my row still show; a laptop's pointer gets a hover.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, open, test } from './base'

const SCREENS = [
  '/t/_/full12-live',
  '/t/_/full12-live/tarjeta',
  '/t/_/full12-live/tarjeta?vista=tarjeta',
  '/t/_/full12-live/juegos',
  '/t/_/full12-live/dinero',
  '/t/_/full12-live/mas',
  '/t/_/full12-live/stats',
  '/t/_/full12-live/admin/torneo',
  '/t/_/full12-live/admin/calcutta',
  '/t/_/full12-finished/dinero',
  '/t/_/friends8',
  '/t/_/large60',
  '/t/_/full12-live?as=new-phone',
  '/p/_/yo/vs',
  '/organizer/nuevo/_',
  '/admin/_/salud',
]
/** Where the figures are: module classes keep their name in the build (`_figure_x1y2z_12`). */
const FIGURES = ['[class*="_figure_"]', '[class*="_today_"]', '[class*="_thru_"]', '[class*="_pos_"]', '[class*="_ptsMuted_"]', '[class*="_cellPts_"]', '[class*="_markPickup_"]', '[class*="_bankVerdict"]', '[class*="_fig_"]', '.num']

async function serious(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} × ${v.help} (${v.nodes[0]?.target.join(' ')})`)
}
async function figuresAAA(page: Page) {
  // axe refuses an include that matches nothing: only the kinds of figure this screen has.
  const present = await page.evaluate((sels) => sels.filter((s) => document.querySelector(s)), FIGURES)
  if (!present.length) return []
  let axe = new AxeBuilder({ page }).withRules(['color-contrast-enhanced'])
  for (const sel of present) axe = axe.include(sel)
  const r = await axe.analyze()
  return r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message ?? v.help}`))
}

for (const scheme of ['light', 'dark'] as const) {
  for (const path of SCREENS) {
    test(`${scheme}: ${path}`, async ({ page, pageErrors }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await open(page, path)
      expect(pageErrors, 'uncaught errors').toEqual([])
      if (scheme === 'dark') {
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')
        expect(await serious(page), 'axe, dark').toEqual([])
      }
      expect(await figuresAAA(page), 'figures at AAA').toEqual([])
    })
  }
  test(`${scheme} with more contrast: the boards and the Tarjeta`, async ({ page, pageErrors }) => {
    await page.emulateMedia({ colorScheme: scheme, contrast: 'more' })
    for (const path of ['/t/_/full12-live', '/t/_/full12-live/tarjeta', '/t/_/full12-live/dinero']) {
      await open(page, path)
      // The secondary ink is the ink, and the hairlines are the controls' line.
      const [ink, ink2, rule, rule2] = await page.evaluate(() => ['--ink', '--ink-2', '--rule', '--rule-2'].map((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()))
      expect(ink2).toBe(ink)
      expect(rule).toBe(rule2)
      expect(await serious(page), `axe, ${path}`).toEqual([])
    }
    expect(pageErrors).toEqual([])
  })
}

test('Más › Apariencia: «Oscuro» at once, kept for the next load before the app runs, and «Sistema» gives it back', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await open(page, '/t/_/full12-live/mas')
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const light = await bg()
  await page.getByRole('radio', { name: 'Oscuro' }).click()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  const dark = await bg()
  expect(dark).not.toBe(light)
  expect(await page.locator('meta[name="theme-color"]').evaluateAll((ms) => ms.map((m) => m.getAttribute('content')))).toEqual(['#131715', '#131715'])
  // The next load: the head script puts it on <html> before the stylesheet and the app.
  await page.goto('/t/_/full12-live', { waitUntil: 'commit' })
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  await open(page, '/t/_/full12-live/mas')
  expect(await bg()).toBe(dark)
  await page.getByRole('switch', { name: 'Más contraste' }).or(page.getByRole('checkbox', { name: 'Más contraste' })).check()
  expect(await page.evaluate(() => document.documentElement.dataset.contrast)).toBe('more')
  await page.getByRole('radio', { name: 'Sistema' }).click()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined()
  expect(await bg()).toBe(light)
})

test('the TV and the ceremony keep their board in the dark theme', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  for (const path of ['/t/_/full12-live/tv', '/t/_/full12-finished/ceremonia']) {
    const look: string[] = []
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto(path, { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      look.push(await page.locator('[data-theme="light"][data-accent]').first().evaluate((el) => `${getComputedStyle(el).backgroundColor} ${getComputedStyle(el).color} ${getComputedStyle(el).getPropertyValue('--accent')}`))
    }
    expect(look[1], path).toBe(look[0])
  }
  expect(pageErrors).toEqual([])
})

test('inside a tournament the interactive accent is the event’s (VIS-10)', async ({ page }) => {
  // full12-live is Agua: the platform's fairway is nowhere on its screens.
  await open(page, '/t/_/full12-live')
  const fill = await page.getByRole('link', { name: /Anotar el hoyo/ }).or(page.getByRole('button', { name: /Anotar el hoyo/ })).first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(fill).not.toBe('rgb(30, 107, 59)')
  const share = await page.getByRole('button', { name: /Compartir/ }).first().evaluate((el) => getComputedStyle(el).color)
  expect(share).toBe(fill)
  // My row's tint and its bar are one hue, the bar inside the row.
  const mine = page.locator('[class*="_mine_"]').first()
  const [rowLeft, barLeft] = await mine.evaluate((el) => [el.getBoundingClientRect().left, el.getBoundingClientRect().left + parseFloat(getComputedStyle(el, '::before').left)])
  expect(barLeft).toBeGreaterThanOrEqual(rowLeft)
  expect(await mine.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe(fill)
  await open(page, '/t/_/full12-live/mas')
  const toggle = await page.locator('.toggle input:checked').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(toggle).toBe(fill)
})

// axe answers «incomplete» for my row (a tinted button with a ::before), so its figures are measured here (A11Y-09).
for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: my row's position, «hoy» and «hoyo» are AAA on its tint`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, '/t/_/full12-live')
    const ratios = await page.locator('[class*="_mine_"]').first().evaluate((row) => {
      const lum = (c: string) => {
        const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((v) => Number(v) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
      }
      const bg = lum(getComputedStyle(row).backgroundColor)
      return Array.from(row.querySelectorAll('[class*="_pos_"], [class*="_today_"], [class*="_thru_"]')).map((el) => {
        const fg = lum(getComputedStyle(el).color)
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
      })
    })
    expect(ratios.length).toBe(3)
    for (const r of ratios) expect(r).toBeGreaterThanOrEqual(7)
  })
}

test('forced colors: the chosen segment, the tab you are on and my row still show (A11Y-19)', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await open(page, '/t/_/full12-live')
  const seg = await page.getByRole('radio').evaluateAll((els) => els.slice(0, 2).map((el) => getComputedStyle(el).backgroundColor))
  expect(seg[0]).not.toBe(seg[1])
  const tabs = await page.getByRole('navigation').last().getByRole('link').evaluateAll((els) => els.map((el) => `${getComputedStyle(el).backgroundColor}|${el.getAttribute('aria-current')}`))
  const current = tabs.filter((x) => x.endsWith('|page'))
  expect(current).toHaveLength(1)
  expect(tabs.filter((x) => x.split('|')[0] === current[0]!.split('|')[0])).toHaveLength(1)
  const outline = await page.locator('[class*="_mine_"]').first().evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).toBe('solid')
})

test.describe('a laptop', () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 800 } })
  test('the pointer gets a hover on the Comité’s buttons, its sections and its swatches (VIS-12)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '/t/_/full12-live/admin/torneo')
    const look = (name: string, role: 'button' | 'link') => page.getByRole(role, { name }).first().evaluate((el) => `${getComputedStyle(el).backgroundColor} ${getComputedStyle(el).borderColor} ${getComputedStyle(el).color}`)
    for (const [name, role] of [['Subir logo', 'button'], ['Vino', 'button'], ['Jugadores', 'link']] as const) {
      await page.mouse.move(0, 0)
      const before = await look(name, role)
      await page.getByRole(role, { name }).first().hover()
      expect(await look(name, role), name).not.toBe(before)
    }
  })
})
