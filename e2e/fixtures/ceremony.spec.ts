/**
 * Ceremonia on the TV at the dinner.
 * - VIS-06: sized for the room (it was a phone dialog: a 14 px event name, a
 *   48 px step title, a champion card a fifth of the screen), in the event's
 *   accent, the figures on plates, and every step fits a 16:9 screen: a long
 *   list pages to it (60 people) instead of scrolling.
 *   Ties and long names fit too: a tie beside a list zooms the winner's
 *   column, a tie of many is a compact list, and a name never breaks inside
 *   a word.
 * - UX-18: a keyboard or a presentation clicker runs the whole show, one key
 *   per beat; Space on a focused button is that button's press, not two beats,
 *   and «Siguiente» is the same beat as the keys. A second press right after a
 *   reveal pages the list instead of leaving the step.
 * - MOT-23: the champion's reveal is a sequence (the name, then the figures
 *   counting up, then the trophy line), not everything at once.
 * - MOT-01: no blank stage and no bounce between steps.
 * - A11Y-15: the focus ring shows on the board green.
 */
import AxeBuilder from '@axe-core/playwright'
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

/** The views on the stage: the start, a step, the end (two while one leaves). */
const VIEWS = '[class*="_center_"], [class*="_step_"]'

/** Where the show is: the step's title, «n / N», whether «Revelar» is still waiting, and the list's page. */
async function where(page: Page) {
  return page.evaluate(
    ([reveal, views]) => {
      const all = document.querySelectorAll(views)
      const c = all[all.length - 1]
      const range = document.querySelector<HTMLElement>('[class*="_range_"]')
      return {
        title: c?.querySelector('h2')?.textContent ?? null,
        progress: document.querySelector('[class*="_progress_"]')?.textContent ?? '',
        waiting: Array.from(document.querySelectorAll('button')).some((b) => b.textContent === reveal),
        range: range && range.style.visibility !== 'hidden' ? range.textContent : '',
        settled: all.length === 1,
      }
    },
    [C.reveal, VIEWS] as const,
  )
}

/**
 * Nothing to scroll, nothing cut off, nothing spilling: the stage holds the
 * whole step, the reveal sits inside the room under the title, and every row
 * of a list is inside its box. The fit allows a pixel of rounding (`holds`),
 * and a reveal starts at the top of its room, so that pixel shows at the
 * bottom: `spill` is held to 1 px.
 */
async function fits(page: Page) {
  return page.evaluate(() => {
    const body = document.querySelector('[class*="_body_"]')!
    const area = document.querySelector<HTMLElement>('[data-area]')
    const reveal = area?.querySelector('[class*="_reveal_"]')
    const box = document.querySelector('[class*="_listBox_"]')
    const bottom = box?.getBoundingClientRect().bottom ?? Infinity
    const a = area?.getBoundingClientRect()
    const r = reveal?.getBoundingClientRect()
    // A name broken inside a word: one of its words on two lines.
    const broken = Array.from(reveal?.querySelectorAll('[data-name]') ?? []).filter((n) => {
      const text = n.firstChild
      if (!text?.textContent) return false
      let at = 0
      return text.textContent.split(' ').some((word) => {
        const range = document.createRange()
        range.setStart(text, at)
        range.setEnd(text, at + word.length)
        at += word.length + 1
        return new Set(Array.from(range.getClientRects()).map((x) => Math.round(x.top))).size > 1
      })
    })
    // A name whose letters run past its card's edges.
    const outside = Array.from(reveal?.querySelectorAll('[data-name]') ?? []).filter((n) => {
      const card = n.closest('[class*="_winner_"]')?.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(n)
      const text = range.getBoundingClientRect()
      return !!card && (text.left < card.left - 1 || text.right > card.right + 1)
    })
    return {
      over: body.scrollHeight - body.clientHeight,
      wide: document.documentElement.scrollWidth - innerWidth,
      spill: a && r ? Math.max(0, a.top - r.top, r.bottom - a.bottom) : 0,
      cut: box ? Array.from(box.querySelectorAll('[class*="_listRow_"]')).filter((row) => row.getBoundingClientRect().bottom > bottom + 0.5).length : 0,
      zoom: area?.style.getPropertyValue('--fit') || '1',
      broken: broken.map((n) => n.textContent),
      outside: outside.map((n) => n.textContent),
    }
  })
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
      // The whole step is on screen at full size: nothing to scroll on a TV, nothing drawn smaller, no list paged.
      const fit = await fits(page)
      expect(fit.over, `${label}: overflow (px)`).toBeLessThanOrEqual(1)
      expect(fit.wide, `${label}: horizontal scroll (px)`).toBeLessThanOrEqual(0)
      expect(fit.cut, `${label}: rows cut off`).toBe(0)
      expect(fit.spill, `${label}: spills out of its room (px)`).toBeLessThanOrEqual(1)
      expect(fit.zoom, `${label}: drawn smaller`).toBe('1')
      expect(now.range, `${label}: paged`).toBe('')
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
    // Space on a focused «Siguiente» is that button's press, and the button is the same beat as the keys:
    // it reveals the step waiting, rather than skipping it (and is not a reveal and a step).
    await page.getByRole('button', { name: C.next }).focus()
    now = await beat(page, ' ')
    expect(now.progress).toBe(`${total - 1} / ${total}`)
    expect(now.waiting).toBe(false)
    expect(pageErrors).toEqual([])
  })
}

for (const [w, h] of ROOMS) {
  test(`${w}×${h}, a field of 60: every step fits, and a long list pages to the screen instead of scrolling`, async ({ page, pageErrors }) => {
    test.setTimeout(180_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/t/_/large60/ceremonia', { waitUntil: 'networkidle' })
    let pages = 0
    let lastShown = 0
    let field = 0
    for (let i = 0; i < 150; i++) {
      const now = await beat(page, 'ArrowRight')
      if (now.title === C.done) break
      if (now.waiting) continue
      const label = `step «${now.title}» ${now.range}`
      const fit = await fits(page)
      expect(fit.over, `${label}: overflow (px)`).toBeLessThanOrEqual(1)
      expect(fit.wide, `${label}: horizontal scroll (px)`).toBeLessThanOrEqual(0)
      expect(fit.cut, `${label}: rows cut off`).toBe(0)
      expect(fit.spill, `${label}: spills out of its room (px)`).toBeLessThanOrEqual(1)
      if (now.title !== C.steps.money) continue
      // The money summary, page by page: «1–24 de 60», «25–48 de 60»… each row once, none skipped.
      const [, from, to, of] = /(\d+)–(\d+) de (\d+)/.exec(now.range) ?? []
      expect(Number(from), label).toBe(lastShown + 1)
      expect(await page.locator('[class*="_listBox_"] [class*="_listRow_"]').count(), label).toBe(Number(to) - Number(from) + 1)
      lastShown = Number(to)
      field = Number(of)
      pages++
    }
    expect(field).toBe(60)
    expect(lastShown).toBe(60)
    expect(pages).toBeGreaterThan(1)
    // ← steps back through the pages before it leaves the step.
    let now = await beat(page, 'ArrowLeft')
    expect(now.title).toBe(C.steps.money)
    now = await beat(page, 'ArrowRight')
    expect(now.range).toMatch(/^1–/)
    now = await beat(page, 'ArrowRight')
    expect(now.range).not.toMatch(/^1–/)
    now = await beat(page, 'ArrowLeft')
    expect(now.range).toMatch(/^1–/)
    expect(now.title).toBe(C.steps.money)
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
      const centers = Array.from(document.querySelectorAll('[class*="_center_"], [class*="_step_"]'))
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

/**
 * Where a tie or a long name meets the room (the verifier's walk): a four-way
 * tie beside its list, a winner whose name is wider than its column, a tie of
 * twelve. Each step fits with nothing scrolling or spilling, and no name
 * breaks inside a word («Maurici / o»).
 */
for (const [w, h] of [...ROOMS, [1024, 768] as [number, number]]) {
  for (const fixture of ['friends8', 'auction12', 'bracket8']) {
    test(`${fixture} at ${w}×${h}: ties and long names fit, and no name breaks inside a word`, async ({ page, pageErrors }) => {
      test.setTimeout(120_000)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width: w, height: h })
      const vh = h / 100
      await page.goto(`/t/_/${fixture}/ceremonia`, { waitUntil: 'networkidle' })
      let revealed = 0
      for (let i = 0; i < 80; i++) {
        const now = await beat(page, 'ArrowRight')
        if (now.title === C.done) break
        if (now.waiting) continue
        revealed++
        const label = `step «${now.title}»`
        const fit = await fits(page)
        expect(fit.over, `${label}: overflow (px)`).toBeLessThanOrEqual(1)
        expect(fit.wide, `${label}: horizontal scroll (px)`).toBeLessThanOrEqual(0)
        expect(fit.spill, `${label}: spills out of its room (px)`).toBeLessThanOrEqual(1)
        expect(fit.broken, `${label}: a name broken inside a word`).toEqual([])
        // Drawn smaller to fit, but still read from across the room: a name's letters at least 4 % of the screen.
        const names = await page.locator('[data-name]').evaluateAll((els) =>
          els.map((el) => {
            const range = document.createRange()
            range.setStart(el.firstChild!, 0)
            range.setEnd(el.firstChild!, 1)
            return range.getBoundingClientRect().height
          }),
        )
        for (const size of names) expect(size, `${label}: a name`).toBeGreaterThanOrEqual(4 * vh)
        // Nothing reads «NaN» (an empty list once counted its pages as NaN).
        expect(await page.locator('body').textContent(), label).not.toContain('NaN')
      }
      expect(revealed).toBeGreaterThan(0)
      expect(pageErrors).toEqual([])
    })
  }
}

/**
 * A name of one long word («Maximiliano») can't break, so it is drawn
 * smaller. Its line was as wide as the name, never overflowed, and the screen
 * left it 31 px outside its card at 1024×768 (124 px at 2560×1440): every
 * winner's name is set to it here, and the step must fit again.
 */
for (const [w, h] of [[1024, 768], [1920, 1080], [2560, 1440]] as Array<[number, number]>) {
  test(`${w}×${h}: a one-word name wider than its card is drawn smaller, inside the card, never broken`, async ({ page, pageErrors }) => {
    test.setTimeout(180_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: w, height: h })
    await page.goto(`/t/_/${FIXTURE}/ceremonia`, { waitUntil: 'networkidle' })
    let tried = 0
    for (let i = 0; i < 80; i++) {
      const now = await beat(page, 'ArrowRight')
      if (now.title === C.done) break
      if (now.waiting) continue
      const names = await page.locator('[data-area] [data-name]').evaluateAll((els) => {
        for (const el of els) el.firstChild!.textContent = 'Maximiliano'
        return els.length
      })
      if (!names) continue
      tried++
      // A new size makes the screen fit the step again, to the name now in it (a step is at most 1400 px wide, so the height changes).
      await page.setViewportSize({ width: w, height: tried % 2 ? h - 50 : h })
      const label = `step «${now.title}»`
      await expect.poll(async () => (await fits(page)).outside, { message: `${label}: a name outside its card`, timeout: 5000 }).toEqual([])
      const fit = await fits(page)
      expect(fit.broken, `${label}: a name broken inside a word`).toEqual([])
      expect(fit.spill, `${label}: spills out of its room (px)`).toBeLessThanOrEqual(1)
      expect(fit.over, `${label}: overflow (px)`).toBeLessThanOrEqual(1)
    }
    expect(tried).toBeGreaterThan(3)
    expect(pageErrors).toEqual([])
  })
}

/**
 * On a phone a step taller than the screen scrolls, and all of it can be
 * reached: the reveal starts where scrolling starts, under its title. It was
 * centred in its room, so half of what didn't fit sat above the top: the
 * money summary of 60 never showed its first 23 rows, and a tie covered its
 * own title. A tie is drawn smaller only so far (then it scrolls), never to
 * 9 px names.
 */
for (const fixture of ['full12-finished', 'large60', 'auction12', 'friends8']) {
  test(`393×852, ${fixture}: every step can be scrolled through from its title, and no tie is drawn below three quarters`, async ({ page, pageErrors }) => {
    test.setTimeout(180_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto(`/t/_/${fixture}/ceremonia`, { waitUntil: 'networkidle' })
    let revealed = 0
    for (let i = 0; i < 150; i++) {
      const now = await beat(page, 'ArrowRight')
      if (now.title === C.done) break
      if (now.waiting) continue
      revealed++
      const label = `step «${now.title}» ${now.range}`
      const at = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('[class*="_body_"]')!
        body.scrollTop = 0
        const area = document.querySelector<HTMLElement>('[data-area]')!
        const reveal = area.querySelector<HTMLElement>('[data-reveal]')!
        const title = area.parentElement!.querySelector('h2')!.getBoundingClientRect()
        const zooms = [area.style.getPropertyValue('--fit'), reveal.querySelector<HTMLElement>('[data-winners]')?.style.getPropertyValue('--wfit') ?? ''].filter(Boolean).map(Number)
        return { above: area.getBoundingClientRect().top - reveal.getBoundingClientRect().top, overTitle: title.bottom - reveal.getBoundingClientRect().top, zoom: Math.min(1, ...zooms) }
      })
      expect(at.above, `${label}: the reveal starts above where scrolling reaches (px)`).toBeLessThanOrEqual(1)
      expect(at.overTitle, `${label}: the reveal covers its title (px)`).toBeLessThanOrEqual(1)
      expect(at.zoom, `${label}: drawn smaller than a phone allows`).toBeGreaterThanOrEqual(0.75)
    }
    expect(revealed).toBeGreaterThan(0)
    expect(pageErrors).toEqual([])
  })
}

test('a tie set as a compact list goes back to full size once the screen has room for it', async ({ page }) => {
  test.setTimeout(120_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto(`/t/_/${FIXTURE}/ceremonia`, { waitUntil: 'networkidle' })
  // To the pairs' podium: two winners side by side, at full size.
  for (let i = 0; i < 60; i++) {
    const now = await beat(page, 'ArrowRight')
    if (now.title === C.steps.pairs('Los Matrimonios') && !now.waiting) break
  }
  const compact = page.locator('[data-area] [data-compact]')
  await expect(compact).toHaveCount(0)
  // Names too long for that room: the tie becomes a compact list.
  const names = await page.locator('[data-area] [data-name]').evaluateAll((els) =>
    els.map((el) => {
      const was = el.firstChild!.textContent!
      el.firstChild!.textContent = 'Maximilianomaximilianomaximiliano'
      return was
    }),
  )
  await page.setViewportSize({ width: 1024, height: 718 })
  await expect(compact).toHaveCount(1)
  // The names back as they were, and the room changes: it is fitted again, at full size (the compact list used to stay).
  await page.locator('[data-area] [data-name]').evaluateAll((els, was) => els.forEach((el, i) => (el.firstChild!.textContent = was[i]!)), names)
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(compact).toHaveCount(0)
  expect((await fits(page)).outside).toEqual([])
})

test('a second press right after a reveal pages the list, never leaving the step (UX-18)', async ({ page }) => {
  test.setTimeout(180_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/t/_/large60/ceremonia', { waitUntil: 'networkidle' })
  // To the money summary, waiting for «Revelar»: its list takes several pages.
  for (let i = 0; i < 150; i++) {
    const now = await beat(page, 'ArrowRight')
    if (now.title === C.steps.money && now.waiting) break
  }
  expect((await where(page)).title).toBe(C.steps.money)
  // A clicker's double press: the reveal, then the next press a moment later (a task, a frame, a microtask).
  for (const gap of ['task', 'frame', 'microtask'] as const) {
    await page.evaluate(async (gap) => {
      const press = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }))
      press()
      if (gap === 'task') await new Promise((r) => setTimeout(r, 0))
      else if (gap === 'frame') await new Promise((r) => requestAnimationFrame(() => r(null)))
      else await Promise.resolve()
      press()
    }, gap)
    await expect.poll(async () => (await where(page)).settled).toBe(true)
    const now = await where(page)
    expect(now.title, `after a ${gap}`).toBe(C.steps.money)
    expect(now.range, `after a ${gap}`).toMatch(/^\d+–\d+ de 60$/)
    expect(now.range, `after a ${gap}`).not.toMatch(/^1–/)
    // Back to the step waiting: the first page, the step before (waiting), its reveal, then this step again.
    await beat(page, 'ArrowLeft')
    await beat(page, 'ArrowLeft')
    await beat(page, 'ArrowRight')
    const back = await beat(page, 'ArrowRight')
    expect(back.title).toBe(C.steps.money)
    expect(back.waiting).toBe(true)
  }
})

test('after a mouse click on «Siguiente», Space reveals the next step instead of skipping it (UX-18)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`/t/_/${FIXTURE}/ceremonia`, { waitUntil: 'networkidle' })
  const next = page.getByRole('button', { name: C.next })
  // The mouse starts the show from «Siguiente», which keeps the focus.
  await next.click()
  await expect.poll(async () => (await where(page)).settled).toBe(true)
  let now = await where(page)
  expect(now.progress).toMatch(/^1 \//)
  expect(now.waiting).toBe(true)
  // Space on it is the next beat: the reveal of step 1, not step 2 unrevealed.
  await page.keyboard.press(' ')
  await expect.poll(async () => (await where(page)).waiting).toBe(false)
  now = await where(page)
  expect(now.progress).toMatch(/^1 \//)
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await where(page)).progress).toMatch(/^2 \//)
  expect((await where(page)).waiting).toBe(true)
})

test('on a phone a long step scrolls, and the scrolling region can be reached by keyboard (axe)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('/t/_/friends8/ceremonia', { waitUntil: 'networkidle' })
  let scrolled = false
  for (let i = 0; i < 40 && !scrolled; i++) {
    const now = await beat(page, 'ArrowRight')
    if (now.title === C.done) break
    if (now.waiting) continue
    scrolled = (await fits(page)).over > 1
  }
  expect(scrolled).toBe(true)
  const results = await new AxeBuilder({ page }).withRules(['scrollable-region-focusable']).analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
})

test('the auction console keeps the yellow focus ring on its board-green lot card (A11Y-15)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/t/_/auction12/admin/calcutta', { waitUntil: 'networkidle' })
  const card = page.locator('[class*="_lotCard_"]').first()
  await expect(card).toBeVisible()
  // The card's ring is the board's yellow, not the paper's graphite.
  expect(await card.evaluate((el) => getComputedStyle(el).getPropertyValue('--focus-ring').trim())).toBe(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--board-accent').trim()))
  const control = card.locator('button, a').first()
  if (await control.count()) {
    await control.focus()
    expect(await control.evaluate((el) => getComputedStyle(el).outlineColor)).toBe(BOARD_ACCENT)
  }
})
