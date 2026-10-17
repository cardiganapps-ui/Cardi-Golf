/**
 * PWA-10 and PWA-12 on the screens they touch. «Avisos del torneo» in Más and its offer on En vivo, at phone
 * widths, each sound (no uncaught error, nothing wider than the screen, no serious or critical axe violation).
 * The fixtures' `?push=` draws the switches as on such a phone, with no browser asked (the suite has no push
 * service). Then the flows: the offer comes only after this phone's first saved hole, in the installed app;
 * a tap on a notice moves the open app through its router, without a reload, so a half-entered hole stays; and
 * on the open Tarjeta it lands on the hole the notice names, or on the whole card to sign.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const PHONES = [375, 393]
const T = t.push.tournament

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)
}
/** Every animation that ends has ended: axe reads text caught mid-fade as low contrast. */
async function settled(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
}
async function expectSound(page: Page, pageErrors: string[]) {
  await settled(page)
  expect(pageErrors, 'uncaught errors').toEqual([])
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    'horizontal scroll (px)',
  ).toBeLessThanOrEqual(0)
  expect(await seriousViolations(page)).toEqual([])
}
/** The installed app: what `isStandalone()` reads on an iPhone. */
const installed = (page: Page) =>
  page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }),
  )
const offer = (page: Page) => page.getByRole('region', { name: T.title })
/** «Guardar hoyo» once the card has settled (a tap within 700 ms of a hole change is ignored, UX-02), and it saved. */
async function saveHole(page: Page) {
  const hole = Number(await page.locator('[class*="holeNum"]').first().textContent())
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: new RegExp(`^(${t.card.save}|${t.card.saveLast})$`) }).click()
  await expect(page.getByText(t.card.savedHole(hole), { exact: true })).toBeVisible()
}

for (const width of PHONES) {
  test(`Más: «Avisos del torneo» off, then on, at ${width}px`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height: 852 })
    await open(page, '/t/_/full12-live/mas?push=off')
    await expect(page.getByText(T.title, { exact: true })).toBeVisible()
    const enable = page.getByRole('button', { name: t.push.enable })
    await expect(enable).toBeVisible()
    await expect(page.locator('[data-legal-consent]')).toContainText('ligada a tu jugador')
    await expectSound(page, pageErrors)
    await enable.click()
    await expect(page.getByText(t.push.on)).toBeVisible()
    await expect(page.getByRole('button', { name: t.push.disable })).toBeVisible()
    await expectSound(page, pageErrors)
  })
}

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE })

  for (const width of PHONES) {
    test(`Más in Safari says to install first; blocked in the installed app, it says Ajustes, at ${width}px`, async ({
      page,
      pageErrors,
    }) => {
      await page.setViewportSize({ width, height: 852 })
      await open(page, '/t/_/full12-live/mas?push=needsInstall')
      await expect(page.getByText(t.push.needsInstall)).toBeVisible()
      await expectSound(page, pageErrors)
      await installed(page)
      await open(page, '/t/_/full12-live/mas?push=denied')
      await expect(page.getByText(t.push.deniedIos)).toBeVisible()
      await expect(page.getByRole('button', { name: t.push.enable })).toHaveCount(0)
      await expectSound(page, pageErrors)
    })
  }
})

for (const width of PHONES) {
  test(`En vivo offers them in the installed app after the first saved hole, never before, at ${width}px`, async ({
    page,
    pageErrors,
  }) => {
    await page.setViewportSize({ width, height: 852 })
    await installed(page)
    await open(page, '/t/_/full12-live?push=off')
    await expect(offer(page)).toHaveCount(0)
    // The Tarjeta: nothing offered over it, before or after the save.
    await page.getByRole('link', { name: t.nav.card }).click()
    await saveHole(page)
    await expect(page.getByText(T.title)).toHaveCount(0)
    await page.getByRole('link', { name: t.nav.live }).click()
    await expect(offer(page)).toBeVisible()
    await expectSound(page, pageErrors)
    await offer(page).getByRole('button', { name: t.push.enable }).click()
    await expect(offer(page)).toHaveCount(0)
    await page.getByRole('link', { name: t.nav.more }).click()
    await expect(page.getByText(t.push.on)).toBeVisible()
    expect(pageErrors, 'uncaught errors').toEqual([])
  })
}

test('«Ahora no» on En vivo puts the offer away for this tournament; Más keeps the switch', async ({
  page,
  pageErrors,
}) => {
  await installed(page)
  await open(page, '/t/_/full12-live/tarjeta?push=off')
  await saveHole(page)
  await page.getByRole('link', { name: t.nav.live }).click()
  await offer(page).getByRole('button', { name: T.later }).click()
  await expect(offer(page)).toHaveCount(0)
  await open(page, '/t/_/full12-live?push=off')
  await expect(offer(page)).toHaveCount(0)
  await page.getByRole('link', { name: t.nav.more }).click()
  await expect(page.getByRole('button', { name: t.push.enable })).toBeVisible()
  expect(pageErrors, 'uncaught errors').toEqual([])
})

/** What the service worker does on a tap (public/push-sw.js): it asks the open page to go to `path`, and the page answers. */
const tapNotice = (page: Page, path: string) =>
  page.evaluate(
    (to) =>
      new Promise((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = (e) => resolve(e.data)
        navigator.serviceWorker.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'navigate', url: `${location.origin}${to}` },
            ports: [channel.port2],
          }),
        )
      }),
    path,
  )

test('a tap on a notice moves the open app with its router: no reload, and the half-entered hole stays (PWA-12)', async ({
  page,
  pageErrors,
}) => {
  await open(page, '/t/_/full12-live/tarjeta')
  const hole = Number(await page.locator('[class*="holeNum"]').first().textContent())
  // A hole half entered: one player's strokes up, not saved.
  await page
    .getByRole('button', { name: new RegExp(`^${t.card.strokesOf('.+')}: ${t.common.stepUp}$`) })
    .first()
    .click()
  await page.evaluate(() => void ((window as unknown as { loadedOnce: boolean }).loadedOnce = true))
  expect(await tapNotice(page, '/t/_/full12-live/mas')).toEqual({ ok: true })
  await expect(page).toHaveURL(/\/t\/_\/full12-live\/mas$/)
  expect(
    await page.evaluate(() => (window as unknown as { loadedOnce?: boolean }).loadedOnce),
    'the page was not reloaded',
  ).toBe(true)
  // Back on the Tarjeta, the hole is as it was left.
  await page.getByRole('link', { name: t.nav.card }).click()
  await expect(page.locator('[class*="holeNum"]').first()).toHaveText(String(hole))
  await expect(page.getByText(t.card.restoredDraft)).toBeVisible()
  expect(pageErrors, 'uncaught errors').toEqual([])
})

test('a notice tapped on the open Tarjeta goes to the hole it names, or to the whole card to sign (PWA-10)', async ({
  page,
  pageErrors,
}) => {
  await open(page, '/t/_/full12-live/tarjeta')
  const holeNum = page.locator('[class*="holeNum"]').first()
  const target = Number(await holeNum.textContent()) === 3 ? 4 : 3
  // The snake's question names its hole.
  expect(await tapNotice(page, `/t/_/full12-live/tarjeta?hoyo=${target}`)).toEqual({ ok: true })
  await expect(holeNum).toHaveText(String(target))
  // A card to sign opens the grid, where «Firmar» is.
  expect(await tapNotice(page, '/t/_/full12-live/tarjeta?vista=tarjeta')).toEqual({ ok: true })
  await expect(page.getByRole('table')).toBeVisible()
  await expect(page.getByRole('button', { name: t.card.holeView, exact: true })).toBeVisible()
  expect(pageErrors, 'uncaught errors').toEqual([])
})
