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
import type { Snapshot } from '../engine/types'
import type { LookupResult } from './api'
import type { Me } from '../screens/tournament/TournamentGate'

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
  if (!db) db = new CacheDb()
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
 * The entry a link leads to: by the tournament's slug, or by the join code
 * typed at home. An entry an older build kept under the code is found by its
 * slug too.
 */
async function findEntry(d: CacheDb, slugOrCode: string): Promise<CachedEntry | undefined> {
  const code = slugOrCode.toUpperCase()
  return (await d.entries.get(slugOrCode)) ?? (await d.entries.filter((e) => e.lookup.slug === slugOrCode || e.lookup.joinCode?.toUpperCase() === code).first())
}
export async function readCached(slugOrCode: string): Promise<{ entry: CachedEntry; snapshot: Snapshot; savedAt: number } | null> {
  try {
    const d = getDb()
    if (!d) return null
    const entry = await findEntry(d, slugOrCode)
    if (!entry) return null
    const snap = await d.snapshots.get(entry.tournamentId)
    if (!snap) return null
    return { entry, snapshot: snap.snapshot, savedAt: snap.savedAt }
  } catch {
    return null
  }
}
/** Whether the phone has boards saved for the link, without reading them: home offers them before the session is confirmed (REL-03). */
export async function hasCached(slugOrCode: string): Promise<boolean> {
  try {
    const d = getDb()
    const entry = d && (await findEntry(d, slugOrCode))
    return !!entry && (await d!.snapshots.where('tournamentId').equals(entry.tournamentId).count()) > 0
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
/** Sign-out: the next person on the phone sees nothing of this one's tournaments. */
export async function clearAllCached(): Promise<void> {
  cleared(null)
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
