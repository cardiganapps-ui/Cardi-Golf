/**
 * The Tarjeta's moments in a real browser (MOT-02): a save slides the next
 * hole in from the side and rests on «Guardado»; a swipe moves the hole under
 * the finger, springs back when it isn't one, and goes when it is. Before,
 * every value swapped in one frame and nothing moved until the finger lifted.
 */
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

test('Tarjeta: a save slides the next hole in and rests on «Guardado» (MOT-02)', async ({ page }) => {
  await open(page, '/t/_/full12-live/tarjeta')
  const hole = page.locator('[class*="holeNum"]').first()
  const before = Number(await hole.textContent())
  const save = page.getByRole('button', { name: new RegExp(`^(${t.card.save}|${t.card.saveLast})$`) })
  await save.scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  // Every frame for 600 ms after the tap: where the rows are, and how visible.
  await page.locator('[class*="_players_"]').first().evaluate((el) => {
    const w = window as unknown as { samples: Array<[number, number]> }
    w.samples = []
    const t0 = performance.now()
    const tick = () => {
      const m = getComputedStyle(el).transform
      w.samples.push([m === 'none' ? 0 : new DOMMatrix(m).m41, Number(getComputedStyle(el).opacity)])
      if (performance.now() - t0 < 600) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await save.tap()
  await expect(page.getByText(t.card.savedCheck, { exact: true })).toBeVisible()
  await expect(hole).toHaveText(String(before + 1))
  await page.waitForTimeout(700)
  const samples = await page.evaluate(() => (window as unknown as { samples: Array<[number, number]> }).samples)
  // The next hole came in from the right, faded up, and settled where it belongs.
  expect(samples.some(([x]) => x > 4), `rows offset during the slide: ${JSON.stringify(samples.slice(0, 12))}`).toBe(true)
  expect(samples.some(([, o]) => o < 1)).toBe(true)
  expect(samples.at(-1)).toEqual([0, 1])
  await expect(page.getByText(t.card.savedCheck, { exact: true })).toHaveCount(0)
})

test('Tarjeta: a swipe moves the hole under the finger, springs back if short, goes if long (MOT-02)', async ({ page }) => {
  await open(page, '/t/_/full12-live/tarjeta')
  const hole = page.locator('[class*="holeNum"]').first()
  const before = Number(await hole.textContent())
  const rows = page.locator('[class*="_players_"]').first()
  const box = (await rows.boundingBox())!
  const y = box.y + Math.min(80, box.height / 2)
  const x0 = box.x + box.width * 0.7
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x == null ? [] : [{ x, y }] })
  // 60 px, held: the rows follow the finger, and spring back when it lets go slowly.
  await touch('touchStart', x0)
  for (const dx of [12, 24, 40, 60]) await touch('touchMove', x0 - dx)
  await page.waitForTimeout(60)
  expect(await rows.evaluate((el) => (el.parentElement ? new DOMMatrix(getComputedStyle(el.parentElement).transform === 'none' ? '' : getComputedStyle(el.parentElement).transform).m41 : 0))).toBeLessThan(-40)
  await page.waitForTimeout(400)
  await touch('touchEnd')
  await page.waitForTimeout(400)
  await expect(hole).toHaveText(String(before))
  expect(await rows.evaluate((el) => (el.parentElement ? new DOMMatrix(getComputedStyle(el.parentElement).transform === 'none' ? '' : getComputedStyle(el.parentElement).transform).m41 : 0))).toBe(0)
  // 120 px: the next hole.
  await touch('touchStart', x0)
  for (const dx of [20, 50, 90, 120]) await touch('touchMove', x0 - dx)
  await touch('touchEnd')
  await expect(hole).toHaveText(String(before + 1))
})
