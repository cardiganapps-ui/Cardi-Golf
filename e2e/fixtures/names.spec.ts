/**
 * What a screen reader hears on the main screens (A11Y-22, A11Y-25). Every switch has a name (Puntos/Gross and
 * Dinero's were bare radiogroups); no «¿Cómo se calculó?» is named by a figure or «?» alone; «SI» is never said as
 * its letters (a Spanish voice reads «sí»); the printed card has no empty header.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const SCREENS = [
  '/t/_/full12-live',
  '/t/_/full12-live/juegos',
  '/t/_/full12-live/dinero',
  '/t/_/full12-live/stats',
  '/t/_/full12-live/tarjeta',
  '/t/_/full12-live/imprimir',
  '/t/_/full12-live/admin/torneo',
  '/t/_/full12-live/admin/handicaps',
  '/t/_/full12-live/admin/juegos',
  '/t/_/full12-finished/dinero',
]

/** Each switch on screen and the name it is said with (aria-labelledby first, as a browser reads it). */
async function switches(page: Page) {
  return page.locator('[role="radiogroup"], [role="tablist"]').evaluateAll((els) =>
    els.map((el) => {
      const by = el.getAttribute('aria-labelledby')
      const name = by
        ? by
            .split(' ')
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ')
        : (el.getAttribute('aria-label') ?? '')
      return {
        name: name.trim(),
        options: Array.from(el.querySelectorAll('[role="radio"], [role="tab"]'), (o) => o.textContent?.trim()).join(
          '/',
        ),
      }
    }),
  )
}

/** Every «¿Cómo se calculó?» on screen, with its name. */
async function triggers(page: Page) {
  return page
    .locator('button[aria-haspopup="dialog"][class*="_trigger_"]')
    .evaluateAll((els) => els.map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()))
}

const HOW = t.money.howCalculated

for (const path of SCREENS) {
  test(`${path}: every switch has a name, every «¿Cómo se calculó?» says what it explains (A11Y-22, A11Y-25)`, async ({
    page,
    pageErrors,
  }) => {
    await open(page, path)
    const seen = await switches(page)
    expect(
      seen.filter((s) => !s.name),
      'switches with no name',
    ).toEqual([])
    const named = await triggers(page)
    expect(
      named.filter((n) => !n.endsWith(HOW)),
      'triggers named by a figure alone',
    ).toEqual([])
    // A figure shown is said with what it is: never the amount or «?» followed by the words alone.
    expect(named.filter((n) => /^(\$[\d,]+|\?)?:? ?¿Cómo/.test(n) && n !== HOW)).toEqual([])
    expect(pageErrors, 'uncaught errors').toEqual([])
  })
}

test('Juegos: on every game the triggers say what they explain (A11Y-25)', async ({ page }) => {
  await open(page, '/t/_/full12-live/juegos')
  // The list of games first; a game's board has the others as tabs.
  await page.locator('[data-game]').first().click()
  const tabs = page.getByRole('tablist', { name: t.nav.games }).getByRole('tab')
  const count = await tabs.count()
  expect(count).toBeGreaterThan(2)
  let checked = 0
  for (let i = 0; i < count; i++) {
    await tabs.nth(i).click()
    const named = await triggers(page)
    checked += named.length
    expect(
      named.filter((n) => !n.endsWith(HOW)),
      `${await tabs.nth(i).textContent()}: triggers named by a figure alone`,
    ).toEqual([])
  }
  // The Calcutta's slots and the countback's ties are among them: the list is not empty by accident.
  expect(checked).toBeGreaterThan(3)
})

test('«SI» is said as «índice de golpe» on the Tarjeta, the player sheet and the printed card (A11Y-22)', async ({
  page,
}) => {
  await open(page, '/t/_/full12-live/tarjeta?vista=tarjeta')
  const spoken = async () => page.locator('main').ariaSnapshot()
  expect(await spoken()).not.toMatch(/\bSI\b/)
  expect(await spoken()).toContain(t.player.siSpoken)

  await open(page, '/t/_/full12-live/imprimir')
  expect(await spoken()).not.toMatch(/\bSI\b/)
  // Each row of the card's head says what it is, and no header is left empty (axe's empty-table-header).
  const axe = await new AxeBuilder({ page })
    .withRules(['empty-table-header', 'td-headers-attr', 'th-has-data-cells'])
    .analyze()
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  // The stroke dots are said as strokes, not «viñeta».
  const dots = page.locator('td [role="img"]').first()
  await expect(dots).toHaveAccessibleName(/golpes? de ventaja/)
})

test('Comité › Campos: each box of a card says its hole, and «SI» in words (A11Y-22)', async ({ page }) => {
  await open(page, '/t/_/full12-live/admin/campos')
  await page.getByRole('button', { name: t.admin.courses.manual }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('textbox', { name: t.admin.courses.siOf(1), exact: true })).toBeVisible()
  await expect(sheet.getByRole('textbox', { name: t.admin.courses.parOf(18), exact: true })).toBeVisible()
  await expect(sheet.getByRole('textbox', { name: t.admin.courses.yardsOf(9), exact: true })).toBeVisible()
  expect(await sheet.ariaSnapshot()).not.toMatch(/\bSI\b/)
})
