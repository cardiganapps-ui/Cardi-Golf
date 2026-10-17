/**
 * A11Y-06 (WCAG 2.2 2.4.11): a control the keyboard focuses is never hidden under
 * the sticky header, tab bar or Tarjeta save bar. On a 60-player board 24 of 40
 * focus stops sat fully under the tab bar. Tab through each screen and ask the
 * page what is at the centre of every focused control: it must be the control.
 */
import { expect, open, test } from './base'

const STOPS = 60

for (const path of ['/t/_/large60', '/t/_/full12-live/dinero', '/t/_/full12-live/tarjeta']) {
  test(`${path}: every focus stop is visible, not under a sticky bar (A11Y-06)`, async ({ page }) => {
    await open(page, path)
    const covered: string[] = []
    for (let i = 0; i < STOPS; i++) {
      await page.keyboard.press('Tab')
      const hit = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return null
        const r = el.getBoundingClientRect()
        // Out of the viewport sideways (a horizontal scroller's far item) or with no box: not this test's case.
        if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= innerWidth) return null
        const at = document.elementFromPoint(
          Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)),
          r.top + r.height / 2,
        )
        const ok = !!at && (at === el || el.contains(at) || at.contains(el))
        return ok
          ? null
          : `${el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}» under ${at ? `${at.tagName.toLowerCase()}.${String(at.className).slice(0, 40)}` : 'nothing'}`
      })
      if (hit) covered.push(hit)
    }
    expect(covered).toEqual([])
  })
}
