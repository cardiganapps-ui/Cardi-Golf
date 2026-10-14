/** The Tarjeta's clocks (§9.3): how long the card waits, guards and shows things around a save. */

/** Taps on «Guardar hoyo» this soon after the hole changed are ignored: a double tap must not save the next hole (UX-02). */
export const SETTLE_MS = 700
/** A save of untouched defaults this soon after the last save asks first. */
export const DOUBLE_SAVE_MS = 3000
/** How long the last save stays in the save bar with its «Corregir». */
export const SAVED_NOTE_MS = 6000
/** «Guardado» on the resting button after a save: the hand sees the save land before the next tap (MOT-02). */
export const SAVED_CHECK_MS = 400
/** How long «La víbora pasa a…» stays under the hole (MOT-07). */
export const SNAKE_NOTE_MS = 5000
/** How far the next hole comes in from, in the direction the card moved (MOT-02). */
export const SLIDE_PX = 24
/** A page that draws no frames still takes the save onto the boards this soon. */
export const PAINT_WAIT_MS = 100

/**
 * Once the frame being prepared is on screen: a task after the next animation frame, or PAINT_WAIT_MS at most,
 * or at once when the page goes away (a locked phone, the app closed or put away draws no frame, and its timers
 * may never run again).
 */
export function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(cap)
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', done)
      resolve()
    }
    const hidden = () => {
      if (document.visibilityState === 'hidden') done()
    }
    const cap = setTimeout(done, PAINT_WAIT_MS)
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', done)
    requestAnimationFrame(() => setTimeout(done, 0))
    hidden()
  })
}
