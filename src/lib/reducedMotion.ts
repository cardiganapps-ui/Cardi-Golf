/**
 * The person asked for less motion (MOT-15). For code outside Motion, which
 * honours it by itself through `<MotionConfig reducedMotion="user">`: a
 * scroll, a CSS animation's end. False where the browser can't say.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** How a scroll the app makes by itself moves: smooth, or at once under reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}
