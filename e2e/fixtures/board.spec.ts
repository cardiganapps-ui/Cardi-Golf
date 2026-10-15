/**
 * The board row in a real browser (§9.2):
 * - VIS-02: every figure ends where its header ends, units over units. The figures sat left of their headers.
 * - MOT-06, MOT-18: back on the board after a change it did not show, the rows that moved say how far and the
 *   figures that changed wash; the marks fit inside their row, and stay after the wash is gone.
 * - MOT-12: a touch shows the row pressed on the next frame, at 4× CPU too, before the player's sheet renders.
 */
import type { Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

/** Every board on the page: each figure whose text does not end where its header's does (±1 px), and how many were measured. */
function misaligned(page: Page) {
  return page.evaluate(() => {
    const textRight = (el: Element | undefined) => {
      if (!el || !el.textContent?.trim()) return null
      const r = document.createRange()
      r.selectNodeContents(el.querySelector('[class*="_moved_"]') ? el.firstChild! : el)
      const rects = Array.from(r.getClientRects())
      return rects.length ? Math.max(...rects.map((x) => x.right)) : null
    }
    const off: string[] = []
    let measured = 0
    for (const head of Array.from(document.querySelectorAll('[class*="_boardHead_"][aria-hidden="true"]'))) {
      const board = head.parentElement!
      for (const row of Array.from(board.querySelectorAll('button[class*="_leaderRow_"]'))) {
        for (const i of [2, 3, 4]) {
          const fig = textRight(row.children[i])
          const label = textRight(head.children[i])
          if (fig == null || label == null) continue
          measured++
          if (Math.abs(fig - label) > 1) off.push(`${row.getAttribute('aria-label')?.slice(0, 24)} column ${i}: ${fig.toFixed(1)} vs ${label.toFixed(1)}`)
        }
      }
    }
    return { off, measured }
  })
}

for (const width of [375, 393]) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(({ page }) => page.setViewportSize({ width, height: 852 }))

    for (const [what, path, game] of [
      ['En vivo', '/t/_/full12-live', null],
      ['En vivo, 60 players (dense rows)', '/t/_/large60', null],
      ['Juegos › Individual', '/t/_/full12-live/juegos', /^Individual/],
      ['Juegos › Los Matrimonios', '/t/_/full12-live/juegos', /^Los Matrimonios/],
      ['Juegos › Mejor ronda', '/t/_/full12-live/juegos', /^Mejor ronda/],
    ] as const) {
      test(`${what}: every figure ends where its header does (VIS-02)`, async ({ page }) => {
        await open(page, path)
        if (game) await page.getByRole('button', { name: game }).first().click()
        await expect(page.locator('button[class*="_leaderRow_"]').first()).toBeVisible()
        const { off, measured } = await misaligned(page)
        // The pairs board has no day column: six pairs, two figures each.
        expect(measured).toBeGreaterThanOrEqual(12)
        expect(off).toEqual([])
      })
    }
  })
}

/** Rewrites this phone's last look at the board (MOT-06): `edit` gets its rows by place, best first. */
async function rewriteLook(page: Page, edit: string) {
  await page.evaluate((edit) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('cardi-golf:board-seen:'))!
    const look = JSON.parse(localStorage.getItem(key)!) as { rows: Record<string, { place: number; figure: string; today: string }> }
    const byPlace = Object.entries(look.rows).sort((a, b) => a[1].place - b[1].place)
    new Function('byPlace', edit)(byPlace)
    localStorage.setItem(key, JSON.stringify(look))
  }, edit)
}
/** The En vivo row that holds this place now: its moved mark, and its figure's wash. */
async function rowAt(page: Page, place: number) {
  return page.locator('button[class*="_leaderRow_"]').nth(place - 1)
}

test('back from the Tarjeta: who moved, by how much, and which figures changed (MOT-06, MOT-18)', async ({ page }) => {
  await open(page, '/t/_/full12-live')
  // As if, the last time this phone showed the board, the 2nd was 5th with 3 points fewer and the 4th was 3rd.
  await rewriteLook(page, `byPlace[1][1].place = 5; byPlace[1][1].figure = String(Number(byPlace[1][1].figure) - 3); byPlace[3][1].place = 3`)
  await page.getByRole('link', { name: new RegExp(`^${t.nav.card}`) }).click()
  await expect(page).toHaveURL(/\/tarjeta/)
  await page.getByRole('link', { name: new RegExp(`^${t.nav.live}`) }).click()
  const second = await rowAt(page, 2)
  await expect(second.locator('[class*="_moved_"]')).toHaveText('3')
  await expect(second).toHaveAttribute('aria-label', new RegExp(`${t.live.movedSpoken(3)}$`))
  await expect((await rowAt(page, 4)).locator('[class*="_moved_"]')).toHaveText('1')
  // The 2nd's figure washes, and nobody else's: it is the only one that changed.
  const washing = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('button[class*="_leaderRow_"] [class*="_figure_"]')).flatMap((el, i) =>
        el.getAnimations().some((a) => a.playState === 'running') ? [i + 1] : [],
      ),
    )
  expect(await washing()).toEqual([2])
  // Each mark fits inside its row, under the position.
  for (const place of [2, 4]) {
    const row = (await (await rowAt(page, place)).boundingBox())!
    const mark = (await (await rowAt(page, place)).locator('[class*="_moved_"]').boundingBox())!
    expect(mark.y + mark.height).toBeLessThanOrEqual(row.y + row.height)
    expect(mark.x).toBeGreaterThanOrEqual(row.x)
  }
  // The wash is gone in under two seconds; the marks stay until the next look.
  await page.waitForTimeout(1900)
  expect(await washing()).toEqual([])
  await expect(second.locator('[class*="_moved_"]')).toHaveText('3')
})

test('dense rows (60 players): a mark still fits inside its row (MOT-06)', async ({ page }) => {
  await open(page, '/t/_/large60')
  await rewriteLook(page, `byPlace[11][1].place = 23`)
  await page.getByRole('link', { name: new RegExp(`^${t.nav.card}`) }).click()
  await page.getByRole('link', { name: new RegExp(`^${t.nav.live}`) }).click()
  const row = await rowAt(page, 12)
  await expect(row.locator('[class*="_moved_"]')).toHaveText('11')
  const r = (await row.boundingBox())!
  const m = (await row.locator('[class*="_moved_"]').boundingBox())!
  expect(m.y + m.height).toBeLessThanOrEqual(r.y + r.height)
})

test('reduced motion: nothing fades, a dot marks the changed figure (MOT-18)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, '/t/_/full12-live')
  await rewriteLook(page, `byPlace[0][1].figure = String(Number(byPlace[0][1].figure) - 2)`)
  await page.getByRole('link', { name: new RegExp(`^${t.nav.card}`) }).click()
  await page.getByRole('link', { name: new RegExp(`^${t.nav.live}`) }).click()
  const figure = (await rowAt(page, 1)).locator('[class*="_figure_"]')
  await expect(figure).toHaveAttribute('data-wash', /^[ab]$/)
  expect(await figure.evaluate((el) => el.getAnimations().length)).toBe(0)
  expect(await figure.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('""')
})

test('a touch shows the row pressed on the next frame, before the sheet, at 4× CPU (MOT-12)', async ({ page }) => {
  await open(page, '/t/_/full12-live')
  const row = await rowAt(page, 3)
  await row.scrollIntoViewIfNeeded()
  const box = (await row.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  // From the touch to the first frame the row is painted pressed, and to the frame the sheet is there.
  await row.evaluate((el) => {
    const w = window as unknown as { pressedAt?: number; sheetAt?: number; downAt?: number }
    const rest = getComputedStyle(el).backgroundColor
    el.addEventListener('pointerdown', () => (w.downAt = performance.now()), { once: true })
    const tick = () => {
      if (w.downAt != null && w.pressedAt == null && getComputedStyle(el).backgroundColor !== rest) w.pressedAt = performance.now()
      if (w.downAt != null && w.sheetAt == null && document.querySelector('[role="dialog"]')) w.sheetAt = performance.now()
      if (w.sheetAt == null) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] })
  await page.waitForTimeout(90)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('dialog')).toBeVisible()
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const { downAt, pressedAt, sheetAt } = await page.evaluate(() => {
    const w = window as unknown as { pressedAt?: number; sheetAt?: number; downAt?: number }
    return { downAt: w.downAt, pressedAt: w.pressedAt, sheetAt: w.sheetAt }
  })
  expect(downAt).toBeDefined()
  test.info().annotations.push({ type: 'MOT-12, 4× CPU', description: `row pressed ${Math.round(pressedAt! - downAt!)} ms after the touch, the sheet ${Math.round(sheetAt! - downAt!)} ms` })
  expect(pressedAt! - downAt!, 'touch to the row pressed').toBeLessThan(50)
  expect(pressedAt!).toBeLessThan(sheetAt!)
})
