/**
 * The flows the 2026-09-30 review found broken, in a real browser at human
 * speed. Each one failed before its fix.
 */
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

test('Comité: a player sheet keeps every character typed at 100 ms a key (UX-01)', async ({ page }) => {
  await open(page, '/t/_/full12-live/admin/jugadores')
  await page.getByRole('button', { name: t.admin.players.add }).click()
  const name = page.getByRole('dialog').getByLabel(t.admin.players.fullName)
  await name.click()
  await name.pressSequentially('Camilo Duarte', { delay: 100 })
  await expect(name).toHaveValue('Camilo Duarte')
})

test('Tarjeta: a double tap on «Guardar hoyo» saves one hole, and nothing covers the button (UX-02, PWA-01)', async ({ page }) => {
  await open(page, '/t/_/full12-live/tarjeta')
  const hole = page.locator('[class*="holeNum"]').first()
  const before = Number(await hole.textContent())
  const save = page.getByRole('button', { name: new RegExp(`^(${t.card.save}|${t.card.saveLast})$`) })
  await save.scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  const box = (await save.boundingBox())!
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.touchscreen.tap(centre.x, centre.y)
  await page.waitForTimeout(250)
  await page.touchscreen.tap(centre.x, centre.y)
  await page.waitForTimeout(500)
  await expect(hole).toHaveText(String(before + 1))
  await expect(page.getByText(t.card.savedHole(before))).toBeVisible()
  // The saved note sits under the button: the button has not moved and is what a thumb hits.
  const after = (await save.boundingBox())!
  expect(Math.round(after.y - box.y)).toBe(0)
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent ?? null, centre)
  expect(hit).toMatch(new RegExp(`^(${t.card.save}|${t.card.saveLast})$`))
})

test('Dinero: once final, the settlement asks only for what is still owed (MONEY-01)', async ({ page }) => {
  await open(page, '/t/_/full12-finished/dinero')
  await page.getByRole('radio', { name: t.moneyScreen.final }).click()
  // Camilo: $13,200 of prizes and Calcutta, minus the $3,000 lot he has not paid. His entry is paid.
  const camilo = page.locator('[class*="_transfer_"]').filter({ hasText: /Banco\s+paga a\s+Camilo/ })
  await expect(camilo).toContainText('$10,200')
  // The collection list is gone once final: showing both would ask for the same peso twice.
  await expect(page.getByRole('heading', { name: t.moneyScreen.checklist })).toHaveCount(0)
})

test('Más names the build the phone runs (PWA-03)', async ({ page }) => {
  await open(page, '/t/_/full12-live/mas')
  await expect(page.getByText(new RegExp(`^${t.more.version} .+ · \\w+$`))).toBeVisible()
})
