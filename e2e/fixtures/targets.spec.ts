/**
 * A11Y-16: on a phone every control is a full tap target: 44 px tall at least
 * (WCAG 2.5.5's 44, the brief's 48 for the controls built on --tap). Measured on
 * the main screens with a coarse pointer, as the players hold them.
 */
import { expect, open, test } from './base'

const SCREENS = [
  '/t/_/full12-live',
  '/t/_/full12-live/juegos',
  '/t/_/full12-live/dinero',
  '/t/_/full12-live/tarjeta',
  '/t/_/full12-live/mas',
  '/t/_/full12-live/stats',
  // The Comité's screens the review measured: the «?» beside each handicap, the day tabs.
  '/t/_/full12-live/admin/handicaps',
  '/t/_/full12-live/admin/grupos',
  '/t/_/full12-live/admin/scores',
]

for (const path of SCREENS) {
  test(`${path}: every control is at least 44 px tall (A11Y-16)`, async ({ page }) => {
    await open(page, path)
    const { small, measured } = await page.evaluate(() => {
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          'button, a[href], [role="tab"], [role="switch"], select, input:not([type="hidden"])',
        ),
      )
      const small = controls
        .filter((el) => {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') return false
          // A link inside a sentence is text (WCAG 2.5.5's inline exception).
          if (el.tagName === 'A' && el.closest('p, li') && !el.className) return false
          // A switch's target is the whole row it labels (`Toggle`): measure that.
          const label = el.tagName === 'INPUT' ? el.closest('label') : null
          return (label ? label.getBoundingClientRect().height : r.height) < 44
        })
        .map(
          (el) =>
            `${el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}» ${Math.round(el.getBoundingClientRect().height)} px`,
        )
      return { small, measured: controls.length }
    })
    // The screen itself rendered, not a redirect or an error.
    expect(measured).toBeGreaterThan(5)
    expect(small).toEqual([])
  })
}
