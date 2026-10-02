/**
 * Render-test helpers (TRUST-05), never imported by the app.
 *
 * A line that only exists in the page proves little: it can sit behind the
 * hidden attribute, in a visually hidden span, or at a size nobody reads, and
 * a text match still finds it. `expectShown` checks what the reader gets:
 * nothing hides it or anything around it, and its text is at least the
 * smallest size the design sets for reading. Sizes are computed from the real
 * tokens, so a test calls `loadTokens()` before it renders.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'

/** The smallest text the design sets for reading: --fs-xs in tokens.css. */
export const MIN_READING_PX = 12

/** src/styles/tokens.css in the test document, so `var(--fs-xs)` computes to its size. */
export function loadTokens() {
  if (document.head.querySelector('style[data-tokens]')) return
  const style = document.createElement('style')
  style.dataset.tokens = ''
  style.textContent = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')
  document.head.append(style)
}

/** In the page, saying something, hidden by nothing, and readable. */
export function expectShown(el: HTMLElement) {
  expect(el.isConnected).toBe(true)
  expect(el.textContent?.trim(), 'it says nothing').toBeTruthy()
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const what = `<${n.tagName.toLowerCase()}${n.className ? ` class="${n.className}"` : ''}>`
    expect(n.hidden, `${what} is hidden`).toBe(false)
    expect(n.getAttribute('aria-hidden'), `${what} is aria-hidden`).not.toBe('true')
    expect(n.classList.contains('sr-only'), `${what} is for screen readers only`).toBe(false)
    const style = getComputedStyle(n)
    expect(style.display, `${what} has display: none`).not.toBe('none')
    expect(style.visibility, `${what} has visibility: hidden`).not.toBe('hidden')
    expect(style.opacity, `${what} is transparent`).not.toBe('0')
  }
  const size = parseFloat(getComputedStyle(el).fontSize)
  expect(size, `font size ${getComputedStyle(el).fontSize}`).toBeGreaterThanOrEqual(MIN_READING_PX)
}
