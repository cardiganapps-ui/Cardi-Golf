/**
 * A sheet is modal for the keyboard too (A11Y-03): while one is open the rest
 * of the page is `inert` and Tab goes round inside it.
 *
 * Sheets render where they are used, inside the screen's tree (a tournament's
 * accent and the screen's styles reach them there), so the page behind one is
 * not a single sibling to switch off. The page is made inert around the top
 * sheet instead: at every level from the sheet up to <body>, each sibling of
 * that branch. The branch itself stays live, so the sheet's own ancestors keep
 * working, and a sheet opened inside another (the «¿Descartar…?» question)
 * leaves its parent inert around it.
 *
 * One stack for every sheet: only the top one counts, and the attributes are
 * recomputed whenever a sheet opens or closes, so two sheets in different
 * branches never leave each other inert. Status regions (the toasts, the
 * offline line) stay out of it: inert content is hidden from a screen reader,
 * and what they say while a sheet is open must still be heard.
 *
 * Tab and Shift+Tab are also wrapped by hand at the sheet's edges: the
 * fallback where `inert` does nothing, and the browsers that would otherwise
 * leave the page for their own toolbar after the last field.
 */

/** The open sheets' outermost elements, the top one last. */
const stack: HTMLElement[] = []
/** The elements this module made inert, to give back exactly those. */
const applied = new Set<Element>()

/** Never made inert: what a screen reader must keep hearing, and what isn't content. */
const KEEP = '[aria-live], [role="status"], [role="alert"], script, style, template'

function apply() {
  for (const el of applied) el.removeAttribute('inert')
  applied.clear()
  const top = stack[stack.length - 1]
  if (!top?.isConnected) return
  for (let node: Element = top; node.parentElement && node !== document.body; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      // Someone else's inert is theirs to take off.
      if (sibling === node || sibling.matches(KEEP) || sibling.hasAttribute('inert')) continue
      sibling.setAttribute('inert', '')
      applied.add(sibling)
    }
  }
}

/** A sheet opened: everything around it goes inert. */
export function modalOpened(el: HTMLElement) {
  stack.push(el)
  apply()
}

/** A sheet closed or unmounted: the page comes back, or the sheet under it becomes the top one. */
export function modalClosed(el: HTMLElement) {
  const i = stack.lastIndexOf(el)
  if (i >= 0) stack.splice(i, 1)
  apply()
}

const TABBABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  'iframe',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[tabindex]',
].join(', ')

function shown(el: HTMLElement): boolean {
  // `checkVisibility` knows closed <details>, display: none and visibility: hidden; where it is missing, trust the DOM.
  return typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true } as CheckVisibilityOptions) : true
}

/** What Tab stops on inside `root`, in order: one radio per group (the checked one), nothing inert, hidden or disabled. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  const radios = new Set<string>()
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(TABBABLE))) {
    if (el.tabIndex < 0 || el.closest('[inert]') || el.closest('fieldset[disabled]') || !shown(el)) continue
    if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
      const group = `${el.form?.id ?? ''}:${el.name}`
      if (radios.has(group)) continue
      const checked = root.querySelector<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(el.name)}"]:checked`)
      if (checked && checked !== el) continue
      radios.add(group)
    }
    out.push(el)
  }
  return out
}

/**
 * Tab at the sheet's last stop goes to its first, Shift+Tab at its first (or
 * on the sheet itself, where focus lands when it opens) to its last; anything
 * else is left to the browser, which stays inside because the page is inert.
 * Returns whether it moved focus.
 */
export function wrapTab(frame: HTMLElement, e: KeyboardEvent): boolean {
  if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return false
  const stops = tabbables(frame)
  const active = document.activeElement as HTMLElement | null
  const inside = !!active && frame.contains(active)
  if (stops.length === 0) {
    // Nothing to stop on: focus stays on the sheet.
    e.preventDefault()
    frame.focus({ preventScroll: true })
    return true
  }
  const first = stops[0]!
  const last = stops[stops.length - 1]!
  const at = inside ? stops.indexOf(active!) : -1
  let to: HTMLElement | null = null
  if (!inside) to = e.shiftKey ? last : first
  else if (e.shiftKey && (active === frame || at === 0)) to = last
  else if (!e.shiftKey && at === stops.length - 1) to = first
  // On something Tab doesn't stop at (a heading focused by the screen): the next stop after it is the browser's to find.
  if (!to) return false
  e.preventDefault()
  to.focus()
  return true
}

/** Tests only. */
export const _modalFocusTest = {
  reset() {
    stack.length = 0
    for (const el of applied) el.removeAttribute('inert')
    applied.clear()
  },
}
