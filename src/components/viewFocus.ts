/**
 * Focus after a view changes in place (A11Y-12, A11Y-13). When a tap swaps a
 * screen's content (a game opened in Juegos, a wizard step, the Tarjeta's
 * grid), the control that had focus usually goes with the old view, and the
 * browser drops focus to <body>: a screen reader is left nowhere and the next
 * Tab starts from the top of the page. These move it to the new view's heading
 * instead, or, going back, to the control that opened the view.
 *
 * Focus never scrolls the page (`preventScroll`): what is on screen stays put,
 * and a screen reader brings the heading into view itself.
 */
import { useLayoutEffect, useRef } from 'react'

/** Whether focus was dropped: on nothing, on the page itself, on an element no longer in it, or on a control that went disabled. */
export function focusLost(): boolean {
  const el = document.activeElement
  if (!el || el === document.body || el === document.documentElement || !el.isConnected) return true
  return (el as HTMLButtonElement).disabled === true
}

/**
 * Focuses `el` without scrolling. A heading or a landmark is not focusable on
 * its own: it gets `tabindex="-1"`, so a script can focus it but Tab still
 * passes it by. Returns whether it took focus.
 */
export function focusQuietly(el: Element | null | undefined): boolean {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false
  if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.tabIndex = -1
  el.focus({ preventScroll: true })
  return document.activeElement === el
}

/**
 * When `view` changes (never on the first render), focus what `target`
 * returns for the new view. By default only when focus was dropped
 * (`focusLost`): a control that survived the swap (a tab bar, a toggle) keeps
 * it. `always`: the view changed on the person's own step (the wizard's
 * «Siguiente»), so its heading is where they are now.
 */
export function useViewFocus(view: string | number | null, target: (view: string | number | null, from: string | number | null) => Element | null | undefined, opts: { always?: boolean } = {}) {
  const seen = useRef(view)
  const latest = useRef(target)
  latest.current = target
  useLayoutEffect(() => {
    const from = seen.current
    if (from === view) return
    seen.current = view
    if (!opts.always && !focusLost()) return
    focusQuietly(latest.current(view, from))
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps -- when the view changes; the target is read as it is then
}
