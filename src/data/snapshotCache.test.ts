/**
 * Audit P0-5 / QA-07: the last snapshot a phone saw stays on it, so the app
 * opens with no signal and shows the last boards (§8). The copy is best
 * effort: a full or blocked storage must never break the app, and reading it
 * must never throw (the cold open reads it from inside its own error path).
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture, type Fixture } from '../dev/fixtures'
import { clearCached, clearCachedSlug, hasCached, readCached, saveEntry, saveSnapshot } from './snapshotCache'

const live = getFixture('full12-live')!
const small = getFixture('minimal4-live')!
const entryOf = (fx: Fixture) => ({ slug: fx.snapshot.tournament.slug, tournamentId: fx.snapshot.tournament.id, lookup: fx.lookup, me: fx.me })
const at = (ms: number) => vi.spyOn(Date, 'now').mockReturnValue(ms)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the copy on the phone (audit P0-5)', () => {
  it('comes back by the tournament’s slug exactly as saved, with when it was saved', async () => {
    at(Date.UTC(2027, 3, 10, 16, 0))
    await saveEntry(entryOf(live))
    at(Date.UTC(2027, 3, 10, 16, 5))
    await saveSnapshot(live.snapshot.tournament.id, live.snapshot)
    expect(await readCached(live.snapshot.tournament.slug)).toEqual({
      entry: { ...entryOf(live), savedAt: Date.UTC(2027, 3, 10, 16, 0) },
      snapshot: live.snapshot,
      savedAt: Date.UTC(2027, 3, 10, 16, 5),
    })
  })

  it('the newest snapshot replaces the one before', async () => {
    await saveEntry(entryOf(small))
    at(1000)
    await saveSnapshot(small.snapshot.tournament.id, small.snapshot)
    const newer = structuredClone(small.snapshot)
    newer.scores[0]!.strokes = 9
    at(2000)
    await saveSnapshot(small.snapshot.tournament.id, newer)
    const got = await readCached(small.snapshot.tournament.slug)
    expect([got!.snapshot.scores[0]!.strokes, got!.savedAt]).toEqual([9, 2000])
  })

  it('each tournament has its own copy', async () => {
    for (const fx of [live, small]) {
      await saveEntry(entryOf(fx))
      await saveSnapshot(fx.snapshot.tournament.id, fx.snapshot)
    }
    expect((await readCached(live.snapshot.tournament.slug))!.snapshot.tournament.id).toBe(live.snapshot.tournament.id)
    expect((await readCached(small.snapshot.tournament.slug))!.snapshot.tournament.id).toBe(small.snapshot.tournament.id)
  })

  it('nothing to show for a slug never opened, or opened but never loaded', async () => {
    expect(await readCached('nunca-abierto')).toBeNull()
    await saveEntry({ ...entryOf(small), slug: 'sin-tablero', tournamentId: 'nunca-cargado' })
    expect(await readCached('sin-tablero')).toBeNull()
  })

  it('forgetting a tournament takes its entry and its boards, and only that tournament', async () => {
    for (const fx of [live, small]) {
      await saveEntry(entryOf(fx))
      await saveSnapshot(fx.snapshot.tournament.id, fx.snapshot)
    }
    await clearCached(small.snapshot.tournament.id)
    expect(await readCached(small.snapshot.tournament.slug)).toBeNull()
    expect(await readCached(live.snapshot.tournament.slug)).not.toBeNull()
    // The boards went too: they used to stay in IndexedDB for good.
    await saveEntry(entryOf(small))
    expect(await readCached(small.snapshot.tournament.slug)).toBeNull()
  })

  it('a tournament joined with its code is found by its slug, and by the code', async () => {
    // The gate saves under the tournament's own slug, whatever link opened it.
    await saveEntry(entryOf(live))
    await saveSnapshot(live.snapshot.tournament.id, live.snapshot)
    const code = live.lookup.joinCode
    for (const key of [live.snapshot.tournament.slug, code, code.toLowerCase()]) {
      expect((await readCached(key))?.entry.tournamentId, key).toBe(live.snapshot.tournament.id)
      expect(await hasCached(key), key).toBe(true)
    }
    expect(await hasCached('OTRO99')).toBe(false)
  })

  it('an entry an older build saved under the code is found by the slug, and gives way to it', async () => {
    await saveEntry({ ...entryOf(live), slug: live.lookup.joinCode })
    await saveSnapshot(live.snapshot.tournament.id, live.snapshot)
    expect((await readCached(live.snapshot.tournament.slug))?.entry.tournamentId).toBe(live.snapshot.tournament.id)
    await saveEntry(entryOf(live))
    expect((await readCached(live.lookup.joinCode))!.entry.slug).toBe(live.snapshot.tournament.slug)
  })

  it('a link that leads nowhere forgets what was saved under it; a code that stopped working may just have been replaced', async () => {
    await saveEntry(entryOf(live))
    await saveSnapshot(live.snapshot.tournament.id, live.snapshot)
    await clearCachedSlug(live.lookup.joinCode)
    expect(await readCached(live.snapshot.tournament.slug)).not.toBeNull()
    await clearCachedSlug(live.snapshot.tournament.slug)
    expect(await readCached(live.snapshot.tournament.slug)).toBeNull()
    expect(await readCached(live.lookup.joinCode)).toBeNull()
  })

  it('a full storage refuses the write: nothing is thrown and the last good copy stays', async () => {
    await saveEntry(entryOf(small))
    await saveSnapshot(small.snapshot.tournament.id, small.snapshot)
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })
    const newer = structuredClone(small.snapshot)
    newer.tournament.name = 'No cupo'
    await expect(saveSnapshot(small.snapshot.tournament.id, newer)).resolves.toBeUndefined()
    await expect(saveEntry({ ...entryOf(small), slug: 'tampoco' })).resolves.toBeUndefined()
    vi.restoreAllMocks()
    expect((await readCached(small.snapshot.tournament.slug))!.snapshot.tournament.name).toBe(small.snapshot.tournament.name)
  })

  it('a storage that fails to read gives nothing to show instead of an error', async () => {
    await saveEntry(entryOf(small))
    await saveSnapshot(small.snapshot.tournament.id, small.snapshot)
    vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
      throw new DOMException('The operation failed for reasons unrelated to the database itself.', 'UnknownError')
    })
    await expect(readCached(small.snapshot.tournament.slug)).resolves.toBeNull()
  })

  it('a browser with no IndexedDB saves nothing and has nothing to show', async () => {
    vi.resetModules()
    vi.stubGlobal('indexedDB', undefined)
    const fresh = await import('./snapshotCache')
    await expect(fresh.saveEntry(entryOf(small))).resolves.toBeUndefined()
    await expect(fresh.saveSnapshot(small.snapshot.tournament.id, small.snapshot)).resolves.toBeUndefined()
    await expect(fresh.readCached(small.snapshot.tournament.slug)).resolves.toBeNull()
  })
})
