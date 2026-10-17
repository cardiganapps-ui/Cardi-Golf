// @vitest-environment happy-dom
/** MOT-10: the hand feels a tap, a save, a moment and a wrong PIN; never under reduced motion or with the switch off. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PATTERNS, canVibrate, haptic, hapticsOn, setHapticsOn } from './haptics'

let reduce = false
beforeEach(() => {
  localStorage.clear()
  reduce = false
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn(() => true) })
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) =>
      ({
        matches: q.includes('reduce') && reduce,
        media: q,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
})
afterEach(() => vi.restoreAllMocks())

describe('haptics (MOT-10)', () => {
  it('each kind vibrates its own pattern', () => {
    for (const kind of ['tick', 'save', 'moment', 'error'] as const) haptic(kind)
    expect(vi.mocked(navigator.vibrate).mock.calls.map((c) => c[0])).toEqual([
      PATTERNS.tick,
      PATTERNS.save,
      PATTERNS.moment,
      PATTERNS.error,
    ])
  })

  it('the switch in Más turns it off on this phone, and back on', () => {
    expect(hapticsOn()).toBe(true)
    setHapticsOn(false)
    haptic('save')
    expect(navigator.vibrate).not.toHaveBeenCalled()
    expect(localStorage.getItem('cardi-golf:haptics')).toBe('off')
    setHapticsOn(true)
    haptic('save')
    expect(navigator.vibrate).toHaveBeenCalledTimes(1)
  })

  it('nothing under «Reducir movimiento»', () => {
    reduce = true
    haptic('moment')
    expect(navigator.vibrate).not.toHaveBeenCalled()
  })

  it('a browser with no Vibration API (iPhone) neither vibrates nor throws', () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined })
    expect(canVibrate()).toBe(false)
    expect(() => haptic('save')).not.toThrow()
  })

  it('a browser that refuses, or keeps nothing, is silence, never an error', () => {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('blocked')
      }),
    })
    expect(() => haptic('tick')).not.toThrow()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(hapticsOn()).toBe(true)
  })
})
