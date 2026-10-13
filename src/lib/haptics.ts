/**
 * A touch the hand feels (MOT-10). On the course the Tarjeta is used with one
 * hand in bright sun: a stepper tap, a saved hole, a birdie or a snake pass,
 * and a wrong PIN each get a short vibration, so the thumb knows without
 * looking. Android's browsers vibrate; iPhone's Safari has no Vibration API,
 * so there the visible confirmations carry it (the hole's slide, the saved
 * check). Nothing vibrates under «Reducir movimiento» or when the player
 * turned it off in Más (a convenience kept on this phone only).
 */
const KEY = 'cardi-golf:haptics'

export type Haptic = 'tick' | 'save' | 'moment' | 'error'

/** Milliseconds: a tick is barely there; a save is two taps; a moment (birdie, snake) longer; a wrong PIN two firm buzzes. */
export const PATTERNS: Record<Haptic, number | number[]> = {
  tick: 8,
  save: [12, 40, 12],
  moment: [20, 60, 20, 60, 40],
  error: [30, 60, 30],
}

/** Whether this browser can vibrate at all: no switch is offered where it can't. */
export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export function hapticsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setHapticsOn(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, 'off')
  } catch {
    // A browser that keeps nothing: it stays on for this page.
  }
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function haptic(kind: Haptic): void {
  if (!canVibrate() || !hapticsOn() || reducedMotion()) return
  try {
    navigator.vibrate(PATTERNS[kind])
  } catch {
    // A browser that refuses (no user gesture yet, a policy): silence is fine.
  }
}
