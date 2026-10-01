/**
 * Ceremonia on the TV at the dinner.
 * - VIS-06: sized for the room (it was a phone dialog: a 14 px event name, a
 *   48 px step title, a champion card a fifth of the screen), in the event's
 *   accent, the figures on plates, and every step fits a 16:9 screen.
 * - UX-18: a keyboard or a presentation clicker runs the whole show, one key
 *   per beat; Space on a focused button is that button's press, not two beats.
 * - MOT-23: the champion's reveal is a sequence (the name, then the figures
 *   counting up, then the trophy line), not everything at once.
 * - MOT-01: no blank stage and no bounce between steps.
 * - A11Y-15: the focus ring shows on the board green.
 */
import type { Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, test } from './base'

const C = t.ceremony
const FIXTURE = 'full12-finished'
const ROOMS: Array<[number, number]> = [
  [1920, 1080],
  [1280, 720],
]
const BOARD_ACCENT = 'rgb(242, 194, 48)'

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

const px = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

/** Where the show is: the step's title, «n / N», and whether «Revelar» is still waiting. */
async function where(page: Page) {
  return page.evaluate((reveal) => {
    const centers = document.querySelectorAll('[class*="_center_"]')
    const c = centers[centers.length - 1]
    return {
      title: c?.querySelector('h2')?.textContent ?? null,
      progress: document.querySelector('[class*="_progress_"]')?.textContent ?? '',
      waiting: Array.from(document.querySelectorAll('button')).some((b) => b.textContent === reveal),
      settled: centers.length === 1,
    }
  }, C.reveal)
}

/** Press a key and wait until the show has moved and the last view has left. */
async function beat(page: Page, key: string) {
  const before = JSON.stringify(await where(page))
  await page.keyboard.press(key)
  await expect
    .poll(async () => {
      const now = await where(page)
      return now.settled && JSON.stringify(now) !== before
    })
    .toBe(true)
  return where(page)
}

for (const [w, h] of ROOMS) {
  test(`${w}×${h}: sized for the room, in the event's accent, every step fits, run from a clicker`, async ({ page, pageErrors }) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: w, height: h })
    const vh = h / 100
    // The same tournament on the TV: its name and its accent.
    await page.goto(`/t/_/${FIXTURE}/tv`, { waitUntil: 'networkidle' })
    const eventName = (await page.locator('h1').first().textContent())!.trim()
    const accent = await page.locator('[style*="--event-accent"]').first().evaluate((el) => getComputedStyle(el).getPropertyValue('--event-accent').trim())

    await page.goto(`/t/_/${FIXTURE}/ceremonia`, { waitUntil: 'networkidle' })
    expect(await px(page, 'h1')).toBeGreaterThanOrEqual(4 * vh)
    const name = page.getByText(eventName, { exact: true })
    expect(await name.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(2.8 * vh)
    const start = page.getByRole('button', { name: C.start })
    expect(await start.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(3 * vh)
    // The event's colour, as on the TV and every other screen of the tournament (it was the platform's green).
    expect(await start.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rgb(accent))

    let presses = 0
    let revealed = 0
    let total = 0
    let champion = false
    for (let i = 0; i < 80; i++) {
      // A clicker sends PageDown, a keyboard →.
      const now = await beat(page, i % 2 ? 'PageDown' : 'ArrowRight')
      presses++
      if (now.title === C.done) break
      total = Number(/\/ (\d+)$/.exec(now.progress)?.[1] ?? 0)
      if (now.waiting) continue
      revealed++
      const label = `step «${now.title}»`
      // The whole step is on screen: nothing to scroll on a TV.
      const fit = await page.locator('[class*="_body_"]').evaluate((el) => ({ over: el.scrollHeight - el.clientHeight, wide: document.documentElement.scrollWidth - innerWidth }))
      expect(fit.over, `${label}: overflow (px)`).toBeLessThanOrEqual(1)
      expect(fit.wide, `${label}: horizontal scroll (px)`).toBeLessThanOrEqual(0)
      expect(await px(page, 'h2'), `${label}: title`).toBeGreaterThanOrEqual(6 * vh)
      const lines = await page.locator('[class*="_winnerLine_"]').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)))
      for (const size of lines) expect(size, `${label}: a winner's name`).toBeGreaterThanOrEqual((lines.length > 1 ? 6.5 : 9.5) * vh)
      if (now.title === C.steps.place(1)) {
        champion = true
        // The champion's card is the screen, not a fifth of it.
        const area = await page.locator('[class*="_champion_"]').evaluate((el) => {
          const r = el.getBoundingClientRect()
          return (r.width * r.height) / (innerWidth * innerHeight)
        })
        expect(area).toBeGreaterThanOrEqual(0.3)
        // Points and prize on the leader's yellow plates.
        const plates = await page.locator('[class*="_plate"]').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))
        expect(plates.length).toBeGreaterThanOrEqual(1)
        for (const bg of plates) expect(bg).toBe(BOARD_ACCENT)
      }
    }
    expect(champion).toBe(true)
    expect(revealed).toBe(total)
    // One key per beat: start, then reveal and next for each step, then the end.
    expect(presses).toBe(1 + 2 * total)

    // ← and PageUp go back, to the step waiting to be revealed.
    let now = await beat(page, 'ArrowLeft')
    expect(now.progress).toBe(`${total} / ${total}`)
    expect(now.waiting).toBe(true)
    now = await beat(page, 'PageUp')
    expect(now.progress).toBe(`${total - 1} / ${total}`)
    // Space on a focused «Siguiente» is that button's press: one step, not a reveal and a step.
    await page.getByRole('button', { name: C.next }).focus()
    now = await beat(page, ' ')
    expect(now.progress).toBe(`${total} / ${total}`)
    expect(now.waiting).toBe(true)
    expect(pageErrors).toEqual([])
  })
}

test('the champion is revealed in beats: the name, then the figures counting up, then the trophy (MOT-23)', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`/t/_/${FIXTURE}/ceremonia`, { waitUntil: 'networkidle' })
  // To «El campeón», waiting for «Revelar».
  for (let i = 0; i < 60; i++) {
    const now = await beat(page, 'ArrowRight')
    if (now.title === C.steps.place(1) && now.waiting) break
  }
  expect((await where(page)).title).toBe(C.steps.place(1))
  await page.keyboard.press('ArrowRight')
  // Sampled in the page, frame by frame, for two seconds.
  const samples = await page.evaluate(async () => {
    const out: Array<{ at: number; name: number; figure: string; trophy: number }> = []
    const t0 = performance.now()
    const opacity = (el: Element | null) => (el ? Number(getComputedStyle(el).opacity) : 0)
    while (performance.now() - t0 < 2000) {
      const card = document.querySelector('[class*="_champion_"]')
      out.push({
        at: performance.now() - t0,
        name: opacity(card?.querySelector('[class*="_winnerLine_"]') ?? null),
        figure: card?.querySelector('[class*="_plate"] [aria-hidden="true"]')?.textContent ?? '',
        trophy: opacity(card?.querySelector('[class*="_trophy_"]') ?? null),
      })
      await new Promise((r) => requestAnimationFrame(r))
    }
    return out
  })
  const final = samples[samples.length - 1]!
  const points = parseInt(final.figure, 10)
  expect(points).toBeGreaterThan(0)
  expect(final.name).toBe(1)
  expect(final.trophy).toBe(1)
  // Not all at once: early on, the name is still arriving and the trophy line isn't there.
  const early = samples.filter((s) => s.at < 150)
  expect(early.length).toBeGreaterThan(0)
  for (const s of early) {
    expect(s.name).toBeLessThan(1)
    expect(s.trophy).toBe(0)
  }
  // The points climb through values below the final one.
  expect(samples.some((s) => parseInt(s.figure, 10) > 0 && parseInt(s.figure, 10) < points)).toBe(true)
  // The trophy line lands after the name is fully there.
  const nameIn = samples.find((s) => s.name === 1)!.at
  const trophyIn = samples.find((s) => s.trophy > 0)!.at
  expect(trophyIn).toBeGreaterThan(nameIn)
})

test('between steps the stage is never blank, and nothing bounces past its place (MOT-01)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`/t/_/${FIXTURE}/ceremonia`, { waitUntil: 'networkidle' })
  await beat(page, 'ArrowRight')
  await beat(page, 'ArrowRight')
  const from = (await where(page)).title
  const samples = page.evaluate(async () => {
    const out: Array<{ shown: number; titles: string[]; ys: number[] }> = []
    const t0 = performance.now()
    while (performance.now() - t0 < 700) {
      const centers = Array.from(document.querySelectorAll('[class*="_center_"]'))
      out.push({
        // How much of a view is on screen: the most opaque of the leaving and the coming one.
        shown: Math.max(0, ...centers.map((c) => Number(getComputedStyle(c).opacity))),
        titles: centers.map((c) => c.querySelector('h2')?.textContent ?? ''),
        ys: centers.map((c) => new DOMMatrixReadOnly(getComputedStyle(c).transform).m42),
      })
      await new Promise((r) => requestAnimationFrame(r))
    }
    return out
  })
  await page.keyboard.press('ArrowRight')
  const frames = await samples
  for (const f of frames) expect(f.shown, 'a frame with no view on the stage').toBeGreaterThanOrEqual(0.3)
  // The coming view rises to its place and stops there (the old spring overshot it by 3.6 px).
  const ys = frames.flatMap((f) => f.titles.map((title, i) => ({ title, y: f.ys[i]! })).filter((v) => v.title && v.title !== from)).map((v) => v.y)
  expect(ys.length).toBeGreaterThan(0)
  for (const y of ys) expect(y).toBeGreaterThanOrEqual(-0.5)
})

test('the focus ring shows on the board green, and stays graphite on paper (A11Y-15)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  for (const path of ['ceremonia', 'tv']) {
    await page.goto(`/t/_/${FIXTURE}/${path}`, { waitUntil: 'networkidle' })
    await page.keyboard.press('Tab')
    const ring = await page.evaluate(() => {
      const el = document.activeElement!
      const cs = getComputedStyle(el)
      return { tag: el.tagName, style: cs.outlineStyle, color: cs.outlineColor }
    })
    expect(ring.tag, path).not.toBe('BODY')
    expect(ring.style, path).toBe('solid')
    expect(ring.color, path).toBe(BOARD_ACCENT)
  }
  await page.goto(`/t/_/${FIXTURE}/dinero`, { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineColor)).toBe('rgb(27, 33, 29)')
})
