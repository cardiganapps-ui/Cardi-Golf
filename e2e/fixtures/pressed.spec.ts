/**
 * MOT-12: every control a player taps shows the touch. The review forced `:active` on every visible tappable of
 * the main screens: 14 of En vivo's 22 changed nothing (all twelve board rows and the Puntos/Gross switch), and
 * so did the Tarjeta's four «Levantó», Dinero's switch and twenty of Mi Polo's badges. Here each one must change
 * how it is painted when pressed: its background, colour, border, shadow, outline, transform, filter or opacity.
 */
import type { Page } from '@playwright/test'
import { expect, open, test } from './base'

const SCREENS = [
  ['En vivo', '/t/_/full12-live'],
  ['Tarjeta', '/t/_/full12-live/tarjeta'],
  ['Juegos', '/t/_/full12-live/juegos'],
  ['Dinero', '/t/_/full12-live/dinero'],
  ['Más', '/t/_/full12-live/mas'],
  ['Estadísticas', '/t/_/full12-live/stats'],
  ['Mi Polo', '/p/_/yo'],
] as const
const PAINT = ['background-color', 'color', 'border-top-color', 'box-shadow', 'outline-style', 'transform', 'filter', 'opacity', 'text-decoration-line']

/** The visible, enabled controls with no pressed state: forcing `:active` on each changes none of PAINT. */
async function unpressable(page: Page) {
  const n = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role="button"], summary')).filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]')
    })
    els.forEach((el, i) => el.setAttribute('data-press-i', String(i)))
    return els.length
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const read = (i: number) =>
    page.evaluate(
      ([i, props]) => {
        const el = document.querySelector(`[data-press-i="${i}"]`)!
        const cs = getComputedStyle(el)
        return (props as string[]).map((p) => cs.getPropertyValue(p))
      },
      [i, PAINT] as const,
    )
  const none: string[] = []
  for (let i = 0; i < n; i++) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-press-i="${i}"]` })
    if (!nodeId) continue
    const rest = await read(i)
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] })
    const pressed = await read(i)
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
    if (rest.every((v, j) => v === pressed[j]))
      none.push(await page.evaluate((i) => {
        const el = document.querySelector(`[data-press-i="${i}"]`)!
        return `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} «${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}»`
      }, i))
  }
  return { n, none }
}

for (const [name, path] of SCREENS) {
  test(`${name}: every control shows it is pressed (MOT-12)`, async ({ page }) => {
    // No transitions to wait out: the pressed state is read as it lands.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, path)
    const { n, none } = await unpressable(page)
    expect(n).toBeGreaterThan(5)
    expect(none).toEqual([])
  })
}
