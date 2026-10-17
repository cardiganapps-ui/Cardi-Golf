/**
 * The 2026-10-16 product pass, on the real screens:
 * - STRAT-17: «Ver un torneo de ejemplo» (`/demo`), a finished tournament on
 *   the link to watch's read-only screens, at two phone widths and on a TV,
 *   that keeps and sends nothing.
 * - STRAT-10: En vivo before the first hole (Calcutta night, a tournament
 *   still in setup).
 * - STRAT-08: «Guarda tus rondas» on En vivo once Terminado.
 * - UX-20: Comité › Jugadores' PINs and a player's invite.
 * - PWA-06: no share card runs taller than 1.8 times its width.
 * Every page: no uncaught error, nothing wider than the screen, no serious or
 * critical axe violation.
 */
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const PHONES = [375, 393]
const PAGES = [
  '/demo',
  '/demo/juegos',
  '/demo/dinero',
  '/t/_/auction12',
  '/t/_/minimal4-setup',
  '/t/_/full12-finished',
  '/t/_/full12-live/admin/jugadores',
  '/',
  '/organizer/login',
]

async function seriousViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)
}
const overflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

for (const path of PAGES) {
  for (const width of PHONES) {
    test(`${path} at ${width}px`, async ({ page, pageErrors }) => {
      await page.setViewportSize({ width, height: 852 })
      await open(page, path)
      expect(pageErrors, 'uncaught errors').toEqual([])
      expect(await overflow(page), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
      expect(await seriousViolations(page)).toEqual([])
    })
  }
}

test.describe('the example tournament (STRAT-17)', () => {
  test('from Home, signed out: a finished board that says it is made up', async ({ page }) => {
    await open(page, '/')
    await page.getByRole('link', { name: t.demo.open }).click()
    await expect(page).toHaveURL(/\/demo$/)
    await expect(page.getByText(t.demo.intro)).toBeVisible()
    await expect(page.getByText('Copa de los Compadres').first()).toBeVisible()
    // Read-only: no Tarjeta, no Más; Dinero «Con dinero».
    const tabs = await page.getByRole('navigation', { name: t.common.sections }).getByRole('link').allTextContents()
    expect(tabs).not.toContain(t.nav.card)
    expect(tabs).not.toContain(t.nav.more)
    expect(tabs).toContain(t.nav.money)
  })

  test('on a TV: the rotation at room size', async ({ page, pageErrors }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/demo/tv', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    expect(pageErrors).toEqual([])
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    expect(await seriousViolations(page)).toEqual([])
  })

  test('keeps and sends nothing: no IndexedDB, no key in storage, no request but the app’s switches', async ({
    page,
  }) => {
    const asked: string[] = []
    await page.route(/supabase\.co|\/rest\/v1\/|\/auth\/v1\//, (r) => {
      asked.push(new URL(r.request().url()).pathname)
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    for (const path of ['/demo', '/demo/juegos', '/demo/dinero', '/demo/tv']) await open(page, path)
    const kept = await page.evaluate(async () => ({
      databases: (await indexedDB.databases()).map((d) => d.name),
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }))
    expect(kept.databases).toEqual([])
    expect(kept.local.filter((k) => k.startsWith('cardi-golf'))).toEqual([])
    expect(kept.session.filter((k) => k.startsWith('cardi-golf'))).toEqual([])
    expect([...new Set(asked)].filter((p) => !p.endsWith('/rpc/app_flags'))).toEqual([])
  })
})

test('Calcutta night: En vivo says the next day before a board of zeros (STRAT-10)', async ({ page }) => {
  await open(page, '/t/_/auction12')
  const pre = page.getByRole('region', { name: new RegExp(`^${t.live.pre.title}`) })
  await expect(pre).toBeVisible()
  await expect(pre.getByText(t.live.pre.group)).toBeVisible()
  await expect(pre.getByText(t.live.pre.hcp)).toBeVisible()
  // Above the board.
  const preBox = (await pre.boundingBox())!
  const boardBox = (await page.getByRole('heading', { name: 'Individual' }).boundingBox())!
  expect(preBox.y).toBeLessThan(boardBox.y)
})

test('Terminado: «Guarda tus rondas» on En vivo for a phone on its PIN (STRAT-08)', async ({ page }) => {
  await open(page, '/t/_/full12-finished')
  await expect(page.getByRole('heading', { name: t.saveResults.title })).toBeVisible()
  await page.getByRole('link', { name: t.saveResults.action }).click()
  await expect(page).toHaveURL(/\/entrar\?next=%2Ft%2F_%2Ffull12-finished$/)
})

test('a player’s PIN sheet makes one, at phone width (UX-20)', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, '/t/_/full12-live/admin/jugadores')
  // A fixture has no server to say who has a PIN, so «Generar PINs» waits (it never counts a PIN it couldn't read as missing).
  await page.getByRole('button', { name: t.admin.players.setPin }).first().click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: t.admin.players.pins.random }).click()
  await expect(sheet.getByLabel(t.admin.players.pinInput)).toHaveValue(/^\d{4}$/)
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  expect(await seriousViolations(page)).toEqual([])
  expect(pageErrors).toEqual([])
})

/** A PNG's width and height, from its header. */
async function pngSize(path: string): Promise<{ w: number; h: number }> {
  const png = await readFile(path)
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) }
}

for (const [path, button] of [
  ['/t/_/large60', t.share.leaderboard],
  ['/t/_/full12-finished', t.share.leaderboard],
  ['/t/_/full12-finished/dinero', t.common.share],
  ['/demo/dinero', t.common.share],
] as const) {
  test(`the share card from ${path} is no taller than 1.8 times its width (PWA-06)`, async ({ page }) => {
    await open(page, path)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: button, exact: true }).first().click(),
    ])
    const { w, h } = await pngSize(await download.path())
    expect(w).toBeGreaterThan(1000)
    expect(h / w, `${w}×${h}`).toBeLessThanOrEqual(1.8)
  })
}
