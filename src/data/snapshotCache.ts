/**
 * Last known snapshot per tournament, on the device (§8: the app opens and
 * shows the last boards with no signal). Written on every successful fetch;
 * shown at once on open (PERF-08). Never used for fixtures.
 *
 * An entry is kept under the tournament's own slug, whatever link opened it:
 * a player who typed the join code at home goes back through «Tu último
 * torneo», which opens `/t/<slug>`, and with no signal the boards must be
 * there. The code still finds them.
 */
import Dexie, { type EntityTable } from 'dexie'
import { z } from 'zod'
import type { Snapshot } from '../engine/types'
import type { LookupResult } from './api'
import { forgetSeen } from './boardSeen'
import type { Me } from './session'

export interface CachedEntry {
  slug: string
  tournamentId: string
  lookup: LookupResult
  me: Me
  savedAt: number
}
export interface CachedSnapshot {
  tournamentId: string
  snapshot: Snapshot
  savedAt: number
}

class CacheDb extends Dexie {
  entries!: EntityTable<CachedEntry, 'slug'>
  snapshots!: EntityTable<CachedSnapshot, 'tournamentId'>
  constructor() {
    super('cardi-golf-cache')
    this.version(1).stores({ entries: 'slug, tournamentId', snapshots: 'tournamentId' })
  }
}
let db: CacheDb | null = null
/** Told when the phone forgets a tournament (`null`: all of them), so nothing still on its way writes it back. */
const clearedListeners: Array<(tournamentId: string | null) => void> = []
export function onCacheCleared(fn: (tournamentId: string | null) => void) {
  clearedListeners.push(fn)
}
function cleared(tournamentId: string | null) {
  for (const fn of clearedListeners) fn(tournamentId)
}
function getDb(): CacheDb | null {
  if (typeof indexedDB === 'undefined') return null
  db ??= new CacheDb()
  return db
}

/** `entry.slug` is the tournament's own slug. Any other key it was saved under goes (an older build saved the join code). */
export async function saveEntry(entry: Omit<CachedEntry, 'savedAt'>): Promise<void> {
  try {
    const d = getDb()
    if (!d) return
    await d.transaction('rw', d.entries, async () => {
      await d.entries
        .where('tournamentId')
        .equals(entry.tournamentId)
        .and((e) => e.slug !== entry.slug)
        .delete()
      await d.entries.put({ ...entry, savedAt: Date.now() })
    })
  } catch {
    /* cache is best effort */
  }
}
export async function saveSnapshot(tournamentId: string, snapshot: Snapshot): Promise<void> {
  try {
    await getDb()?.snapshots.put({ tournamentId, snapshot, savedAt: Date.now() })
  } catch {
    /* cache is best effort */
  }
}
/**
 * Who this phone was there, as a build stored it. Before ARCH-20 the Comité's rights were `isAdmin`: an entry an
 * older build kept still opens the Comité offline.
 */
function storedMe(me: Me & { isAdmin?: boolean }): Me {
  const { isAdmin, ...rest } = me
  return { ...rest, isComite: rest.isComite ?? !!isAdmin }
}

/**
 * The entry a link leads to: by the tournament's slug, or by the join code
 * typed at home. An entry an older build kept under the code is found by its
 * slug too.
 */
async function findEntry(d: CacheDb, slugOrCode: string): Promise<CachedEntry | undefined> {
  const code = slugOrCode.toUpperCase()
  return (
    (await d.entries.get(slugOrCode)) ??
    (await d.entries.filter((e) => e.lookup.slug === slugOrCode || e.lookup.joinCode?.toUpperCase() === code).first())
  )
}

/** The snapshot's lists. Each is there in what this build saves; one an older build saved before its table existed is not. */
const LISTS = [
  'players',
  'courses',
  'rounds',
  'groups',
  'roundTees',
  'pairs',
  'teams',
  'scores',
  'snakeTiebreaks',
  'cardSignatures',
  'handicapOverrides',
  'calcuttaLots',
  'calcuttaBids',
  'calcuttaBuybacks',
  'payments',
  'gameEntries',
  'holeAwards',
  'gameResults',
  'moneyAdjustments',
] as const satisfies ReadonlyArray<keyof Snapshot>
const SavedSnapshot = z.looseObject({
  tournament: z.looseObject({ id: z.string(), slug: z.string(), name: z.string() }),
  ...Object.fromEntries(LISTS.map((k) => [k, z.array(z.unknown()).optional()])),
})
const SavedEntry = z.looseObject({
  slug: z.string(),
  tournamentId: z.string(),
  lookup: z.looseObject({ id: z.string(), slug: z.string(), name: z.string(), players: z.array(z.unknown()) }),
  me: z.looseObject({ playerId: z.string().nullable() }),
})

/**
 * A snapshot as this or an older build saved it (ARCH-03), or null when it
 * can't be read: what isn't the boards' shape is no copy, never a screen that
 * throws on an offline open. A list saved before its table existed reads as
 * empty (`teams` before PR 51: a team format's boards threw on it); the
 * Comité's decisions stay as they were saved, absent included.
 */
export function savedSnapshot(v: unknown): Snapshot | null {
  if (!SavedSnapshot.safeParse(v).success) return null
  const snap = v as Partial<Snapshot>
  const missing = LISTS.filter((k) => k !== 'moneyAdjustments' && snap[k] === undefined)
  return (missing.length ? { ...snap, ...Object.fromEntries(missing.map((k) => [k, []])) } : snap) as Snapshot
}

export async function readCached(
  slugOrCode: string,
): Promise<{ entry: CachedEntry; snapshot: Snapshot; savedAt: number } | null> {
  try {
    const d = getDb()
    if (!d) return null
    const entry = await findEntry(d, slugOrCode)
    if (!entry || !SavedEntry.safeParse(entry).success) return null
    const snap = await d.snapshots.get(entry.tournamentId)
    const snapshot = snap && typeof snap.savedAt === 'number' ? savedSnapshot(snap.snapshot) : null
    if (!snap || !snapshot) return null
    return { entry: { ...entry, me: storedMe(entry.me) }, snapshot, savedAt: snap.savedAt }
  } catch {
    return null
  }
}
/** Whether the phone has boards saved for the link, without reading them: home offers them before the session is confirmed (REL-03). */
export async function hasCached(slugOrCode: string): Promise<boolean> {
  try {
    const d = getDb()
    const entry = d && (await findEntry(d, slugOrCode))
    return !!entry && (await d.snapshots.where('tournamentId').equals(entry.tournamentId).count()) > 0
  } catch {
    return false
  }
}
/** The name of a tournament whose boards the phone keeps, by its id (the outbox knows only ids). */
export async function cachedTournamentName(tournamentId: string): Promise<string | null> {
  try {
    const entry = await getDb()?.entries.where('tournamentId').equals(tournamentId).first()
    return entry?.lookup.name ?? null
  } catch {
    return null
  }
}
/** Forget what this phone saved for a tournament: its entries, under any key, and its boards. */
export async function clearCached(tournamentId: string): Promise<void> {
  cleared(tournamentId)
  // What it last showed of the board goes with the board (MOT-06).
  forgetSeen(tournamentId)
  try {
    const d = getDb()
    if (!d) return
    await d.transaction('rw', d.entries, d.snapshots, async () => {
      await d.entries.where('tournamentId').equals(tournamentId).delete()
      await d.snapshots.delete(tournamentId)
    })
  } catch {
    /* ignore */
  }
}
/**
 * A PIN taken for another player (TRUST-15): this phone holds one PIN claim, so the tournaments it was in only by
 * its PIN are no longer its own. Their saved boards and who-it-was go, so with no signal the phone does not open
 * one of them as the player it used to be. A tournament it is in by an account (a profile, the Comité) stays.
 */
export async function clearPinEntriesExcept(tournamentId: string): Promise<void> {
  try {
    const d = getDb()
    if (!d) return
    const gone = (await d.entries.toArray())
      .filter((e) => e.tournamentId !== tournamentId && e.me.via === 'device' && !e.me.isOrganizer)
      .map((e) => e.tournamentId)
    for (const tid of new Set(gone)) await clearCached(tid)
  } catch {
    /* ignore */
  }
}
/** Sign-out: the next person on the phone sees nothing of this one's tournaments. */
export async function clearAllCached(): Promise<void> {
  cleared(null)
  forgetSeen(null)
  try {
    const d = getDb()
    if (!d) return
    await d.transaction('rw', d.entries, d.snapshots, async () => {
      await d.entries.clear()
      await d.snapshots.clear()
    })
  } catch {
    /* ignore */
  }
}
/**
 * A link that leads nowhere now (the tournament was deleted): forget what was
 * saved under that very slug. A join code that stopped working may just have
 * been replaced by a new one, so a code alone forgets nothing. Returns the
 * tournament those boards were of, if any: its unsent writes go too (outbox).
 */
export async function clearCachedSlug(slug: string): Promise<string | null> {
  try {
    const entry = await getDb()?.entries.get(slug)
    if (!entry) return null
    await clearCached(entry.tournamentId)
    return entry.tournamentId
  } catch {
    return null
  }
}
