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
import { readSettings } from '../engine/settings/read'
import type { TournamentSettings } from '../engine/settings/schema'
import { t } from '../i18n/es-MX'
import { UserError } from '../lib/humanError'

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
 * A save this build must not make (ARCH-04): the row holds what a newer build
 * wrote, and writing it back as this build read it would drop that.
 */
export class SettingsOutdated extends UserError {
  constructor(message: string) {
    super(message)
    this.name = 'SettingsOutdated'
  }
}

/**
 * A settings save, from the settings as fetched (`raw`, the row's jsonb),
 * the same parsed (`before`: what the screen started from) and what the
 * screen holds now (`after`).
 * - `readAll`: the save depends on every key (Torneo's prize check read them
 *   all), so any change to any of them meanwhile refuses it; otherwise only
 *   on the keys it writes (Juegos).
 *
 * Refused (`SettingsOutdated`) over a row this build can't read: it used to
 * start from the defaults and write every key, which replaced a newer build's
 * prizes and games with the defaults' (ARCH-04). And a save of the side games
 * while the row holds one this build doesn't know, which `games` written back
 * would drop.
 */
export function settingsWrite(raw: unknown, before: TournamentSettings, after: TournamentSettings, opts: { readAll: boolean }): SettingsWrite {
  const stored = readSettings(raw)
  if (!stored.ok) throw new SettingsOutdated(t.outdated.save)
  const row = isObject(raw) ? raw : {}
  const a = after as unknown as JsonObject
  const b = before as unknown as JsonObject
  const written = changedKeys(b, a)
  if (written.includes('games') && stored.unknownGames.length) throw new SettingsOutdated(t.outdated.games(stored.unknownGames.map((g) => g.label)))
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
