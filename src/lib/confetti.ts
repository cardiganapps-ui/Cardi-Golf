/**
 * A burst of confetti (§14: a net birdie on the scorer's phone, the champion at the ceremony). The library is
 * loaded the first time one fires, never with the screen (PERF-03): most cards never see a birdie, and it was
 * in every first open. A burst that can't load is skipped: the moment has its haptics and its words.
 */
import type { Options } from 'canvas-confetti'

export function burst(options: Options): void {
  void import('canvas-confetti').then(
    (m) => void m.default(options),
    () => undefined,
  )
}
