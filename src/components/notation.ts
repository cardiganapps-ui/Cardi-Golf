/**
 * The figures' notation, for the primitives that draw it (primitives.tsx: the score marks, the to-par
 * figures); apart so that file exports components only (QA-15: fast refresh).
 */
import type { Tone } from './primitives'

/** To-par text: −2, E, +3 (true minus). */
export function toPar(n: number): { text: string; tone: Tone } {
  if (n === 0) return { text: 'E', tone: 'even' }
  return n < 0 ? { text: `−${Math.abs(n)}`, tone: 'under' } : { text: `+${n}`, tone: 'over' }
}

export type MarkKind = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'pickup'
export function markFor(gross: number | null, par: number, pickedUp = false): MarkKind {
  if (pickedUp || gross == null) return 'pickup'
  const d = gross - par
  if (d <= -2) return 'eagle'
  if (d === -1) return 'birdie'
  if (d === 0) return 'par'
  if (d === 1) return 'bogey'
  return 'double'
}
