/**
 * MOT-16: every tab opened at the scroll the last one was left at. From En vivo scrolled to the feed, Dinero opened at
 * its bottom, its title and the bank's summary above the fold. Now each tab and Comité section keeps its own scroll
 * (src/app/scrollKey.ts), one opened for the first time starts at its top, and a tap on the open tab goes back up.
 * A sheet opened and closed, by Escape or by the system back (PWA-05's own history entry), moves nothing.
 */
import type { Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const y = (page: Page) => page.evaluate(() => Math.round(window.scrollY))
const room = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
const tab = (page: Page, name: string) => page.getByRole('navigation', { name: t.common.sections }).getByRole('link', { name, exact: true })
/** A tap where the tab is drawn. Playwright's own click scrolls its target into view first, and for the bar fixed at the
 * bottom that took the page to its bottom before the tap: a thumb moves nothing. */
async function tapTab(page: Page, name: string) {
  const box = (await tab(page, name).boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  // The jump to the top is instant, so the scroll can be read at once.
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('each tab keeps its own scroll, and one opened for the first time starts at its top (MOT-16)', async ({ page }) => {
  await open(page, '/t/_/full12-live')
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const live = await y(page)
  expect(live, 'En vivo scrolls to its feed').toBeGreaterThan(300)

  await tapTab(page, t.nav.money)
  await expect(page.getByRole('heading', { level: 1, name: t.nav.money })).toBeInViewport()
  expect(await y(page), 'Dinero, opened for the first time, at its top').toBe(0)
  const money = Math.min(150, await room(page))
  expect(money, 'Dinero scrolls').toBeGreaterThan(50)
  await page.evaluate((to) => window.scrollTo(0, to), money)
  await expect.poll(() => y(page)).toBe(money)

  await tapTab(page, t.nav.live)
  await expect.poll(() => y(page), 'En vivo where it was left').toBe(live)
  await tapTab(page, t.nav.money)
  await expect.poll(() => y(page), 'Dinero where it was left').toBe(money)
  await tapTab(page, t.nav.games)
  await expect.poll(() => y(page), 'Juegos, opened for the first time, at its top').toBe(0)
})

test('the open tab, tapped again, goes back to its top; from the Tarjeta’s grid it goes back to the hole, as before (MOT-16)', async ({ page }) => {
  await open(page, '/t/_/full12-live')
  const url = page.url()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  expect(await y(page)).toBeGreaterThan(300)
  await tapTab(page, t.nav.live)
  await expect.poll(() => y(page)).toBe(0)
  expect(page.url(), 'no navigation').toBe(url)

  await open(page, '/t/_/full12-live/tarjeta?vista=tarjeta')
  await tapTab(page, t.nav.card)
  await expect(page).toHaveURL(/\/tarjeta$/)
})

test('a sheet opened and closed leaves the page where it was, by Escape and by the system back (MOT-16, PWA-05)', async ({ page }) => {
  await open(page, '/t/_/full12-live')
  const row = page.locator('button[class*="leaderRow"]').nth(6)
  await row.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, 120))
  const at = await y(page)
  expect(at).toBeGreaterThan(100)

  await row.click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => y(page), 'after Escape').toBe(at)
  // Escape gives the sheet's history entry back a tick later (sheetHistory.ts): wait it out, as a person would.
  await expect.poll(() => page.evaluate(() => !!(history.state as { poloSheet?: boolean } | null)?.poloSheet)).toBe(false)

  await row.click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => y(page), 'after the system back').toBe(at)
})

test('a page outside the tournament: a link from it opens at the top, and back returns to where it was (MOT-16)', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 500 })
  await open(page, '/fixture')
  // The fixture index's last link, scrolled to, then followed in the app.
  const link = page.locator('main a[href^="/t/_/"]').last()
  await link.scrollIntoViewIfNeeded()
  const at = await y(page)
  expect(at, 'the index scrolls').toBeGreaterThan(100)
  await link.click()
  await page.locator('main').first().waitFor()
  await expect.poll(() => y(page), 'a new page starts at its top').toBe(0)
  await page.goBack()
  await expect(page).toHaveURL(/\/fixture$/)
  await expect.poll(() => y(page), 'back where it was').toBe(at)
})
