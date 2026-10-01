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

test('Comité › Campos (and /campos, the same screen): who reads a scorecard photo, before «Subir tarjeta»', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await open(page, '/t/_/full12-live/admin/campos')
  const note = page.locator('[data-legal-consent]')
  await expect(note).toHaveCount(1)
  await expect(note).toContainText('Anthropic')
  await expect(note.getByRole('link', { name: new RegExp(`^${t.legal.scorecardNote.privacy}`) })).toHaveAttribute('href', /^\/privacidad(\?|$)/)
  const upload = page.getByRole('button', { name: t.admin.courses.photo, exact: true })
  await expectOnScreen(page, note)
  await expectBefore(note, upload)
  await expect(upload).toHaveAccessibleDescription(/Anthropic/)
  expect(await seriousViolations(page)).toEqual([])
  expect(pageErrors, 'uncaught errors').toEqual([])
})

for (const [width, height] of SMALL_PHONES) {
  test(`/entrar with Google at ${width}×${height}: the line on the first screen, before Google and the email (P3)`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height })
    // Registered after the fixture's catch-all, so it answers first: Google sign-in is on.
    await page.route(/\/auth\/v1\/settings/, (r) => r.fulfill({ json: { external: { google: true, email: true } } }))
    await open(page, '/entrar')
    const google = page.getByRole('button', { name: new RegExp(t.account.google) })
    await expect(google).toBeVisible()
    const line = page.locator('[data-legal-consent]')
    await expect(line).toHaveCount(1)
    await expectOnScreen(page, line)
    await expectBefore(line, google)
    await expectBefore(line, page.getByLabel(t.account.email))
    await expectBefore(line, page.getByRole('button', { name: t.account.sendCode }))
    // Keyboard order too: the line's two links come before the first way in.
    await page.keyboard.press('Tab')
    const order: string[] = []
    for (let i = 0; i < 6; i++) {
      order.push(await page.evaluate(() => document.activeElement?.getAttribute('href') ?? document.activeElement?.textContent?.trim() ?? ''))
      await page.keyboard.press('Tab')
    }
    const google_ = order.findIndex((x) => x.includes(t.account.google))
    expect(order.findIndex((x) => x.startsWith('/terminos')), order.join(' | ')).toBeLessThan(google_)
    expect(order.findIndex((x) => x.startsWith('/privacidad')), order.join(' | ')).toBeLessThan(google_)
    expect(await seriousViolations(page)).toEqual([])
    expect(pageErrors, 'uncaught errors').toEqual([])
  })
}

test('Comité, a new player: the field that takes focus is described by the notice above it (P3)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await open(page, '/t/_/full12-live/admin/jugadores')
  await page.getByRole('button', { name: t.admin.players.add }).click()
  const name = page.getByRole('dialog').getByLabel(t.admin.players.fullName)
  await expect(name).toBeFocused()
  await expect(name).toHaveAccessibleDescription(new RegExp(`^${t.legal.othersData.start}`))
})

test('a page opened from a consent link offers to close its tab, and closing it leaves the form as it was (P3)', async ({ page, pageErrors }) => {
  // The new tab is a page of its own: answer its Supabase calls too.
  await page.context().route(/supabase\.co|\/rest\/v1\/|\/auth\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await open(page, '/entrar')
  const email = page.getByLabel(t.account.email)
  await email.fill('medio@escri')
  const [tab] = await Promise.all([page.waitForEvent('popup'), page.locator('[data-legal-consent]').getByRole('link', { name: new RegExp(`^${C.privacy}`) }).click()])
  await expect(tab.getByRole('heading', { level: 1, name: t.legal.privacy.title })).toBeVisible()
  await expect(tab.getByRole('link', { name: t.legal.back })).toHaveCount(0)
  // Across to the terms, still in that tab: it replaces the page, so the tab can still close.
  await tab.getByRole('link', { name: t.legal.terms.title }).click()
  await expect(tab.getByRole('heading', { level: 1, name: t.legal.terms.title })).toBeVisible()
  const closed = tab.waitForEvent('close')
  await tab.getByRole('button', { name: t.legal.close }).click()
  await closed
  await expect(email).toHaveValue('medio@escri')
  expect(pageErrors, 'uncaught errors').toEqual([])
})
