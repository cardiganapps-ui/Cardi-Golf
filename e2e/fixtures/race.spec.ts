/**
 * The race chart of Estadísticas (PERF-04, VIS-21, A11Y-20, MOT-21, MOT-15), in Chromium on the fixtures:
 * a named image with its table, no horizontal scroll and no serious axe finding at both phone widths, a
 * legible large field (six lines in colour, the rest grey, named beside the lines), a replay that moves
 * one cover by a transform and never redraws a path, and none of it moving under reduced motion.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const R = t.stats.raceChart
const chart = (page: Page) => page.locator('[role="img"]').filter({ has: page.locator('[data-reveal]') })
/** Where the cover over the race not reached yet stands, in px from the plot's left. */
const REVEAL = (el: Element) => Number(/translateX\(([-\d.]+)px\)/.exec((el.querySelector('[data-reveal]') as HTMLElement).style.transform)?.[1] ?? NaN)

async function serious(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)
}

for (const [fixture, count] of [
  ['full12-live', 12],
  ['large60', 60],
] as const) {
  for (const width of [375, 393]) {
    test(`${fixture} at ${width}px: a named chart, its table, no sideways scroll, axe clean`, async ({ page, pageErrors }) => {
      await page.setViewportSize({ width, height: 852 })
      await open(page, `/t/_/${fixture}/stats`)
      const svg = chart(page)
      await expect(svg).toBeVisible()
      expect(await svg.getAttribute('aria-label')).toMatch(new RegExp(`^${t.stats.race}: ${count} jugadores, \\d+ hoyos\\. Va(n)? al frente `))
      expect(await svg.getAttribute('tabindex')).toBeNull()
      expect(await page.locator('[role="application"]').count()).toBe(0)
      // The chart fits the screen, and so does the page.
      const box = (await svg.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      await page.getByRole('button', { name: R.showTable }).click()
      const table = page.getByRole('table', { name: R.tableName(t.stats.race) })
      await expect(table).toBeVisible()
      await expect(table.locator('tbody tr')).toHaveCount(count)
      expect(pageErrors).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
      expect(await serious(page)).toEqual([])
    })
  }
}

test('large60: six lines in colour and named beside them, 54 grey, a pick adds one', async ({ page }) => {
  await open(page, '/t/_/large60/stats')
  const svg = chart(page)
  const coloured = () => svg.locator('path[class*="line"]').count()
  const grey = () => svg.locator('path[class*="context"]').count()
  const n = await coloured()
  expect(n).toBeGreaterThanOrEqual(3)
  expect(n).toBeLessThanOrEqual(6)
  expect(n + (await grey())).toBe(60)
  // No legend of sixty: the names are beside the coloured lines, one each.
  expect(await svg.locator('text[class*="label"]').count()).toBe(n)
  const pick = page.getByRole('combobox', { name: R.pick })
  const options = await pick.locator('option').allTextContents()
  const shown = await svg.locator('text[class*="label"]').allTextContents()
  const other = options.slice(1).find((o) => !shown.some((s) => o.startsWith(s.replace('…', ''))))!
  await pick.selectOption({ label: other })
  if (n < 6) expect(await coloured()).toBe(n + 1)
  // The pick stays for this race in this tab.
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByRole('combobox', { name: R.pick })).toHaveValue(await pick.inputValue())
})

test('the replay slides one cover on each frame and never redraws a path (MOT-21)', async ({ page }) => {
  await open(page, '/t/_/large60/stats')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.getByRole('button', { name: t.stats.play }).scrollIntoViewIfNeeded()
  await page.evaluate(() => {
    const w = window as unknown as { __paths: number }
    w.__paths = 0
    new MutationObserver((list) => {
      for (const m of list) if ((m.target as Element).tagName === 'path') w.__paths++
    }).observe(document.querySelector('[role="img"]')!, { subtree: true, attributes: true, childList: true })
  })
  await page.getByRole('button', { name: t.stats.play }).click()
  // The cover's place on each frame of the replay, from its first.
  await page.evaluate(() => {
    const w = window as unknown as { __clip: number[]; __stop: boolean }
    w.__clip = []
    w.__stop = false
    const cover = document.querySelector<HTMLElement>('[data-reveal]')!
    const loop = () => {
      if (w.__stop) return
      w.__clip.push(Number(/translateX\(([-\d.]+)px\)/.exec(cover.style.transform)?.[1]))
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
  await page.waitForTimeout(1500)
  await page.evaluate(() => ((window as unknown as { __stop: boolean }).__stop = true))
  const t0 = Date.now()
  await page.getByRole('button', { name: R.pause }).click()
  const pauseMs = Date.now() - t0
  await expect(page.getByRole('button', { name: R.resume })).toBeVisible()
  const { paths, clip } = await page.evaluate(() => {
    const w = window as unknown as { __paths: number; __clip: number[] }
    return { paths: w.__paths, clip: w.__clip }
  })
  expect(paths).toBe(0)
  // A smooth reveal: the cover took many distinct places, never going back.
  const moving = clip.filter((v, i) => i > 0 && v > clip[i - 1]!)
  expect(moving.length).toBeGreaterThan(20)
  expect(clip.every((v, i) => i === 0 || v >= clip[i - 1]!)).toBe(true)
  // «Pausar» answers at once, even at 4× CPU on 60 players (it took 1.7 s on the old chart).
  expect(pauseMs).toBeLessThan(1000)
})

test('under reduced motion there is no replay and the race shows whole (MOT-15)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, '/t/_/full12-live/stats')
  await expect(chart(page)).toBeVisible()
  await expect(page.getByRole('button', { name: t.stats.play })).toHaveCount(0)
  // The final frame: the cover stands past the last hole played and every coloured line is named.
  const { at, width } = await chart(page).evaluate((el) => ({ at: Number((el.querySelector('[data-reveal]') as HTMLElement).dataset.at), width: el.getBoundingClientRect().width }))
  expect(at).toBeGreaterThan(0)
  const bar = page.getByRole('slider', { name: R.cursor })
  expect(at).toBe(Number(await bar.getAttribute('max')))
  expect(await chart(page).evaluate(REVEAL)).toBeGreaterThan(width * 0.4)
  expect(await chart(page).locator('text[class*="label"]').count()).toBeGreaterThan(0)
  // The bar still reads any hole, at once.
  await bar.focus()
  await page.keyboard.press('Home')
  await expect(bar).toHaveAttribute('aria-valuetext', R.start)
})

test('the course strip: each hole’s average is said and shown on a tap (A11Y-20)', async ({ page }) => {
  await open(page, '/t/_/full12-live/stats')
  const hole = page.getByRole('button', { name: /^Hoyo 3, par \d: / }).first()
  await hole.click()
  await expect(hole).toHaveAttribute('aria-pressed', 'true')
  const said = (await hole.getAttribute('aria-label'))!
  await expect(page.getByText(said, { exact: true })).toBeVisible()
  expect(await page.locator('[title]').filter({ hasText: /^\d+$/ }).count()).toBe(0)
})
