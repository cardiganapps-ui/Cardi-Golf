/**
 * What a first open asks the server for (PERF-02, PERF-03, PERF-13, MOT-22). Every route used to download one
 * 1.5 MB entry with every screen in it: the landing page paid for the boards, a player for the organizer's and
 * the Comité's screens. Now a route loads its own screens, the share image and confetti libraries come with
 * their first use, the text font is asked for with the page, and a link loads its screen on the first touch.
 */
import type { Page, Request } from '@playwright/test'
import { expect, open, test } from './base'

// The worker would serve the second load from its precache and prefetch the tabs when idle: these count the network.
test.use({ serviceWorkers: 'block' })

/** The app's own scripts the page asked for, by the name before their fingerprint. */
function scripts(page: Page): string[] {
  const names: string[] = []
  page.on('request', (r: Request) => {
    const m = /\/assets\/([\w.-]+?)-[\w-]{8}\.js$/.exec(new URL(r.url()).pathname)
    if (m) names.push(m[1])
  })
  return names
}

test('a player’s link loads the tournament’s screens and none of the organizer’s, the Comité’s or the admin’s', async ({ page }) => {
  const asked = scripts(page)
  await open(page, '/t/_/full12-live')
  await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible()
  expect(asked).toContain('index')
  expect(asked).toContain('player')
  for (const name of ['organizer', 'platform', 'HomeScreen', 'AdminLayout', 'AdminTournament', 'StatsScreen', 'TvScreen', 'CeremonyScreen', 'confetti.module', 'html-to-image']) expect(asked, name).not.toContain(name)
})

test('the landing page loads none of the tournament’s screens', async ({ page }) => {
  const asked = scripts(page)
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Entrar a un torneo' })).toBeVisible()
  expect(asked).toContain('HomeScreen')
  for (const name of ['player', 'GamesScreen', 'MoneyScreen', 'organizer', 'platform']) expect(asked, name).not.toContain(name)
})

test('the text font is asked for with the page, once, from the link index.html preloads it with', async ({ page }) => {
  const html = await (await page.request.get('/')).text()
  const href = /<link rel="preload" href="(\/assets\/archivo-latin-wdth-normal-[\w-]+\.woff2)" as="font" type="font\/woff2" crossorigin="">/.exec(html)?.[1]
  expect(href, 'index.html preloads the Archivo Latin face').toBeTruthy()
  const fonts: string[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('.woff2')) fonts.push(new URL(r.url()).pathname)
  })
  await open(page, '/t/_/full12-live')
  // The preload and the stylesheet's own face are one request: the same URL, mode and credentials.
  expect(fonts.filter((f) => f === href)).toHaveLength(1)
  // Spanish never needs the Vietnamese or Latin Extended subsets.
  expect(fonts.filter((f) => /latin-ext|vietnamese/.test(f))).toEqual([])
})

test('a link loads its screen on the first touch, before the tap lands (MOT-22)', async ({ page }) => {
  const asked = scripts(page)
  await open(page, '/t/_/full12-live/mas')
  expect(asked).not.toContain('StatsScreen')
  const stats = page.getByRole('link', { name: 'Estadísticas' })
  const loaded = page.waitForRequest(/\/assets\/StatsScreen-[\w-]{8}\.js$/)
  await stats.dispatchEvent('pointerdown')
  await loaded
  expect(page.url()).toMatch(/\/mas$/)
  await stats.click()
  await expect(page.getByRole('heading', { level: 1, name: /Estadísticas/ })).toBeVisible()
})
