/**
 * UX-24: on a phone the Comité's sections are one row that scrolls sideways,
 * and the section open could be off its edge: Calcutta night opened on a row
 * that ended at «Grupos», with «Calcutta» two swipes away and nothing saying
 * where the Comité was. The open section is brought into view in the row, and
 * the page itself doesn't move.
 */
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

for (const width of [375, 393]) {
  for (const section of ['calcutta', 'parejas', 'historial', 'datos']) {
    test(`at ${width} px, «${section}» open is in view in the row of sections`, async ({ page, pageErrors }) => {
      await page.setViewportSize({ width, height: 852 })
      await open(page, `/t/_/full12-live/admin/${section}`)
      const nav = page.getByRole('navigation', { name: t.admin.sectionsLabel })
      const active = nav.locator('[aria-current="page"]')
      await expect(active).toHaveCount(1)
      const row = (await nav.boundingBox())!
      const tab = (await active.boundingBox())!
      expect(tab.x, 'its left edge is inside the row').toBeGreaterThanOrEqual(row.x - 1)
      expect(tab.x + tab.width, 'its right edge is inside the row').toBeLessThanOrEqual(row.x + row.width + 1)
      // The row scrolled, not the page.
      expect(await page.evaluate(() => [window.scrollX, document.scrollingElement!.scrollLeft])).toEqual([0, 0])
      expect(pageErrors).toEqual([])
    })
  }
}

test('tapping a section keeps it in view, and the first one brings the row back to its start', async ({ page }) => {
  await open(page, '/t/_/full12-live/admin/datos')
  const nav = page.getByRole('navigation', { name: t.admin.sectionsLabel })
  await nav.getByRole('link', { name: t.admin.sections.history }).click()
  await expect(page).toHaveURL(/\/admin\/historial$/)
  const row = (await nav.boundingBox())!
  const tab = (await nav.locator('[aria-current="page"]').boundingBox())!
  expect(tab.x).toBeGreaterThanOrEqual(row.x - 1)
  expect(tab.x + tab.width).toBeLessThanOrEqual(row.x + row.width + 1)
  // The first section, scrolled to by hand and tapped, leaves the row at its start.
  await nav.evaluate((el) => (el.scrollLeft = 0))
  await nav.getByRole('link', { name: t.admin.sections.tournament }).click()
  await expect(page).toHaveURL(/\/admin\/torneo$/)
  expect(await nav.evaluate((el) => el.scrollLeft)).toBe(0)
})
