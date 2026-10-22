/**
 * UX-23: a tournament that signs each player's card by marker (`firma4`: four
 * players, Stableford only, the day captured to the last hole, Beto's card
 * signed). The whole card, as the notice opens it (`?vista=tarjeta`): this
 * phone's player is offered the cards of the two teammates still unsigned,
 * never his own; signing one asks first, then stamps it. At 375 and 393 px,
 * with the suite's checks: no uncaught error, no horizontal scroll, no
 * serious or critical axe violation.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const S = t.card

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)
}
/** Every animation that ends (a sheet sliding up, the stamp) has ended: axe reads text caught mid-fade as low contrast. */
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
const signButtons = (page: Page) => page.getByRole('button', { name: /^Firmar la tarjeta de / })

for (const width of [375, 393]) {
  test(`a marker signs a teammate’s card, never his own, at ${width}px`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height: 852 })
    await open(page, '/t/_/firma4/tarjeta?vista=tarjeta')
    await expect(page.getByText(S.signMarkerHint)).toBeVisible()
    // Beto's card is signed; the phone's own player is never offered his: two left.
    await expect(signButtons(page)).toHaveCount(2)
    await expect(page.getByText(S.stamp, { exact: true })).toHaveCount(1)
    await expectSound(page, pageErrors)

    const first = signButtons(page).first()
    const label = (await first.getAttribute('aria-label'))!
    await first.click()
    const dialog = page.getByRole('dialog', { name: label })
    await expect(dialog.getByText(S.signPlayerConfirm)).toBeVisible()
    await expectSound(page, pageErrors)
    await dialog.getByRole('button', { name: S.sign }).click()
    await expect(dialog).toHaveCount(0)
    await expect(signButtons(page)).toHaveCount(1)
    await expect(page.getByText(S.stamp, { exact: true })).toHaveCount(2)
    await expectSound(page, pageErrors)
  })
}
