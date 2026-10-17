// @vitest-environment happy-dom
/**
 * A11Y-08: the installed app ignored the phone's text size. Where the browser knows Dynamic Type (the
 * `-apple-system-body` keyword), the root size follows it, iOS's default reading as the design's 16 px; and a
 * viewport short for its text is marked so the sticky bars step aside (A11Y-07).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTextSize, markViewport, rootPxFor, systemBodyPx, watchTextSize } from './textSize'

/** The phone's Dynamic Type, as WebKit gives it: the keyword is supported and resolves to `bodyPx`. */
function dynamicType(bodyPx: number | null) {
  vi.spyOn(CSS, 'supports').mockImplementation((prop: string, value?: string) => bodyPx != null && prop === 'font' && value === '-apple-system-body')
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    if ((el as HTMLElement).dataset?.textProbe !== undefined) return { fontSize: `${bodyPx}px` } as CSSStyleDeclaration
    return real(el)
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.style.fontSize = ''
  document.documentElement.removeAttribute('data-short')
  document.documentElement.removeAttribute('data-text-large')
})

describe('the root size from the phone (A11Y-08)', () => {
  it('reads iOS default 17 px as 16, scales every step, and holds 16 to 32 px', () => {
    expect(rootPxFor(17)).toBe(16)
    expect(rootPxFor(19)).toBeCloseTo(17.88, 2)
    expect(rootPxFor(23)).toBeCloseTo(21.65, 2)
    expect(rootPxFor(28)).toBeCloseTo(26.35, 2)
    // The accessibility sizes stop at 200 %, the size the layout is checked at (A11Y-07)…
    expect(rootPxFor(53)).toBe(32)
    // …and the smaller ones keep the design's own size, never under the 12 px type floor (VIS-24).
    expect(rootPxFor(14)).toBe(16)
  })

  it('sets the rem from Dynamic Type where the browser has it', () => {
    dynamicType(28)
    expect(systemBodyPx()).toBe(28)
    expect(applyTextSize()).toBeCloseTo(26.35, 2)
    expect(document.documentElement.style.fontSize).toBe('26.35px')
    // The probe leaves nothing behind.
    expect(document.querySelector('[data-text-probe]')).toBeNull()
  })

  it('leaves the browser its own size where there is no Dynamic Type', () => {
    dynamicType(null)
    expect(systemBodyPx()).toBeNull()
    expect(applyTextSize()).toBeNull()
    expect(document.documentElement.style.fontSize).toBe('')
  })

  it('reads the setting again when the app comes back from Ajustes', () => {
    dynamicType(17)
    const stop = watchTextSize()
    expect(document.documentElement.style.fontSize).toBe('16px')
    vi.restoreAllMocks()
    dynamicType(40)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.documentElement.style.fontSize).toBe('32px')
    stop()
  })
})

describe('large text and a viewport short for it (A11Y-07)', () => {
  it('is large from 125 %, and short under 32 rem tall: landscape, or large text on a phone', () => {
    const html = document.documentElement
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(393)
    expect(markViewport()).toEqual({ large: false, short: true })
    expect(html.hasAttribute('data-short')).toBe(true)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(667)
    expect(markViewport()).toEqual({ large: false, short: false })
    expect(html.hasAttribute('data-short')).toBe(false)
    html.style.fontSize = '20px'
    expect(markViewport()).toEqual({ large: true, short: false })
    expect(html.hasAttribute('data-text-large')).toBe(true)
    // The same 667 px phone at 200 % text is 20.8 rem tall.
    html.style.fontSize = '32px'
    expect(markViewport()).toEqual({ large: true, short: true })
  })
})
