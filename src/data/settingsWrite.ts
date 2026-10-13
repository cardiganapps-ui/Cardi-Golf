/**
 * What a Comité screen sends to `update_settings` (0043, ARCH-13), and what
 * it does when the server refuses.
 *
 * Torneo and Juegos used to write the whole settings blob, so whichever saved
 * last undid the other's changes and nobody was told. Now a save says what
 * the screen started from (`seen`: every key it depends on, with the value it
 * read, null when the row lacked it) and what it changed (`set`: only those
 * keys, null to remove one). The server writes `set` only while every `seen`
 * key still holds what the screen read; otherwise it writes nothing and says
 * which keys moved, with the row as it is now.
 *
 * Values compare by content, as jsonb does: an object's key order never makes
 * two values differ.
 */
import type { TournamentSettings } from '../engine/settings/schema'

export type JsonObject = Record<string, unknown>

const isObject = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v)

/** A value with every object's keys in order, undefined members gone, as JSON keeps it. */
function ordered(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : ordered(x)))
  if (isObject(v))
    return Object.fromEntries(
      Object.keys(v)
        .filter((k) => v[k] !== undefined)
        .sort()
        .map((k) => [k, ordered(v[k])]),
    )
  return v
}

/** Two JSON values are the same: by content, whatever order an object's keys come in. */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(ordered(a ?? null)) === JSON.stringify(ordered(b ?? null))
}

/** The top-level keys whose values differ between two objects. */
export function changedKeys(a: object, b: object): string[] {
  const x = a as JsonObject
  const y = b as JsonObject
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => !sameJson(x[k], y[k])).sort()
}

export interface SettingsWrite {
  /** Each key the save depends on, with the value the screen read (null: the row lacked it). */
  seen: JsonObject
  /** Each key the screen changed, with its new value (null: remove it). */
  set: JsonObject
}

/**
 * A settings save, from the settings as fetched (`raw`, the row's jsonb),
 * the same parsed (`before`: what the screen started from) and what the
 * screen holds now (`after`).
 * - `whole`: the row did not parse, so the screen started from the defaults;
 *   every key is written, so the row parses again.
 * - `readAll`: the save depends on every key (Torneo's prize check read them
 *   all), so any change to any of them meanwhile refuses it; otherwise only
 *   on the keys it writes (Juegos).
 */
export function settingsWrite(raw: unknown, before: TournamentSettings, after: TournamentSettings, opts: { whole: boolean; readAll: boolean }): SettingsWrite {
  const row = isObject(raw) ? raw : {}
  const a = after as unknown as JsonObject
  const b = before as unknown as JsonObject
  const written = opts.whole ? Object.keys(a).filter((k) => a[k] !== undefined) : changedKeys(b, a)
  const set: JsonObject = {}
  for (const k of written) set[k] = a[k] === undefined ? null : a[k]
  const read = opts.readAll ? [...new Set([...Object.keys(row), ...Object.keys(b), ...Object.keys(a), ...written])] : written
  const seen: JsonObject = {}
  for (const k of read) seen[k] = row[k] === undefined ? null : row[k]
  return { seen, set }
}

/**
 * After a refusal: what the screen holds, over what the row holds now. A key
 * the screen changed that nobody else did keeps the screen's value; every
 * other key takes the row's. `lost`: the keys both changed to different
 * values, where the row's value is the one kept.
 */
export function mergeOver<T extends object>(before: T, mine: T, now: T): { merged: T; lost: string[] } {
  const b = before as unknown as JsonObject
  const m = mine as unknown as JsonObject
  const n = now as unknown as JsonObject
  const merged: JsonObject = {}
  const lost: string[] = []
  for (const k of new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(n)])) {
    const edited = !sameJson(m[k], b[k])
    const theirs = !sameJson(n[k], b[k])
    if (edited && !theirs) merged[k] = m[k]
    else {
      if (n[k] !== undefined) merged[k] = n[k]
      if (edited && !sameJson(m[k], n[k])) lost.push(k)
    }
  }
  return { merged: merged as T, lost: lost.sort() }
}
