/**
 * PWA-08 and PWA-09 on the phones they are for. The suite's own browser reads as a laptop, and a laptop is
 * shown nothing, so without this no screen here ever drew the install card or the iPhone's lines. Each
 * screen as an iPhone's Safari and as Android's Chrome: what it says is there, nothing is wider than the
 * screen, no serious or critical axe violation, no uncaught error. Then the two flows a phone does: Chrome's
 * offer becomes one tap, and a pasted invitation goes to its tournament (the field read «HTTPS»).
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
const PHONES = [375, 393]

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)
}
/** Every animation that ends (a sheet sliding up, a fade) has ended: axe reads text caught mid-fade as low contrast. */
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
const card = (page: Page) => page.getByRole('region', { name: t.install.title })

test.describe('on an iPhone', () => {
  test.use({ userAgent: IPHONE })

  for (const width of PHONES) {
    test(`Home and En vivo show the iPhone’s steps at ${width}px`, async ({ page, pageErrors }) => {
      await page.setViewportSize({ width, height: 852 })
      for (const path of ['/', '/t/_/full12-live']) {
        await open(page, path)
        await expect(card(page)).toBeVisible()
        await expect(card(page).getByText(t.install.ios)).toBeVisible()
        await expect(card(page).getByText(t.install.android)).toHaveCount(0)
        await expectSound(page, pageErrors)
      }
    })

    test(`Entrar says to install first, and the Tarjeta to capture from the icon, at ${width}px`, async ({
      page,
      pageErrors,
    }) => {
      await page.setViewportSize({ width, height: 852 })
      await open(page, '/t/_/full12-live?as=new-phone')
      await expect(page.getByText(t.install.iosFirst, { exact: false })).toBeVisible()
      await page.getByRole('button', { name: t.install.iosFirstHow }).click()
      await expect(page.getByText(t.install.ios)).toBeVisible()
      await expectSound(page, pageErrors)
      await open(page, '/t/_/full12-live/tarjeta')
      await expect(page.getByText(t.install.iosCard)).toBeVisible()
      await expectSound(page, pageErrors)
    })
  }
})

test.describe('on an Android phone', () => {
  test.use({ userAgent: ANDROID })

  for (const width of PHONES) {
    test(`En vivo shows the menu’s way, and Más keeps the steps, at ${width}px`, async ({ page, pageErrors }) => {
      await page.setViewportSize({ width, height: 852 })
      await open(page, '/t/_/full12-live')
      await expect(card(page).getByText(t.install.android)).toBeVisible()
      await expectSound(page, pageErrors)
      await open(page, '/t/_/full12-live/mas')
      await page.getByRole('button', { name: t.install.howTo }).click()
      await expect(page.getByRole('dialog', { name: t.install.howTo }).getByText(t.install.android)).toBeVisible()
      await expectSound(page, pageErrors)
    })
  }

  test('Chrome’s install offer is one tap on En vivo, and single-use', async ({ page, pageErrors }) => {
    await open(page, '/t/_/full12-live')
    await page.evaluate(() => {
      const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () =>
          void ((window as unknown as { prompted: number }).prompted =
            ((window as unknown as { prompted?: number }).prompted ?? 0) + 1),
        userChoice: Promise.resolve({ outcome: 'dismissed' }),
      })
      window.dispatchEvent(offer)
    })
    await card(page).getByRole('button', { name: t.install.installButton }).click()
    expect(await page.evaluate(() => (window as unknown as { prompted?: number }).prompted)).toBe(1)
    // Chrome's offer is spent: the menu's way again.
    await expect(card(page).getByText(t.install.android)).toBeVisible()
    expect(pageErrors, 'uncaught errors').toEqual([])
  })
})

test('a pasted invitation goes to its tournament (PWA-09)', async ({ page, pageErrors }) => {
  await open(page, '/')
  const field = page.getByLabel(t.home.joinPlaceholder)
  await field.fill('Nacho’s Bachelor: entra con el código NACHO1 https://golf.cardigan.mx/t/nachos-bachelor')
  await page.getByRole('button', { name: t.home.joinButton }).click()
  await expect(page).toHaveURL(/\/t\/nachos-bachelor$/)
  expect(pageErrors, 'uncaught errors').toEqual([])
})
