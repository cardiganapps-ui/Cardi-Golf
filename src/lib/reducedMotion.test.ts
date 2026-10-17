// @vitest-environment happy-dom
/** MOT-15: the Comité's «Ver» scrolled smoothly under reduced motion. A scroll the app makes follows the preference. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion, scrollBehavior } from './reducedMotion'

const prefer = (reduce: boolean) =>
  vi
    .spyOn(window, 'matchMedia')
    .mockImplementation(
      (q: string) => ({ matches: reduce && q === '(prefers-reduced-motion: reduce)', media: q }) as MediaQueryList,
    )

afterEach(() => vi.restoreAllMocks())

describe('reduced motion', () => {
  it('a scroll glides only when the person has not asked for less motion', () => {
    prefer(false)
    expect(prefersReducedMotion()).toBe(false)
    expect(scrollBehavior()).toBe('smooth')
    prefer(true)
    expect(prefersReducedMotion()).toBe(true)
    expect(scrollBehavior()).toBe('auto')
  })
})
