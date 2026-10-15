/**
 * Reading a stored settings row (ARCH-04).
 *
 * Phones run different builds during an event: an update waits for its
 * «Actualizar». A row a newer build wrote used to fail the whole parse on one
 * side game of a type this build didn't know, and the store then computed the
 * tournament on DEFAULT_SETTINGS (100% handicap, no side games, $0 in prizes)
 * without a word. A key this build didn't know was dropped by the parse, and
 * whatever it changed was computed without it; a Comité save then wrote the
 * row back without it.
 *
 * - A side game of a type this build doesn't know is set aside: everything
 *   else computes, and the engine names it (`flags.missingGames`). If it moves
 *   money, this build can't count the money (`flags.moneyUnknown`), and a save
 *   of the games is refused (`settingsWrite`).
 * - A key outside the schema (`SETTINGS_SPEC`), or a value the schema refuses:
 *   this build can't read the row. Nothing is computed from it and nothing is
 *   saved over it; the screens say to update the app (`settingsError`).
 */
import { GAME_TYPES } from './games'
import { LEGACY_SETTINGS_ALIASES, normalizeLegacySettings, TournamentSettingsSchema, type TournamentSettings } from './schema'
import { SETTINGS_SPEC, type SettingsSpec } from './spec'

export interface UnknownGame {
  id: string
  label: string
  type: string
  enabled: boolean
  /** It may move money: anything but a game that says it is for fun (`money.source: 'none'`). */
  money: boolean
}

export type SettingsRead =
  | { ok: true; settings: TournamentSettings; unknownGames: UnknownGame[] }
  /** `detail`: the keys it doesn't know («modules.wolf»), or what the schema refused. */
  | { ok: false; detail: string[] }

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const KNOWN_GAMES: ReadonlySet<string> = new Set(GAME_TYPES)

/** A side game of a type this build has no game for. */
export function isUnknownGame(g: unknown): g is Record<string, unknown> {
  return isObject(g) && typeof g.type === 'string' && !KNOWN_GAMES.has(g.type)
}

/** The side games of `raw` whose type this build doesn't know, in the row's order. */
export function unknownGamesOf(raw: unknown): UnknownGame[] {
  const games = isObject(raw) && Array.isArray(raw.games) ? raw.games : []
  return games.filter(isUnknownGame).map((g) => ({
    id: typeof g.id === 'string' ? g.id : '',
    label: typeof g.label === 'string' && g.label.trim() ? g.label.trim() : String(g.type),
    type: String(g.type),
    enabled: g.enabled !== false,
    money: !(isObject(g.money) && g.money.source === 'none'),
  }))
}

/** `raw` without the side games this build doesn't know (`unknownGamesOf`). */
export function withoutUnknownGames(raw: unknown): unknown {
  if (!isObject(raw) || !Array.isArray(raw.games) || !raw.games.some(isUnknownGame)) return raw
  return { ...raw, games: raw.games.filter((g) => !isUnknownGame(g)) }
}

/**
 * The paths of the keys `raw` holds that `spec` doesn't know («modules.wolf»,
 * «games.2.options.press»). A value of another kind is the schema's to refuse,
 * and an object of a kind `d` doesn't know (a side game of another type) is
 * set aside before. A key holding nothing (null) says nothing and is left.
 */
export function unknownSettingsKeys(raw: unknown, spec: SettingsSpec = SETTINGS_SPEC, path = ''): string[] {
  if (spec === 's' || raw === null || typeof raw !== 'object') return []
  const at = (k: string | number) => (path ? `${path}.${k}` : String(k))
  if ('a' in spec) return Array.isArray(raw) ? raw.flatMap((e, i) => unknownSettingsKeys(e, spec.a, at(i))) : []
  if ('u' in spec) {
    const kind = spec.u.find((o) => o !== 's' && (Array.isArray(raw) ? 'a' in o : !('a' in o)))
    return kind ? unknownSettingsKeys(raw, kind, path) : []
  }
  if (!isObject(raw)) return []
  let shape: Record<string, SettingsSpec>
  if ('d' in spec) {
    const tag = raw[spec.d]
    const one = typeof tag === 'string' && Object.hasOwn(spec.by, tag) ? spec.by[tag]! : null
    if (!one || one === 's' || !('o' in one)) return []
    shape = one.o
  } else shape = spec.o
  return Object.keys(raw).flatMap((k) => (Object.hasOwn(shape, k) ? unknownSettingsKeys(raw[k], shape[k]!, at(k)) : raw[k] == null ? [] : [at(k)]))
}

/** A legacy key left beside its new name (`prizes.matrimonios` with `prizes.pairs`): the new one is read, the old one is no newer build's. */
const LEGACY_PATHS = new Set(LEGACY_SETTINGS_ALIASES.map((a) => [...a.path, a.from].join('.')))

/** The keys of `raw` a newer build wrote: outside the schema, once older names are read as today's and unknown games set aside. */
export function newerSettingsKeys(raw: unknown): string[] {
  return unknownSettingsKeys(normalizeLegacySettings(withoutUnknownGames(raw))).filter((p) => !LEGACY_PATHS.has(p))
}

/** What this build can read of a stored row (see above). */
export function readSettings(raw: unknown): SettingsRead {
  const unknownGames = unknownGamesOf(raw)
  const newer = newerSettingsKeys(raw)
  if (newer.length) return { ok: false, detail: newer }
  const known = normalizeLegacySettings(withoutUnknownGames(raw))
  const parsed = TournamentSettingsSchema.safeParse(known)
  if (!parsed.success) return { ok: false, detail: [...new Set(parsed.error.issues.map((i) => i.message))] }
  return { ok: true, settings: parsed.data, unknownGames }
}
