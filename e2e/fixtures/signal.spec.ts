/**
 * MOT-17: losing the signal put a banner above the Tarjeta and every stepper
 * jumped 37 px under the thumb, and again when it came back. The tournament's
 * header says «Sin señal» in place now, and nothing on the card moves.
 */
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

test('the signal going and coming back moves nothing on the Tarjeta (MOT-17)', async ({ page, context }) => {
  await open(page, '/t/_/full12-live/tarjeta')
  // The second player's «+» for strokes, where the review measured it jump (357 → 394 px).
  const plus = page
    .locator(`[role="group"][aria-label^="${t.card.strokesOf('')}"]`)
    .nth(1)
    .getByRole('button')
    .last()
  await expect(plus).toBeVisible()
  const save = page.getByRole('button', { name: new RegExp(`^(${t.card.save}|${t.card.saveLast})`) }).first()
  const where = async () => ({ plus: await plus.boundingBox(), save: await save.boundingBox() })
  const before = await where()

  await context.setOffline(true)
  await expect(page.getByText(t.sync.offlineShort).first()).toBeVisible()
  await expect(page.getByText(t.sync.offline)).toHaveCount(0)
  expect(await where()).toEqual(before)

  await context.setOffline(false)
  await expect(page.getByText(t.sync.offlineShort)).toHaveCount(0)
  expect(await where()).toEqual(before)
})
