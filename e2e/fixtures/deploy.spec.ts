/**
 * REL-13: a page no service worker controls (a first visit, WhatsApp's in-app
 * browser) asks the server for its own build's screens. After a deploy they
 * are gone, and opening one landed on «Algo falló al abrir Polo» until someone
 * pressed «Reiniciar la app». Now the page loads the new build instead, once.
 */
import type { Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

test.use({ serviceWorkers: 'block' })

const STATS_CHUNK = /\/assets\/StatsScreen-[\w-]+\.js$/

/** Más › Estadísticas, as a player taps it. */
async function openStats(page: Page) {
  await page.getByRole('link', { name: new RegExp(`^${t.nav.more}`) }).click()
  await page.getByRole('link', { name: t.more.stats }).click()
}

test('a screen of the build before a deploy: the page loads the new build and opens it (REL-13)', async ({ page }) => {
  await open(page, '/t/_/full12-live')
  // The deploy: the server no longer has this build's Estadísticas, however often the page asks. Vite preloads a
  // screen's chunk and then imports it; Chromium 156 (CI's since Playwright 1.64) fetches the failed preload again
  // where older ones kept it failed, so a mock that refused only once served the import. Only the reloaded page,
  // the new build, gets it.
  let reloads = 0
  page.on('request', (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) reloads++
  })
  let refused = 0
  await page.route(STATS_CHUNK, (route) => {
    if (reloads > 0) return route.continue()
    refused++
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' })
  })
  let loads = 0
  page.on('load', () => loads++)
  await openStats(page)
  await expect(page.getByRole('heading', { name: t.stats.title })).toBeVisible()
  expect(refused).toBeGreaterThan(0)
  expect(reloads).toBe(1)
  expect(loads).toBe(1)
  await expect(page.getByText(t.boot.crashTitle)).toHaveCount(0)
})

test('a screen that fails again right after that reload is something else: the error shows, with its way out, and no loop (REL-13)', async ({
  page,
}) => {
  await open(page, '/t/_/full12-live')
  await page.route(STATS_CHUNK, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }))
  let loads = 0
  page.on('load', () => loads++)
  await openStats(page)
  await expect(page.getByRole('heading', { name: t.boot.crashTitle })).toBeVisible()
  await page.waitForTimeout(1000)
  expect(loads).toBe(1)
})
