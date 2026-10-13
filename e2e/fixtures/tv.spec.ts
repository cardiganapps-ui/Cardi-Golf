/**
 * The TV at room sizes (VIS-03, VIS-04, MOT-04, VIS-05).
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
      // At the room's type (VIS-05) a 1080p page holds six rows: sixty players are ten pages, one per rotation.
      test.setTimeout(240_000)
      // The rotation runs on a fake clock. Only the Individual board is read, and
      // it pages in place each time the rotation comes back to it.
      await page.clock.install()
      await page.setViewportSize({ width: w, height: h })
      await page.goto(`/t/_/${fixture}/tv`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      // «Individual 1–9 de 12»: the field size is on the board; a board that fits on one page has no range.
      const title = (await page.locator('section h2').first().textContent()) ?? ''
      const total = Number(/de (\d+)$/.exec(title.trim())?.[1]) || (await page.locator('[data-player]').count())
      expect(total).toBeGreaterThan(0)
      const seen = new Set<string>()
      for (let tick = 0; tick < 80 && seen.size < total; tick++) {
        // Inside the board's own box (it clips what overflows), not just the window.
        const rows = await page.locator('[data-player]').evaluateAll((els) =>
          els.map((el) => {
            const box = el.parentElement!.getBoundingClientRect()
            const r = el.getBoundingClientRect()
            return { id: el.getAttribute('data-player')!, bottom: r.bottom, limit: Math.min(box.bottom, window.innerHeight), inside: r.bottom <= Math.min(box.bottom, window.innerHeight) + 0.5 }
          }),
        )
        for (const r of rows) expect(r.inside, `row ${r.id} fully on screen (bottom ${Math.round(r.bottom)} of ${Math.round(r.limit)})`).toBe(true)
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
    // The board mounts after the page is idle: read the rows once they are all there.
    await expect(rows).toHaveCount(9)
    const times = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-sold-at') ?? ''))
    expect(times[0]).toBe([...times].sort().at(-1))
    const box = (await rows.first().boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(h)
  })
}

test('under the board, a rule fills toward the next board and names it; the next one is the one named (MOT-08)', async ({ page }) => {
  // Real time, as the VIS-04 test: the rotation and its transitions run on the browser's own clock.
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/t/_/full12-finished/tv', { waitUntil: 'networkidle' })
  const next = page.locator('footer').getByText(/^Sigue: /)
  await expect(next).toBeVisible()
  const label = ((await next.textContent()) ?? '').replace(/^Sigue: /, '')
  expect(label.length).toBeGreaterThan(0)
  // The rule is filling: its scale grows toward 1 over the 12 s.
  const fill = page.locator('footer [class*="_rotationFill_"]')
  const scale = () => fill.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a)
  const a = await scale()
  await page.waitForTimeout(1_500)
  expect(await scale()).toBeGreaterThan(a)
  await expect(page.locator('section h2', { hasText: label })).toBeVisible({ timeout: 15_000 })
})

test('the auction lot card says the tier in words, in the board ink (VIS-07)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/t/_/auction12/tv', { waitUntil: 'networkidle' })
  const tier = page.getByText(/^Categoría [A-Z]$/).first()
  await expect(tier).toBeVisible()
  const { color, ink } = await tier.evaluate((el) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--board-ink)'
    el.parentElement!.appendChild(probe)
    const ink = getComputedStyle(probe).color
    probe.remove()
    return { color: getComputedStyle(el).color, ink }
  })
  expect(color).toBe(ink)
})

/**
 * VIS-05: the TV's type was the phone's, from 4 m away: names 12′ of arc,
 * «Hoyo 11, 25» 9′, the tier badge 4.5′, against a 16′ floor for reading. Now
 * nothing visible on any board is under 3.5vh, names are 4.5vh, and each
 * figure sits under its column label.
 */
/** Every visible text node on the TV under the floor (3.5vh), as «text» size. */
async function underFloor(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const floor = window.innerHeight * 0.035 - 0.5
    const root = document.querySelector('[class*="_tv_"]')!
    const out: string[] = []
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = (n.textContent ?? '').trim()
      if (!text) continue
      const el = n.parentElement!
      if (el.closest('.sr-only')) continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || r.bottom <= 0 || r.top >= window.innerHeight) continue
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < floor) out.push(`«${text.slice(0, 40)}» ${size.toFixed(1)}px < ${floor.toFixed(1)}px`)
    }
    return out
  })
}

for (const [w, h] of ROOMS) {
  test(`at ${w}×${h} nothing on any board is under 3.5vh, and the names are 4.5vh (VIS-05)`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.clock.install()
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/t/_/full12-live/tv', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const names = await page.locator('[data-player] [class*="_name_"]').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)))
    expect(names.length).toBeGreaterThan(0)
    for (const size of names) expect(size).toBeGreaterThanOrEqual(h * 0.045 - 0.5)
    const boards = new Set<string>()
    for (let i = 0; i < 8; i++) {
      for (const title of await page.locator('section h2').allTextContents()) boards.add(title.replace(/\s*\d+–\d+ de \d+$/, '').trim())
      expect(await underFloor(page), `boards ${[...boards].join(', ')}`).toEqual([])
      await page.clock.runFor(12_000)
      await page.waitForTimeout(300)
    }
    // Individual, Matrimonios, La Víbora, the Calcutta, the feed at least.
    expect(boards.size).toBeGreaterThanOrEqual(5)
  })

  test(`Calcutta night at ${w}×${h}: nothing under 3.5vh (VIS-05)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/t/_/auction12/tv', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-sold-at]')).toHaveCount(9)
    expect(await underFloor(page)).toEqual([])
  })
}

test('each figure sits under its column label: hoyo, hoy, total (VIS-05)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/t/_/full12-live/tv', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-player]').first()).toBeVisible()
  const gaps = await page.evaluate(() => {
    const head = document.querySelector('[class*="_colHead_"][class*="_rowIndiv_"]')!
    const row = document.querySelector('[data-player]')!
    const right = (el: Element) => el.getBoundingClientRect().right
    const heads = Array.from(head.children).slice(-3)
    const cells = Array.from(row.children).slice(-3)
    return { labels: heads.map((x) => x.textContent), gaps: heads.map((x, i) => Math.abs(right(x) - right(cells[i]!))) }
  })
  expect(gaps.labels).toEqual([t.tv.thru, t.tv.today, t.tv.total])
  for (const g of gaps.gaps) expect(g).toBeLessThan(4)
})

test('the leader\'s total and the snake\'s holder sit on the yellow plate, the other totals on the board plate (VIS-05)', async ({ page }) => {
  test.setTimeout(120_000)
  await page.clock.install()
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/t/_/full12-live/tv', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-player]').first()).toBeVisible()
  const plates = await page.evaluate(() => {
    const token = (name: string) => {
      const probe = document.createElement('span')
      probe.style.backgroundColor = `var(${name})`
      document.querySelector('[class*="_tv_"]')!.appendChild(probe)
      const color = getComputedStyle(probe).backgroundColor
      probe.remove()
      return color
    }
    return {
      accent: token('--board-accent'),
      surface: token('--board-surface'),
      rows: Array.from(document.querySelectorAll('[data-player]')).map((row) => ({
        leader: /_leader_/.test(row.className),
        plate: getComputedStyle(row.querySelector('[class*="_big_"] > span')!).backgroundColor,
      })),
    }
  })
  expect(plates.accent).not.toBe(plates.surface)
  expect(plates.rows.filter((r) => r.leader).length).toBeGreaterThan(0)
  for (const r of plates.rows) expect(r.plate).toBe(r.leader ? plates.accent : plates.surface)
  // The snake's board, a few rotations on: each group's holder on the yellow plate, the snake beside his name.
  for (let i = 0; i < 8 && (await page.locator('[class*="_holder_"]').count()) === 0; i++) {
    await page.clock.runFor(12_000)
    await page.waitForTimeout(300)
  }
  const holder = page.locator('[class*="_holder_"]').first()
  await expect(holder).toBeVisible()
  await expect(holder.getByRole('img', { name: t.games.holder })).toBeVisible()
  expect(await holder.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(plates.accent)
})

/**
 * Calcutta night's other two moments at the room's size (MOT-05, UX-17): the
 * order out of the hat before the first lot, the pairs draw after the last.
 */
for (const [w, h] of ROOMS) {
  test(`the order out of the hat at ${w}×${h}: every lot on screen, nothing under 3.5vh (MOT-05)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/t/_/hat12/tv', { waitUntil: 'networkidle' })
    const items = page.locator('[class*="_hatItem_"]')
    await expect(items).toHaveCount(12)
    for (const box of await items.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(box.bottom).toBeLessThanOrEqual(h)
      expect(box.right).toBeLessThanOrEqual(w)
    }
    expect(await underFloor(page)).toEqual([])
  })

  test(`the pairs draw at ${w}×${h}: every pair with both faces and the rings, nothing under 3.5vh (UX-17)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/t/_/draw12/tv', { waitUntil: 'networkidle' })
    const rows = page.locator('[data-pair]')
    await expect(rows).toHaveCount(6)
    const shapes = await rows.evaluateAll((els) =>
      els.map((row) => ({ faces: row.querySelectorAll('.avatar').length, rings: row.querySelectorAll('svg').length, bottom: row.getBoundingClientRect().bottom, inside: row.parentElement!.getBoundingClientRect().bottom })),
    )
    for (const r of shapes) {
      expect(r.faces).toBe(2)
      expect(r.rings).toBe(1)
      expect(r.bottom).toBeLessThanOrEqual(Math.min(r.inside, h) + 0.5)
    }
    expect(await underFloor(page)).toEqual([])
  })
}

