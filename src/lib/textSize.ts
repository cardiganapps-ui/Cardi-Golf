/**
 * The phone's text size (A11Y-08, A11Y-07). An iPhone tells web pages its
 * Dynamic Type setting (Ajustes › Accesibilidad › Pantalla y tamaño de texto ›
 * Texto más grande) only through the `-apple-system-*` font keywords, and the
 * installed app has no Safari «aA» menu, so Polo stayed at 16 px whatever the
 * phone said. Where the keyword exists (WebKit), the root size follows its
 * body size: 17 px is iOS's default and reads as our 16, every step from there
 * scales the rem the whole design is set in, between 16 px and 32 px (200 %,
 * the size A11Y-07's layout is checked at). Elsewhere nothing is set and the
 * browser's own text size reaches the rem as it always did.
 *
 * It also marks two things on <html> that a media query can't say, since its
 * `rem` is the browser's default size, not the page's (A11Y-07):
 * - `data-text-large`: the text is 125 % or more. A list row's lines wrap
 *   instead of cutting their figures off, and the bank's figures stack.
 * - `data-short`: the viewport is short for its text (landscape, or large
 *   text on a phone), under 32 rem tall. The Tarjeta's save bar scrolls with
 *   the card and the tab bar drops its icons, so the sticky bars don't take
 *   the screen.
 * Pieces that lay out by their own width (the boards, the tab bar, the
 * Tarjeta's steppers) use container queries in rem instead.
 */

/** iOS's body text at the default Dynamic Type size («Grande»), which the design's 16 px stands for. */
export const IOS_DEFAULT_BODY_PX = 17
export const ROOT_MIN_PX = 16
export const ROOT_MAX_PX = 32
/** Under this many rem tall, the sticky bars step aside (`data-short`). */
export const SHORT_REM = 32
/** From this root size (125 %), rows wrap (`data-text-large`). */
export const LARGE_PX = 20

/** The root size for the phone's body text size: iOS's 17 is our 16, clamped to 16–32 px. */
export function rootPxFor(bodyPx: number): number {
  const px = (bodyPx * ROOT_MIN_PX) / IOS_DEFAULT_BODY_PX
  return Math.round(Math.min(ROOT_MAX_PX, Math.max(ROOT_MIN_PX, px)) * 100) / 100
}

/** The phone's body text size in px, where the browser knows Dynamic Type; null elsewhere. */
export function systemBodyPx(doc: Document = document): number | null {
  const css = doc.defaultView?.CSS
  if (!css?.supports?.('font', '-apple-system-body')) return null
  const probe = doc.createElement('span')
  probe.dataset.textProbe = ''
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'font: -apple-system-body; position: absolute; visibility: hidden; pointer-events: none'
  probe.textContent = 'x'
  const host = doc.body ?? doc.documentElement
  host.appendChild(probe)
  const px = parseFloat(doc.defaultView!.getComputedStyle(probe).fontSize)
  probe.remove()
  return Number.isFinite(px) && px > 0 ? px : null
}

/** Sets the root size from the phone's text size, where it has one. Returns the size set, or null. */
export function applyTextSize(doc: Document = document): number | null {
  const body = systemBodyPx(doc)
  if (body == null) return null
  const px = rootPxFor(body)
  doc.documentElement.style.fontSize = `${px}px`
  return px
}

/** Marks the text large (LARGE_PX and up) and the viewport short for it (under SHORT_REM rem tall), or not. */
export function markViewport(doc: Document = document): { large: boolean; short: boolean } {
  const win = doc.defaultView
  if (!win) return { large: false, short: false }
  const root = parseFloat(win.getComputedStyle(doc.documentElement).fontSize) || ROOT_MIN_PX
  const large = root >= LARGE_PX
  const short = win.innerHeight / root < SHORT_REM
  doc.documentElement.toggleAttribute('data-text-large', large)
  doc.documentElement.toggleAttribute('data-short', short)
  return { large, short }
}

/**
 * Follows the phone's text size and the viewport for as long as the page lives: on start, each time the app comes
 * back (the setting is changed in Ajustes, outside it), and whenever the root size or the window changes, whatever
 * changed them (a 1 rem box watched for its size: Dynamic Type, the browser's zoom, a test).
 */
export function watchTextSize(doc: Document = document): () => void {
  const win = doc.defaultView
  if (!win) return () => undefined
  applyTextSize(doc)
  markViewport(doc)
  const onShow = () => {
    if (doc.visibilityState !== 'visible') return
    applyTextSize(doc)
    markViewport(doc)
  }
  const onResize = () => markViewport(doc)
  doc.addEventListener('visibilitychange', onShow)
  win.addEventListener('resize', onResize)
  let ruler: HTMLElement | null = null
  let observer: ResizeObserver | null = null
  if (typeof win.ResizeObserver === 'function') {
    ruler = doc.createElement('div')
    ruler.setAttribute('aria-hidden', 'true')
    ruler.style.cssText =
      'position: absolute; width: 1rem; height: 1rem; visibility: hidden; pointer-events: none; top: 0; left: 0'
    const host = doc.body ?? doc.documentElement
    host.appendChild(ruler)
    observer = new win.ResizeObserver(onResize)
    observer.observe(ruler)
  }
  return () => {
    doc.removeEventListener('visibilitychange', onShow)
    win.removeEventListener('resize', onResize)
    observer?.disconnect()
    ruler?.remove()
  }
}
