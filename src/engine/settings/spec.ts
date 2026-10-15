/**
 * Every key the settings schema knows, as a tree: `s` a value, `o` an object
 * and its keys, `a` a list of one kind, `u` one of several kinds, `d` objects
 * told apart by one key (a side game's `type`, a Calcutta slot's `slot`).
 *
 * `spectator.test.ts` derives the same tree from `TournamentSettingsSchema`
 * and holds this file to it, and to the literal of 0053's
 * `spectator_settings_spec()`, which keeps a link to watch to these keys
 * (STRAT-05). A row holding a key outside it was written by a newer build
 * (ARCH-04, `read.ts`).
 */
import SPEC from './settingsSpec.json'

export type SettingsSpec = 's' | { o: Record<string, SettingsSpec> } | { a: SettingsSpec } | { u: SettingsSpec[] } | { d: string; by: Record<string, SettingsSpec> }

export const SETTINGS_SPEC = SPEC as SettingsSpec
