/**
 * Structural sharing for the boards (PERF-09). A reload, a live change or a
 * save builds the snapshot again from rows, so every object the screens held
 * was new each time, and every screen re-rendered even when nothing had
 * changed: a reload that brought nothing new cost a full board render. These
 * hand back the previous object wherever the new one reads the same: a row, a
 * table, the whole snapshot. The store then keeps its data, and nothing
 * re-renders.
 */
import type { Snapshot } from '../engine/types'

/** Whether two values read the same: primitives by value, arrays in order, objects by their own keys in any order. */
export function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const y = b as unknown[]
    if (a.length !== y.length) return false
    for (let i = 0; i < a.length; i++) if (!same(a[i], y[i])) return false
    return true
  }
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  const keys = Object.keys(x)
  if (keys.length !== Object.keys(y).length) return false
  for (const k of keys) if (!Object.prototype.hasOwnProperty.call(y, k) || !same(x[k], y[k])) return false
  return true
}

/** `next`'s rows, each the previous row where the one at its place reads the same; the previous list itself when all do. */
export function shareList<T>(prev: readonly T[] | undefined, next: T[]): T[] {
  if (!prev || prev === next) return next
  let all = prev.length === next.length
  const out = next.slice()
  for (let i = 0; i < next.length && i < prev.length; i++) {
    if (same(prev[i], next[i])) out[i] = prev[i]!
    else all = false
  }
  return all ? (prev as T[]) : out
}

/** `next`, with the previous table (or row) for every key that reads the same; the previous snapshot itself when every key does. */
export function shareSnapshot(prev: Snapshot | undefined | null, next: Snapshot): Snapshot {
  if (!prev || prev === next) return next
  const before = prev as unknown as Record<string, unknown>
  const after = next as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  let all = Object.keys(before).length === Object.keys(after).length
  for (const k of Object.keys(after)) {
    const p = before[k]
    const v = after[k]
    const kept = Array.isArray(v) ? shareList(Array.isArray(p) ? p : undefined, v) : same(p, v) ? p : v
    if (kept !== p) all = false
    out[k] = kept
  }
  return all ? prev : (out as unknown as Snapshot)
}
