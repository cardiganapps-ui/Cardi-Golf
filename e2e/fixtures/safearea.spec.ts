/**
 * PWA-07: safe areas were handled only in the player shell. The Comité's
 * save bar sat 12 px from the bottom edge, inside the iPhone's home-indicator
 * band (an upward flick there leaves the app), and in landscape nothing kept
 * clear of the sides: Comité › Tarjetas started its text at x = 16 and the TV
 * at 34, under a 59 px inset. A centred column (the player screens, a sheet)
 * clears an inset by its own margin first, so it pads only what is left.
 */
import type { Page } from '@playwright/test'
import { expect, open, test } from './base'

const inset = (page: Page, insets: { top?: number; bottom?: number; left?: number; right?: number }) =>
  page
    .context()
    .newCDPSession(page)
    .then((cdp) => cdp.send('Emulation.setSafeAreaInsetsOverride', { insets }))

/** Every visible text box on screen inside `root`, as [left, right, text]. */
const textBoxes = (page: Page, root = 'body') =>
  page.evaluate((root) => {
    const out: Array<[number, number, string]> = []
    const walker = document.createTreeWalker(document.querySelector(root)!, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim()
      if (!text) continue
      const el = n.parentElement
      if (!el || el.closest('[aria-hidden="true"]')) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) continue
        out.push([Math.round(r.left), Math.round(r.right), text.slice(0, 30)])
      }
    }
    return out
  }, root)

test('portrait, home indicator 34 px: the Comité save bar sits above it (PWA-07)', async ({ page }) => {
  await inset(page, { top: 59, bottom: 34 })
  // Grupos is taller than the screen, so its save bar is stuck to the bottom edge.
  await open(page, '/t/_/full12-live/admin/grupos')
  const bar = page.locator('[class*="_sticky_"]').first()
  await expect(bar).toBeVisible()
  const height = page.viewportSize()!.height
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(height)
  const box = (await bar.boundingBox())!
  expect(Math.round(box.y + box.height), 'save bar bottom').toBeLessThanOrEqual(height - 34)
})

for (const path of ['admin/scores', 'admin/torneo', 'admin/grupos', '', 'tarjeta', 'tv']) {
  test(`landscape, 59 px each side: no text under an inset on ${path || 'envivo'} (PWA-07)`, async ({ page }) => {
    await page.setViewportSize({ width: 852, height: 393 })
    await inset(page, { left: 59, right: 59, bottom: 21 })
    await open(page, `/t/_/full12-live/${path}`)
    const boxes = await textBoxes(page)
    expect(boxes.length).toBeGreaterThan(0)
    const under = boxes.filter(([l, r]) => l < 59 || r > 852 - 59)
    expect(under, 'text inside the 59 px side insets').toEqual([])
  })
}

test('landscape on a 13 mini, 50 px each side: the wide player sheet keeps its text clear (PWA-07)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 812, height: 375 })
  await inset(page, { left: 50, right: 50, bottom: 21 })
  await open(page, '/t/_/full12-live')
  await page.locator('button[class*="leaderRow"]').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  const boxes = await textBoxes(page, '[role="dialog"]')
  expect(boxes.length).toBeGreaterThan(0)
  const under = boxes.filter(([l, r]) => l < 50 || r > 812 - 50)
  expect(under, 'sheet text inside the 50 px side insets').toEqual([])
})

test('landscape: the player column already sits clear of the insets, so it keeps its 16 px gutter (PWA-07)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 852, height: 393 })
  await inset(page, { left: 59, right: 59, bottom: 21 })
  await open(page, '/t/_/full12-live')
  const pad = await page
    .locator('main')
    .first()
    .evaluate((m) => [getComputedStyle(m).paddingLeft, getComputedStyle(m).paddingRight])
  expect(pad).toEqual(['16px', '16px'])
})
