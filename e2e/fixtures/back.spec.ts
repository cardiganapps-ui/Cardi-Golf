/**
 * PWA-05: the system back ignored open sheets (it left the whole screen) and
 * threw away a half-entered hole. Now back closes the top sheet first, and
 * the Tarjeta keeps what was typed until it is saved.
 */
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

test('back closes the open sheet, then the nested one first, before leaving the screen (PWA-05)', async ({ page }) => {
  await open(page, '/fixture')
  await open(page, '/t/_/full12-live')
  const url = page.url()
  await page.locator('button[class*="leaderRow"]').first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toHaveCount(1)
  // A sheet inside the sheet: «¿Cómo se calculó?».
  await sheet.getByRole('button', { name: t.money.howCalculated }).first().click()
  await expect(page.getByRole('dialog')).toHaveCount(2)
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  expect(page.url()).toBe(url)
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(page.url()).toBe(url)
  await page.goBack()
  await expect(page).toHaveURL(/\/fixture$/)
})

test('a sheet closed with «Cerrar» leaves no step behind: the next back leaves the screen (PWA-05)', async ({ page }) => {
  await open(page, '/fixture')
  await open(page, '/t/_/full12-live')
  await page.locator('button[class*="leaderRow"]').first().click()
  await page.getByRole('dialog').getByRole('button', { name: t.common.close }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goBack()
  await expect(page).toHaveURL(/\/fixture$/)
})

test('Tarjeta: a half-entered hole is still there after back and forward (PWA-05)', async ({ page }) => {
  await open(page, '/t/_/full12-live')
  await page.getByRole('link', { name: new RegExp(`^${t.nav.card}`) }).click()
  const row = page.getByRole('group').filter({ has: page.getByRole('button', { name: new RegExp(`^${t.card.pickedUp}, `) }) }).first()
  const strokes = row.getByRole('group', { name: /^Golpes de / })
  const before = Number((await strokes.textContent())!.replace(/\D+/g, ''))
  const plus = row.getByRole('button', { name: /^Golpes de .*: más$/ })
  await plus.click()
  await plus.click()
  await expect(strokes).toContainText(String(before + 2))
  await page.goBack()
  await expect(page.getByRole('group', { name: /^Golpes de / })).toHaveCount(0)
  await page.goForward()
  await expect(row.getByRole('group', { name: /^Golpes de / })).toContainText(String(before + 2))
})

test('Tarjeta: «¿Seguro?» then «¿Quién embocó al último?»: the second sheet stays and the hole saves (PWA-05)', async ({ page }) => {
  await open(page, '/t/_/full12-live/tarjeta')
  const hole = page.locator('[class*="holeNum"]').first()
  const before = (await hole.textContent())!.trim()
  const rows = page.getByRole('group').filter({ has: page.getByRole('button', { name: new RegExp(`^${t.card.pickedUp}, `) }) })
  const a = rows.nth(0)
  const b = rows.nth(1)
  // A: two over and five putts (unusual: «¿Seguro?»). B: three putts. Two at three or more: «¿Quién embocó al último?».
  for (let i = 0; i < 2; i++) await a.getByRole('button', { name: /^Golpes de .*: más$/ }).click()
  for (let i = 0; i < 3; i++) await a.getByRole('button', { name: /^Putts de .*: más$/ }).click()
  await b.getByRole('button', { name: /^Putts de .*: más$/ }).click()
  await page.waitForTimeout(800) // past the double-tap guard
  await page.getByRole('button', { name: new RegExp(`^(${t.card.save}|${t.card.saveLast})$`) }).click()
  await page.getByRole('dialog', { name: t.card.weirdTitle }).getByRole('button', { name: t.card.weirdConfirm }).click()
  const tiebreak = page.getByRole('dialog', { name: t.card.whoHoledLast })
  await expect(tiebreak).toBeVisible()
  // Before, the first sheet's history step landed here and closed this one at once.
  await page.waitForTimeout(600)
  await expect(tiebreak).toBeVisible()
  await tiebreak.getByRole('button').filter({ hasNotText: t.common.close }).first().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(hole).not.toHaveText(before)
})

test('a link followed from inside a sheet leaves no dead back step behind (PWA-05)', async ({ page }) => {
  await open(page, '/fixture')
  await open(page, '/p/_/yo')
  const earned = page.locator('button[class*="awardOn"]')
  const n = await earned.count()
  let followed = false
  for (let i = 0; i < n && !followed; i++) {
    await earned.nth(i).click()
    const link = page.getByRole('dialog').getByRole('link').first()
    if (await link.count()) {
      await link.click()
      followed = true
    } else {
      await page.getByRole('dialog').getByRole('button', { name: t.common.close }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
  }
  expect(followed, 'a badge whose sheet links somewhere').toBe(true)
  await expect(page).not.toHaveURL(/\/p\/_\/yo$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/p\/_\/yo$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // One more back leaves the profile: no press is spent on the sheet's old step.
  await page.goBack()
  await expect(page).toHaveURL(/\/fixture$/)
})
