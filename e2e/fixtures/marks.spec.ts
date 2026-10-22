/**
 * VIS-28: the pencil notation in the player sheet's card. The marks were 30 px wide in 25–26 px hole columns, so
 * 17 of 19 neighbours overlapped and double squares fused into each other. Each mark is now as wide as its column
 * allows (square, up to 30 px, the figure at about 0.55 of it): no two marks of a nine may touch, at 360 px and
 * the two phone widths, and every mark stays square and inside its own cell.
 */
import { expect, open, test } from './base'

for (const width of [360, 375, 393]) {
  test(`the player sheet's pencil marks never touch at ${width}px (VIS-28)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await open(page, '/t/_/full12-live')
    await page.locator('button[class*="_leaderRow_"]').first().click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.locator('table').first()).toBeVisible()
    const report = await sheet.evaluate((root) => {
      const out = { pairs: 0, touching: [] as string[], notSquare: [] as string[], outside: [] as string[], marks: 0 }
      for (const table of Array.from(root.querySelectorAll('table'))) {
        const marks = Array.from(table.querySelectorAll<HTMLElement>('[role="img"][class*="_mark_"]'))
        out.marks += marks.length
        const boxes = marks.map((m) => ({
          m,
          r: m.getBoundingClientRect(),
          cell: m.closest('td')!.getBoundingClientRect(),
        }))
        for (const { m, r, cell } of boxes) {
          if (Math.abs(r.width - r.height) > 0.5)
            out.notSquare.push(`${m.getAttribute('aria-label')}: ${r.width.toFixed(1)}×${r.height.toFixed(1)}`)
          if (r.left < cell.left - 0.5 || r.right > cell.right + 0.5)
            out.outside.push(`${m.getAttribute('aria-label')}`)
        }
        for (let i = 1; i < boxes.length; i++) {
          const a = boxes[i - 1].r
          const b = boxes[i].r
          if (Math.abs(a.top - b.top) > 2) continue
          out.pairs++
          if (b.left - a.right < 0)
            out.touching.push(
              `${(b.left - a.right).toFixed(1)} px between ${boxes[i - 1].m.getAttribute('aria-label')} and ${boxes[i].m.getAttribute('aria-label')}`,
            )
        }
      }
      return out
    })
    expect(report.marks, 'marks measured').toBeGreaterThanOrEqual(18)
    expect(report.pairs, 'neighbouring marks measured').toBeGreaterThanOrEqual(16)
    expect(report.touching, 'neighbouring marks that intersect').toEqual([])
    expect(report.notSquare, 'marks that are not square').toEqual([])
    expect(report.outside, 'marks wider than their column').toEqual([])
  })
}
