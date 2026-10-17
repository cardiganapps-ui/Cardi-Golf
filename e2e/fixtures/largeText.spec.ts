/**
 * A11Y-07, A11Y-08, VIS-20: the phone's text size, and the small phone.
 *
 * At 200 % text the core screens broke: the board's «HOY HOYO PUNTOS» ran together, «Puntos | G» and «Por jueg» were
 * cut, «Por asignar: $3,000» left the screen and every «Pone $6,0…» lost its figures; the tab bar's labels broke
 * under their icons and covered «Guardar hoyo». And the installed app never got large text at all: an iPhone tells a
 * page its Dynamic Type only through `-apple-system-body`, which nothing read.
 *
 * Here the text is set as an iPhone at its largest accessibility size would set it: the browser says it knows
 * `-apple-system-body` and resolves it to 34 px, and the app's own code (src/lib/textSize.ts) turns that into the
 * root size, 200 %. Every main screen then has no horizontal scroll, nothing past the screen's edge and no figure
 * cut off in its box, and nothing the keyboard reaches hides under a sticky bar.
 *
 * On a 375×667 phone (VIS-20) En vivo's first row starts within 200 px and 8 rows show above the tab bar (it was
 * 381 px and 4 rows), and the Tarjeta's save bar is a solid band down to the tab bar.
 */
import type { Page } from '@playwright/test'
import { expect, open, test } from './base'

/** WebKit's Dynamic Type, as the page sees it: `-apple-system-body` is a font it knows, at `px`. */
async function dynamicType(page: Page, px: number) {
  await page.addInitScript((bodyPx) => {
    const supports = CSS.supports.bind(CSS)
    CSS.supports = ((a: string, b?: string) => (a === 'font' && b === '-apple-system-body' ? true : b === undefined ? supports(a) : supports(a, b)))
    const style = window.getComputedStyle.bind(window)
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      const real = style(el, pseudo)
      if (!(el instanceof HTMLElement) || el.dataset.textProbe === undefined) return real
      return new Proxy(real, { get: (target, key) => (key === 'fontSize' ? `${bodyPx}px` : Reflect.get(target, key)) })
    })
  }, px)
}

/** What the page shows past its edge, scrolls sideways, or cuts off: a figure in a box too small for it. */
function breaks(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const out: string[] = []
    if (document.documentElement.scrollWidth > vw) out.push(`the page scrolls sideways: ${document.documentElement.scrollWidth} px in ${vw}`)
    const what = (el: Element) => `${el.tagName.toLowerCase()} «${(el.textContent ?? '').trim().slice(0, 40)}»`
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || el.closest('.sr-only, [aria-hidden="true"]')) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden') continue
      // Inside a box that scrolls sideways (the card's grid, Juegos' games) the rest is a swipe away, not lost.
      let inScroller = false
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowX)) inScroller = true
      if (!inScroller && r.right > vw + 1) out.push(`${what(el)} ends at ${Math.round(r.right)} px, past the ${vw} px screen`)
      // A figure cut off in its box: a box that clips, holding a digit, narrower than what it holds. A choice of values
      // is no such box: its last rules fall under its own edge on purpose (primitives.module.css).
      const clips = cs.textOverflow === 'ellipsis' || /hidden|clip/.test(cs.overflowX)
      const choice = el.matches('[role="radiogroup"], [role="tablist"]')
      if (clips && !choice && /\d/.test(el.textContent ?? '') && el.scrollWidth > el.clientWidth + 1) out.push(`${what(el)} is cut: ${el.clientWidth} px for ${el.scrollWidth}`)
    }
    return out
  })
}

const LIVE = '/t/_/full12-live'
/** The four tabs and the Tarjeta, and each view inside them a player reads (A11Y-07). */
const SCREENS: Array<{ name: string; path: string; then?: (page: Page) => Promise<void> }> = [
  { name: 'En vivo', path: LIVE },
  { name: 'En vivo, 60 players', path: '/t/_/large60' },
  { name: 'En vivo, long names', path: '/t/_/longnames' },
  { name: 'Tarjeta', path: `${LIVE}/tarjeta` },
  { name: 'Tarjeta, the whole card', path: `${LIVE}/tarjeta`, then: (p) => p.getByRole('button', { name: /^Ver tarjeta$/ }).click() },
  { name: 'Juegos', path: `${LIVE}/juegos` },
  ...['individual', 'pairs', 'bestRound', 'snake', 'fewestPutts', 'auction'].map((game) => ({
    name: `Juegos, ${game}`,
    path: `${LIVE}/juegos`,
    then: (p: Page) => p.locator(`[data-game="${game}"]`).click(),
  })),
  { name: 'Dinero', path: `${LIVE}/dinero` },
  { name: 'Dinero, por juego', path: `${LIVE}/dinero`, then: (p) => p.getByRole('radio', { name: 'Por juego' }).click() },
  { name: 'Dinero, liquidación', path: `${LIVE}/dinero`, then: (p) => p.getByRole('radio', { name: 'Liquidación' }).click() },
  { name: 'Dinero, final', path: '/t/_/full12-final/dinero' },
  { name: 'Más', path: `${LIVE}/mas` },
]

test.describe('at 200 % text, as Dynamic Type sets it (A11Y-07, A11Y-08)', () => {
  test.beforeEach(async ({ page }) => dynamicType(page, 34))

  test('the phone’s text size becomes the root size: iOS 34 px is 200 %', async ({ page }) => {
    await open(page, LIVE)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px')
    // Large, and short for its text on a 393×852 phone: 26.6 rem tall.
    expect(await page.evaluate(() => [document.documentElement.hasAttribute('data-text-large'), document.documentElement.hasAttribute('data-short')])).toEqual([true, true])
  })

  for (const viewport of [{ width: 393, height: 852 }, { width: 375, height: 667 }]) {
    test.describe(`${viewport.width}×${viewport.height}`, () => {
      test.use({ viewport })
      for (const s of SCREENS) {
        test(`${s.name}: no sideways scroll, nothing past the edge, no figure cut`, async ({ page }) => {
          await open(page, s.path)
          if (s.then) {
            await s.then(page)
            await page.waitForTimeout(300)
          }
          expect(await breaks(page)).toEqual([])
        })
      }
    })
  }

  test('the board keeps each figure under its header: «HOY», «HOYO» and «PUNTOS» stay apart', async ({ page }) => {
    await open(page, LIVE)
    const heads = await page.locator('[class*="boardHead"] > span').evaluateAll((els) =>
      els.filter((e) => (e.textContent ?? '').trim()).map((e) => {
        const range = document.createRange()
        range.selectNodeContents(e)
        const r = range.getBoundingClientRect()
        return { text: (e.textContent ?? '').trim(), left: r.left, right: r.right }
      }),
    )
    expect(heads.map((h) => h.text)).toEqual(['Hoy', 'Hoyo', 'Puntos'])
    for (let i = 1; i < heads.length; i++) expect(heads[i].left, `${heads[i - 1].text} runs into ${heads[i].text}`).toBeGreaterThan(heads[i - 1].right + 4)
  })

  test('the tab bar grows with its words and never covers the Tarjeta’s «Guardar hoyo»', async ({ page }) => {
    await open(page, `${LIVE}/tarjeta`)
    const save = page.getByRole('button', { name: 'Guardar hoyo' })
    await save.scrollIntoViewIfNeeded()
    const [btn, bar] = await Promise.all([save.boundingBox(), page.getByRole('navigation', { name: 'Secciones' }).boundingBox()])
    expect(btn!.y + btn!.height).toBeLessThanOrEqual(bar!.y + 1)
    // Every tab's word fits on the bar, none cut.
    const tabs = await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link').evaluateAll((els) => els.map((e) => e.scrollWidth <= e.clientWidth + 1))
    expect(tabs.every(Boolean)).toBe(true)
  })

  for (const path of [`${LIVE}/tarjeta`, `${LIVE}/dinero`]) {
    test(`${path}: what the keyboard focuses is never under a sticky bar (A11Y-06 at 200 %)`, async ({ page }) => {
      await open(page, path)
      const covered: string[] = []
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab')
        const hit = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          if (!el || el === document.body) return null
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= innerWidth) return null
          const at = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), r.top + r.height / 2)
          return at && (at === el || el.contains(at) || at.contains(el)) ? null : `«${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}»`
        })
        if (hit) covered.push(hit)
      }
      expect(covered).toEqual([])
    })
  }
})

test.describe('a 375×667 phone (VIS-20)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('En vivo: the first row within 200 px, and 8 rows above the tab bar', async ({ page }) => {
    await open(page, LIVE)
    const m = await page.evaluate(() => {
      const tab = document.querySelector('nav[aria-label="Secciones"]')!.getBoundingClientRect().top
      const rows = Array.from(document.querySelectorAll('[class*="leaderRow"]')).map((r) => r.getBoundingClientRect())
      return { first: rows[0].top, shown: rows.filter((r) => r.top >= 0 && r.bottom <= tab + 0.5).length }
    })
    expect(m.first).toBeLessThanOrEqual(200)
    expect(m.shown).toBeGreaterThanOrEqual(8)
    // «Anotar el hoyo 12» is still one tap away, above the board.
    await expect(page.getByRole('link', { name: 'Anotar el hoyo 12' })).toBeInViewport()
  })

  test('the Tarjeta: the save bar is a solid band down to the tab bar', async ({ page }) => {
    await open(page, `${LIVE}/tarjeta`)
    const m = await page.evaluate(() => {
      const bar = document.querySelector('[class*="saveBar"]')!
      const save = bar.getBoundingClientRect()
      const tab = document.querySelector('nav[aria-label="Secciones"]')!.getBoundingClientRect()
      return { gap: tab.top - save.bottom, background: getComputedStyle(bar).backgroundColor, page: getComputedStyle(document.body).backgroundColor }
    })
    expect(Math.abs(m.gap)).toBeLessThanOrEqual(1)
    expect(m.background).toBe(m.page)
    // Nothing of a player shows between the button and the tab bar: what is there is the bar itself.
    const under = await page.evaluate(() => {
      const bar = document.querySelector('[class*="saveBar"]')!
      const r = bar.getBoundingClientRect()
      return [r.bottom - 2, r.bottom - 6].map((y) => bar.contains(document.elementFromPoint(innerWidth / 2, y)))
    })
    expect(under).toEqual([true, true])
  })
})

test.describe('landscape (A11Y-07)', () => {
  test.use({ viewport: { width: 852, height: 393 } })

  test('the Tarjeta: the save bar scrolls with the card and the tab bar gives back its icons’ height', async ({ page }) => {
    await open(page, `${LIVE}/tarjeta`)
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-short'))).toBe(true)
    expect(await page.locator('[class*="saveBar"]').evaluate((el) => getComputedStyle(el).position)).toBe('static')
    const bar = await page.getByRole('navigation', { name: 'Secciones' }).boundingBox()
    expect(bar!.height).toBeLessThanOrEqual(50)
    // Between the header and the tab bar the card has 289 px of the 393, with no save bar on it: it was 206 (A11Y-07).
    const header = await page.locator('header').first().boundingBox()
    expect(bar!.y - (header!.y + header!.height)).toBeGreaterThanOrEqual(285)
    // Each player's steppers, scrolled to, are under nothing.
    for (const group of await page.getByRole('group').all()) {
      await group.scrollIntoViewIfNeeded()
      const clear = await group.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return [r.top + 4, r.top + r.height / 2, r.bottom - 4].every((y) => el.contains(document.elementFromPoint(r.left + r.width / 2, y)))
      })
      expect(clear).toBe(true)
    }
  })
})
