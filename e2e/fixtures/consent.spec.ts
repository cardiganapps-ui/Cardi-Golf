/**
 * TRUST-05: where someone gives their data, the terms and the notice are a
 * tap away and on the screen before the action, on a small phone. The real
 * screens on the fixtures; each test failed before its fix.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const C = t.legal.consent
const SMALL_PHONES = [
  [375, 667],
  [320, 568],
] as const

/** On the screen as it is: nothing to scroll before reading it. */
async function expectOnScreen(page: Page, el: Locator) {
  await expect(el).toBeVisible()
  const box = (await el.boundingBox())!
  const view = page.viewportSize()!
  expect(box.y, 'top edge').toBeGreaterThanOrEqual(0)
  expect(box.y + box.height, 'bottom edge').toBeLessThanOrEqual(view.height)
}

/** `a` comes before `b` in reading and keyboard order. */
async function expectBefore(a: Locator, b: Locator) {
  const other = await b.elementHandle()
  expect(await a.evaluate((x, y) => !!(x.compareDocumentPosition(y!) & Node.DOCUMENT_POSITION_FOLLOWING), other)).toBe(true)
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)
}

for (const [width, height] of SMALL_PHONES) {
  test(`face grid, 12 players at ${width}×${height}: «${C.enterStart}…» on the first screen and on the PIN step`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height })
    await open(page, '/t/_/full12-live?as=new-phone')
    const faces = page.locator('button[class*="_face_"]')
    await expect(faces).toHaveCount(12)
    const line = page.locator('[data-legal-consent]')
    await expect(line).toHaveCount(1)
    await expectOnScreen(page, line)
    await expectBefore(line, faces.first())
    await expect(line).toHaveText(`${C.enterStart}${C.termsShort} ${t.legal.newTab}${C.middle}${C.privacy} ${t.legal.newTab}${C.end}`)
    await expect(line.getByRole('link', { name: new RegExp(`^${C.termsShort}`) })).toHaveAttribute('href', /^\/terminos(\?|$)/)
    await expect(line.getByRole('link', { name: new RegExp(`^${C.privacy}`) })).toHaveAttribute('href', /^\/privacidad(\?|$)/)
    expect(await seriousViolations(page)).toEqual([])

    // The PIN step: claim_player runs on the fourth digit, so the line is above the field.
    await faces.first().click()
    const pin = page.getByLabel(t.enter.pin, { exact: true })
    await expect(pin).toBeFocused()
    await expect(line).toHaveCount(1)
    await expectOnScreen(page, line)
    await expectBefore(line, pin)
    // The field takes focus as the step opens: a screen reader hears the line with it.
    await expect(pin).toHaveAccessibleDescription(new RegExp(`${C.enterStart}${C.termsShort}`))
    expect(await seriousViolations(page)).toEqual([])
    expect(pageErrors, 'uncaught errors').toEqual([])
  })
}
