/**
 * Render-test helpers, never imported by the app: what a screen reader hears for a control, and what a reader sees.
 *
 * Most controls are named by `aria-label`. A board row is named by its content: its cells are hidden from a screen
 * reader and its words sit in a visually hidden span (`LeaderRow`, WCAG 2.5.3), so its name is that span's text.
 */
export function spokenName(el: Element): string {
  return el.getAttribute('aria-label') ?? el.querySelector(':scope > .sr-only')?.textContent ?? el.textContent ?? ''
}

/** What a sighted reader sees of a control: its text without the visually hidden words. */
export function shownText(el: Element): string {
  const copy = el.cloneNode(true) as Element
  for (const hidden of Array.from(copy.querySelectorAll('.sr-only'))) hidden.remove()
  return copy.textContent
}
