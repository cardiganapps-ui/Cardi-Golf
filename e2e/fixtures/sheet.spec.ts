/**
 * A sheet leaves and drags as a phone's sheet does (MOT-09), in Chromium with
 * a real touch screen (CDP's touch events, which Chromium turns into pointer
 * events as a finger would). It used to vanish in one frame on Escape, and
 * its grabber did nothing under a 300 px drag.
 */
import type { Page } from '@playwright/test'
import { expect, open, test } from './base'

const ROW = 'button[class*="leaderRow"]'
const DIALOG = '[role="dialog"]'

async function openSheet(page: Page) {
  await open(page, '/t/_/full12-live')
  await page.locator(ROW).first().click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  // The entry has played: wait for its animations, not a fixed time (a busy CI runner starts them late, and a box
  // measured mid-entry is up to 16 px off where the sheet rests).
  await page.locator(DIALOG).evaluate(async (d) => {
    const els = [d, d.parentElement!]
    await Promise.all(els.flatMap((el) => el.getAnimations()).map((a) => a.finished))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })
}

interface Frame {
  at: number
  present: boolean
  opacity: number
  top: number
}
/**
 * From the Escape on (the clock starts in the key's own listener, so a busy machine can't start it late): every
 * frame for 600 ms, whether the dialog is in the DOM and how visible it is (its opacity times its backdrop's), and
 * the moment it left the DOM.
 */
async function watchClose(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { frames_: Frame[]; goneAt: number | null }
    w.frames_ = []
    w.goneAt = null
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      window.removeEventListener('keydown', onKey, true)
      const t0 = performance.now()
      new MutationObserver((_, obs) => {
        if (document.querySelector('[role="dialog"]')) return
        w.goneAt = performance.now() - t0
        obs.disconnect()
      }).observe(document.body, { childList: true, subtree: true })
      const tick = () => {
        const d = document.querySelector<HTMLElement>('[role="dialog"]')
        const op = d ? Number(getComputedStyle(d).opacity) * Number(getComputedStyle(d.parentElement!).opacity) : 0
        w.frames_.push({
          at: performance.now() - t0,
          present: !!d,
          opacity: op,
          top: d ? d.getBoundingClientRect().top : 0,
        })
        if (performance.now() - t0 < 600) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }
    window.addEventListener('keydown', onKey, true)
  })
}
const watched = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { frames_: Frame[]; goneAt: number | null }
    return { frames: w.frames_, goneAt: w.goneAt }
  })

/** A finger on the screen: down at (x, y0), moved to y in steps over `ms`, then lifted. */
async function swipe(page: Page, x: number, y0: number, dy: number, ms: number, steps = 12) {
  const cdp = await page.context().newCDPSession(page)
  const at = (y: number) => [{ x, y, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(y0) })
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(ms / steps)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(y0 + (dy * i) / steps) })
  }
  return {
    lift: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
  }
}

test('Escape: the sheet stays on screen fading for its exit, then goes; the page is back at once (MOT-09)', async ({
  page,
}) => {
  await openSheet(page)
  const top0 = (await page.locator(DIALOG).boundingBox())!.y
  await watchClose(page)
  await page.keyboard.press('Escape')
  // No longer a dialog to a screen reader, at once…
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // …and the page around it is live again; the only inert thing left is the sheet on its way out.
  expect(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('[inert]')).every((el) => el.querySelector('[role="dialog"]')),
    ),
  ).toBe(true)
  await expect.poll(async () => (await watched(page)).goneAt, { timeout: 3000 }).not.toBeNull()
  await page.waitForTimeout(700)
  const { frames, goneAt } = await watched(page)
  const trace = JSON.stringify(
    frames.map((x) => [Math.round(x.at), x.present, x.opacity.toFixed(2), Math.round(x.top)]),
  )
  // Still in the DOM for 100 ms or more after the key, then gone well within a second.
  expect(goneAt!, trace).toBeGreaterThanOrEqual(100)
  expect(goneAt!, trace).toBeLessThan(1000)
  // While it was there, more transparent from frame to frame, and visibly on its way: fading and lower.
  const leaving = frames.filter((x) => x.present)
  for (let i = 1; i < leaving.length; i++)
    expect(leaving[i].opacity, trace).toBeLessThanOrEqual(leaving[i - 1].opacity + 1e-6)
  expect(
    leaving.some((x) => x.opacity < 0.95 && x.top > top0),
    trace,
  ).toBe(true)
  await expect(page.locator(DIALOG)).toHaveCount(0)
  expect(await page.evaluate(() => document.querySelectorAll('[inert]').length)).toBe(0)
  // Focus went back to the row that opened it.
  await expect(page.locator(ROW).first()).toBeFocused()
})

test('a 200 px drag down on the grabber closes the sheet; the sheet follows the finger on the way (MOT-09)', async ({
  page,
}) => {
  await openSheet(page)
  const dialog = page.locator(DIALOG)
  const grab = dialog.locator('[data-sheet-grab]').first()
  const box = (await grab.boundingBox())!
  const top0 = (await dialog.boundingBox())!.y
  const finger = await swipe(page, box.x + box.width / 2, box.y + box.height / 2, 200, 400)
  // Mid-drag, the sheet is where the finger took it. Chromium hands pointermove to the page once per frame, so the
  // last step may land a frame after it was sent: read until it has (it read 11 of 12 steps, 183 px, on CI).
  await expect.poll(async () => (await dialog.boundingBox())!.y - top0).toBeGreaterThan(190)
  expect((await dialog.boundingBox())!.y - top0).toBeLessThan(210)
  await finger.lift()
  await expect(page.locator(DIALOG)).toHaveCount(0, { timeout: 2000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a 40 px drag springs back and the sheet stays open (MOT-09)', async ({ page }) => {
  await openSheet(page)
  const dialog = page.getByRole('dialog')
  const grab = dialog.locator('[data-sheet-grab]').first()
  const box = (await grab.boundingBox())!
  const top0 = (await dialog.boundingBox())!.y
  const finger = await swipe(page, box.x + box.width / 2, box.y + box.height / 2, 40, 600)
  expect((await dialog.boundingBox())!.y - top0).toBeGreaterThan(30)
  await page.waitForTimeout(200)
  await finger.lift()
  await page.waitForTimeout(500)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  expect(Math.abs((await dialog.boundingBox())!.y - top0)).toBeLessThan(1)
})

test('a drag down that starts in the scrolled body scrolls it and never moves the sheet (MOT-09)', async ({ page }) => {
  await openSheet(page)
  const dialog = page.getByRole('dialog')
  const body = dialog.locator('[class*="sheetBody"]')
  // The player sheet is taller than the phone: scroll its body down first.
  const range = await body.evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(range, 'the player sheet’s body scrolls').toBeGreaterThan(200)
  await body.evaluate((el) => el.scrollTo(0, 300))
  const top0 = (await dialog.boundingBox())!.y
  const b = (await body.boundingBox())!
  const finger = await swipe(page, b.x + b.width / 2, b.y + 60, 200, 300)
  // The sheet stayed put under the finger; its body scrolled back toward the top instead.
  expect(Math.abs((await dialog.boundingBox())!.y - top0)).toBeLessThan(1)
  await finger.lift()
  await page.waitForTimeout(400)
  expect(await body.evaluate((el) => el.scrollTop)).toBeLessThan(300)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  expect(Math.abs((await dialog.boundingBox())!.y - top0)).toBeLessThan(1)
})

test('reduced motion: Escape takes the sheet away at once, and a drag still closes it (MOT-09)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openSheet(page)
  await page.keyboard.press('Escape')
  // No exit to play: gone in the same task as the key.
  expect(await page.locator(DIALOG).count()).toBe(0)
  await page.locator(ROW).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveCount(1)
  const box = (await dialog.locator('[data-sheet-grab]').first().boundingBox())!
  const finger = await swipe(page, box.x + box.width / 2, box.y + box.height / 2, 300, 400)
  await finger.lift()
  await expect(page.locator(DIALOG)).toHaveCount(0)
})
