/**
 * The TV at room sizes (VIS-03, VIS-04, MOT-04).
 * - Every player appears on some page of the Individual board, fully on screen.
 *   Before, 12 rows were sliced per page and only 9 fit, so last place never
 *   showed.
 * - The Matrimonios and Calcutta rows use their own columns. Before, the names
 *   landed in the avatar track and the totals stopped 200 px short of the edge.
 * - On Calcutta night the newest sale is the first row of the sold list, on
 *   screen.
 */
import { t } from '../../src/i18n/es-MX'
import { expect, test } from './base'

const ROOMS: Array<[number, number]> = [
  [1920, 1080],
  [1280, 720],
]

for (const fixture of ['full12-finished', 'large60']) {
  for (const [w, h] of ROOMS) {
    test(`${fixture} at ${w}×${h}: every player appears on some page of the Individual board (VIS-03)`, async ({ page }) => {
      test.setTimeout(120_000)
      // The rotation runs on a fake clock. Only the Individual board is read, and
      // it pages in place each time the rotation comes back to it.
      await page.clock.install()
      await page.setViewportSize({ width: w, height: h })
      await page.goto(`/t/_/${fixture}/tv`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      // «Individual 1–9 de 12»: the field size is on the board.
      const title = (await page.locator('section h2').first().textContent()) ?? ''
      const total = Number(/de (\d+)$/.exec(title.trim())?.[1])
      expect(total, `a paged title, got «${title}»`).toBeGreaterThan(0)
      const seen = new Set<string>()
      for (let tick = 0; tick < 80 && seen.size < total; tick++) {
        const rows = await page.locator('[data-player]').evaluateAll((els) =>
          els.map((el) => ({ id: el.getAttribute('data-player')!, bottom: el.getBoundingClientRect().bottom, inside: el.getBoundingClientRect().bottom <= window.innerHeight })),
        )
        for (const r of rows) expect(r.inside, `row ${r.id} fully on screen (bottom ${Math.round(r.bottom)})`).toBe(true)
        rows.forEach((r) => seen.add(r.id))
        await page.clock.runFor(12_000)
        await page.waitForTimeout(100)
      }
      expect(seen.size).toBe(total)
    })
  }
}

test('Matrimonios and Calcutta boards: names in full, totals at the right edge (VIS-04)', async ({ page }) => {
  // Real time: the boards rotate every 12 s and their transitions run on the browser's own clock.
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/t/_/full12-live/tv', { waitUntil: 'networkidle' })
  for (const which of ['rowPair', 'rowOwner']) {
    await expect(page.locator(`section [class*="_${which}_"]`).first()).toBeVisible({ timeout: 40_000 })
    await page.waitForTimeout(800)
    const rows = await page.locator(`section [class*="_row_"][class*="_${which}_"]`).evaluateAll((els) =>
      els.map((row) => {
        const box = row.getBoundingClientRect()
        const cells = Array.from(row.children) as HTMLElement[]
        const name = row.querySelector('[class*="_name_"]') as HTMLElement
        const big = cells[cells.length - 1]!
        return {
          nameLeft: name.getBoundingClientRect().left - box.left,
          clipped: Array.from(name.children).some((c) => (c as HTMLElement).scrollWidth > (c as HTMLElement).clientWidth + 1),
          gapRight: box.right - big.getBoundingClientRect().right,
        }
      }),
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.nameLeft, `${which}: the name starts after the first column`).toBeGreaterThan(40)
      expect(r.clipped, `${which}: names and partners are not cut`).toBe(false)
      expect(r.gapRight, `${which}: the total sits at the right edge`).toBeLessThan(40)
    }
    if (which === 'rowOwner') {
      await expect(page.getByText(t.tv.invested, { exact: true })).toBeVisible()
      await expect(page.getByText(t.tv.worth, { exact: true })).toBeVisible()
    }
  }
})

for (const [w, h] of ROOMS) {
  test(`Calcutta night at ${w}×${h}: the newest sale is the first sold row, on screen (MOT-04)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/t/_/auction12/tv', { waitUntil: 'networkidle' })
    const rows = page.locator('[data-sold-at]')
    const times = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-sold-at') ?? ''))
    expect(times.length).toBe(9)
    expect(times[0]).toBe([...times].sort().at(-1))
    const box = (await rows.first().boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(h)
  })
}
