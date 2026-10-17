/**
 * VIS-26: Juegos' game tabs. They were a boxed pill strip that scrolled off both edges with no sign of more,
 * cutting labels mid-word («ejor ronda», «La Ví»), and the chosen game could sit out of view. Now:
 * - the strip is the in-page tab style (an underline under the chosen tab, no box, no fill: VIS-17);
 * - its edges fade where more tabs are hidden, and only there;
 * - the chosen tab is brought fully into view, opened from the list or chosen in the strip.
 */
import type { Locator } from '@playwright/test'
import { expect, open, test } from './base'

/** The chosen tab's box against its strip's: true when it is whole inside it. */
async function wholeInStrip(tab: Locator) {
  return tab.evaluate((el) => {
    const strip = el.parentElement!.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return r.left >= strip.left - 0.5 && r.right <= strip.right + 0.5
  })
}
const fades = (strip: Locator) => strip.evaluate((el) => ({ start: el.hasAttribute('data-more-start'), end: el.hasAttribute('data-more-end'), mask: getComputedStyle(el).maskImage || getComputedStyle(el).getPropertyValue('-webkit-mask-image') }))

for (const width of [375, 393]) {
  test(`the game tabs are underlined, fade where more hide, and keep the chosen one in view at ${width}px (VIS-26)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 })
    await open(page, '/t/_/full12-live/juegos')
    // Opened from the overview on the last game: the strip shows it whole.
    await page.locator('[data-game="auction"]').click()
    const strip = page.getByRole('tablist')
    const chosen = strip.getByRole('tab', { selected: true })
    await expect(chosen).toHaveText(/Calcutta/)
    await expect.poll(() => wholeInStrip(chosen)).toBe(true)
    const style = await chosen.evaluate((el) => {
      const s = getComputedStyle(el)
      return { border: s.borderBottomWidth, bg: s.backgroundColor, radius: s.borderTopLeftRadius }
    })
    expect(style.border).toBe('2px')
    expect(style.bg).toBe('rgba(0, 0, 0, 0)')
    expect(await strip.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px')
    // At the end of the strip: more hides before it, none after.
    await expect.poll(() => fades(strip)).toMatchObject({ start: true, end: false })
    expect((await fades(strip)).mask).not.toBe('none')
    // Back to the first game, chosen in the strip: brought into view, and the fade turns round.
    await strip.getByRole('tab').first().click()
    await expect(strip.getByRole('tab', { selected: true })).toHaveText(/Individual/)
    await expect.poll(() => wholeInStrip(strip.getByRole('tab', { selected: true }))).toBe(true)
    await expect.poll(() => fades(strip)).toMatchObject({ start: false, end: true })
  })
}
