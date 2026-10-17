/**
 * REL-21, PWA-15 and PWA-14 on the real screens, in Chromium.
 * - With no signal, and over the phone's copy, the header says the state once, on one line beside even the
 *   longest event name, as a button («Actualizar»); the app's banner shows on no tournament screen.
 * - A pull from the top of En vivo arms past its threshold and lets the boards come; the page's own scroll
 *   is never held back; the Tarjeta takes no pull.
 * - The build links a launch image per iPhone screen and serves each; the shortcuts' page opens the last
 *   tournament's Tarjeta.
 * Every screen at 375 and 393 px: no uncaught error, nothing wider than the screen, no serious or critical
 * axe violation.
 */
import AxeBuilder from '@axe-core/playwright'
import type { CDPSession, Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { LAUNCH_SCREENS, launchPixels } from '../../src/lib/launchImages'
import { expect, open, test } from './base'

const PHONES = [375, 393]
const SCREENS = ['', 'tarjeta', 'juegos', 'dinero', 'mas']

async function expectSound(page: Page, pageErrors: string[]) {
  expect(pageErrors, 'uncaught errors').toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)).toEqual([])
}
/** The header's chip as the button it is when the boards are not live. */
const chip = (page: Page, says: string) => page.locator('header').getByRole('button', { name: t.sync.refreshLabel(says) })
/** Its words fit one line: no taller than one line of its own text. */
async function oneLine(page: Page, says: string) {
  const box = await chip(page, says).getByText(says, { exact: true }).evaluate((el) => ({ h: el.getBoundingClientRect().height, font: parseFloat(getComputedStyle(el).fontSize) }))
  expect(box.h, `«${says}» on one line`).toBeLessThan(box.font * 1.8)
}

for (const width of PHONES) {
  for (const path of SCREENS) {
    test(`no signal on ${path || 'envivo'} at ${width}px: «Sin señal» once, on one line, as «Actualizar»`, async ({ page, context, pageErrors }) => {
      await page.setViewportSize({ width, height: 852 })
      // The longest event name the fixtures have: the chip keeps its line, the name gives way.
      await open(page, `/t/_/longnames/${path}`)
      await context.setOffline(true)
      await expect(chip(page, t.sync.offlineShort)).toBeVisible()
      await oneLine(page, t.sync.offlineShort)
      await expect(page.getByText(t.sync.offlineShort, { exact: true })).toHaveCount(1)
      await expect(page.getByText(t.sync.offline)).toHaveCount(0)
      await expectSound(page, pageErrors)
      await context.setOffline(false)
    })
  }

  test(`the phone’s copy at ${width}px: «Conectando…» once, on one line, and how old the boards are`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height: 852 })
    await open(page, '/t/_/longnames?net=cache')
    await expect(chip(page, t.sync.connecting)).toBeVisible()
    await oneLine(page, t.sync.connecting)
    await expect(page.locator('header').getByText(t.sync.boardsAge('hace 5 min'))).toBeVisible()
    await expect(page.getByText(t.sync.boardsAge(''), { exact: false })).toHaveCount(1)
    await expectSound(page, pageErrors)
  })

  test(`live at ${width}px: «En vivo», no button`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height: 852 })
    await open(page, '/t/_/full12-live?net=live')
    await expect(page.locator('header').getByText(t.sync.live, { exact: true })).toBeVisible()
    await expect(page.locator('header').getByRole('button')).toHaveCount(0)
    await expectSound(page, pageErrors)
  })
}

test('the TV with no signal says so in its own line, at the room’s size, and shows no banner', async ({ page, context, pageErrors }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/t/_/full12-live/tv', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await context.setOffline(true)
  await expect(page.locator('header').getByText(new RegExp(`\\. ${t.sync.offlineShort}`))).toBeVisible()
  await expect(page.getByText(t.sync.offline)).toHaveCount(0)
  // As large as the line it is in: the TV's text is sized for the room (VIS-05: 3.5vh, to the half pixel as tv.spec.ts reads it).
  const size = await page.locator('header').getByText(new RegExp(t.sync.offlineShort)).evaluate((el) => ({ px: parseFloat(getComputedStyle(el).fontSize), floor: window.innerHeight * 0.035 - 0.5 }))
  expect(size.px).toBeGreaterThanOrEqual(size.floor)
  await expectSound(page, pageErrors)
  await context.setOffline(false)
})

/** A finger on the touch screen, through Chromium's own input: real touch events, and the page's real scroll. */
async function finger(page: Page) {
  const cdp: CDPSession = await page.context().newCDPSession(page)
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 190, y }] })
  return {
    /** From `from` to `to`, a step at a time; `before` runs before it lets go. */
    async drag(from: number, to: number, before?: () => Promise<void>) {
      await send('touchStart', from)
      const step = from < to ? 12 : -12
      for (let y = from + step; step > 0 ? y <= to : y >= to; y += step) await send('touchMove', y)
      await before?.()
      await send('touchEnd')
    },
  }
}
const mark = (page: Page) => page.locator('[data-pull]')

test('a pull from the top of En vivo arms past its threshold, and the boards come', async ({ page, pageErrors }) => {
  await open(page, '/t/_/full12-live?net=failed')
  const f = await finger(page)
  await f.drag(260, 470, async () => {
    await expect(mark(page)).toHaveAttribute('data-pull', 'armed')
  })
  // A fixture has no server: the refresh ends at once and the mark goes back up.
  await expect(mark(page)).toHaveAttribute('data-pull', 'idle')
  expect(pageErrors).toEqual([])
})

test('short of its threshold it lets go with nothing', async ({ page }) => {
  await open(page, '/t/_/full12-live')
  const f = await finger(page)
  await f.drag(260, 320, async () => {
    await expect(mark(page)).toHaveAttribute('data-pull', 'pulling')
  })
  await expect(mark(page)).toHaveAttribute('data-pull', 'idle')
})

test('the page scrolls as it always did: down from the top, and back up from below, with no pull', async ({ page }) => {
  await open(page, '/t/_/full12-live')
  const f = await finger(page)
  // Up from the top: the page scrolls down.
  await f.drag(600, 200)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  const down = await page.evaluate(() => window.scrollY)
  // Down from there: the page scrolls back up, and nothing is pulled.
  await f.drag(200, 350, async () => {
    await expect(mark(page)).toHaveAttribute('data-pull', 'idle')
  })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(down)
})

test('the Tarjeta takes no pull: its swipes move between holes', async ({ page }) => {
  await open(page, '/t/_/full12-live/tarjeta')
  await expect(mark(page)).toHaveCount(0)
})

test('the build links a launch image per iPhone screen, and serves each', async ({ page }) => {
  const html = await (await page.request.get('/')).text()
  const links = [...html.matchAll(/<link rel="apple-touch-startup-image" media="([^"]+)" href="([^"]+)">/g)]
  expect(links).toHaveLength(LAUNCH_SCREENS.length)
  for (const [, media, href] of links) {
    const res = await page.request.get(href)
    expect(res.status(), href).toBe(200)
    expect(res.headers()['content-type'], href).toBe('image/png')
    const screen = LAUNCH_SCREENS.find((s) => media.includes(`device-width: ${s.width}px`) && media.includes(`device-height: ${s.height}px`) && media.includes(`ratio: ${s.ratio}`))!
    expect(href).toContain(`iphone-${launchPixels(screen).width}x${launchPixels(screen).height}.png?v=`)
  }
})

test('the «Mi tarjeta» shortcut opens the last tournament’s Tarjeta', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cardi-golf:last-tournament', JSON.stringify({ slug: '_/full12-live', name: 'Fixture', at: Date.now() })))
  await page.goto('/continuar/tarjeta', { waitUntil: 'networkidle' })
  await expect(page).toHaveURL(/\/t\/_\/full12-live\/tarjeta$/)
  await expect(page.getByRole('button', { name: new RegExp(`^(${t.card.save}|${t.card.saveLast})`) }).first()).toBeVisible()
})
