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

test('Tarjeta: every control names its player, and the hole is a heading (A11Y-01)', async ({ page }) => {
  await open(page, '/t/_/full12-live/tarjeta')
  const tree = await page.locator('body').ariaSnapshot()
  const buttons = [...tree.matchAll(/- button "([^"]+)"/g)].map((m) => m[1]!)
  const dupes = buttons.filter((b, i) => buttons.indexOf(b) !== i)
  expect(dupes, 'buttons sharing a name').toEqual([])
  // Each of the four rows is a group named after its player, holding his five controls.
  const rows = page.getByRole('group').filter({ has: page.getByRole('button', { name: new RegExp(`^${t.card.pickedUp}, `) }) })
  await expect(rows).toHaveCount(4)
  for (const row of await rows.all()) {
    const name = (await row.getAttribute('aria-labelledby').then((id) => page.locator(`[id="${id}"]`).textContent()))!.trim()
    for (const label of [`Golpes de ${name}: menos`, `Golpes de ${name}: más`, `Putts de ${name}: menos`, `Putts de ${name}: más`, `${t.card.pickedUp}, ${name}`]) {
      await expect(row.getByRole('button', { name: label, exact: true })).toHaveCount(1)
    }
  }
  await expect(page.getByRole('heading', { level: 1, name: /^Hoyo \d+, par \d/ })).toBeVisible()
})

test('Player sheet: named after the player, with «Cerrar» that hands focus back (A11Y-02)', async ({ page }) => {
  await open(page, '/t/_/full12-live')
  const row = page.locator('button[class*="leaderRow"]').first()
  await row.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const name = (await dialog.getByRole('heading', { level: 2 }).first().textContent())!.trim()
  await expect(page.getByRole('dialog', { name })).toBeVisible()
  expect(name).not.toBe(t.common.dialog)
  await dialog.getByRole('button', { name: t.common.close }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row).toBeFocused()
})
