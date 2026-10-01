/**
 * Last known snapshot per tournament, on the device (§8: the app opens and
 * shows the last boards with no signal). Written on every successful fetch;
 * read only when the network fails on open. Never used for fixtures.
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
function getDb(): CacheDb | null {
  if (typeof indexedDB === 'undefined') return null
  if (!db) db = new CacheDb()
  return db
}

export async function saveEntry(entry: Omit<CachedEntry, 'savedAt'>): Promise<void> {
  try {
    await getDb()?.entries.put({ ...entry, savedAt: Date.now() })
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
export async function readCached(slug: string): Promise<{ entry: CachedEntry; snapshot: Snapshot; savedAt: number } | null> {
  try {
    const d = getDb()
    if (!d) return null
    const entry = await d.entries.get(slug)
    if (!entry) return null
    const snap = await d.snapshots.get(entry.tournamentId)
    if (!snap) return null
    return { entry, snapshot: snap.snapshot, savedAt: snap.savedAt }
  } catch {
    return null
  }
}
/** Whether the phone has boards saved for the link, without reading them: home offers them before the session is confirmed (REL-03). */
export async function hasCached(slug: string): Promise<boolean> {
  try {
    const d = getDb()
    const entry = await d?.entries.get(slug)
    return !!entry && (await d!.snapshots.where('tournamentId').equals(entry.tournamentId).count()) > 0
  } catch {
    return false
  }
}
export async function clearCached(slug: string): Promise<void> {
  try {
    await getDb()?.entries.delete(slug)
  } catch {
    /* ignore */
  }
}
