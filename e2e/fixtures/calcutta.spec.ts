/**
 * The console's hat draw in a real browser (MOT-05): «Sortear el orden» used to
 * swap the list into its new order in one frame. Now each row moves to its new
 * place over the board's time, a beat after the row above, and settles there.
 */
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

test('«Sortear el orden» shuffles the lot order into place (MOT-05)', async ({ page }) => {
  await open(page, '/t/_/calcutta12/admin/calcutta')
  const rows = page.locator('ol li')
  await expect(rows).toHaveCount(12)
  const before = await rows.allTextContents()
  // Every frame for 1.2 s after the tap: how far each row is from its place.
  await page
    .locator('ol')
    .first()
    .evaluate((list) => {
      const w = window as unknown as { offsets: number[][] }
      w.offsets = []
      const t0 = performance.now()
      const tick = () => {
        w.offsets.push(
          Array.from(list.children).map((li) => {
            const m = getComputedStyle(li).transform
            return m === 'none' ? 0 : Math.abs(new DOMMatrix(m).m42)
          }),
        )
        if (performance.now() - t0 < 1200) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  await page.getByRole('button', { name: t.auction.drawOrder }).tap()
  await page.waitForTimeout(1400)
  const offsets = await page.evaluate(() => (window as unknown as { offsets: number[][] }).offsets)
  expect(await rows.allTextContents()).not.toEqual(before)
  // Rows were seen between places, more than one of them, and every one ends where it belongs.
  const moving = offsets.filter((frame) => frame.filter((dy) => dy > 2).length > 1)
  expect(moving.length, `frames with rows on their way: ${JSON.stringify(offsets.slice(0, 8))}`).toBeGreaterThan(5)
  expect(offsets.at(-1)!.every((dy) => dy < 0.5)).toBe(true)
})
