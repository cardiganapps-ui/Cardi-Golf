/**
 * Audit P0-5 / QA-07: the last snapshot a phone saw stays on it, so the app
 * opens with no signal and shows the last boards (§8). The copy is best
 * effort: a full or blocked storage must never break the app, and reading it
 * must never throw (the cold open reads it from inside its own error path).
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFixture, type Fixture } from '../dev/fixtures'
import { clearCached, readCached, saveEntry, saveSnapshot } from './snapshotCache'

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

  it('leaving forgets the slug, and only that slug', async () => {
    for (const fx of [live, small]) {
      await saveEntry(entryOf(fx))
      await saveSnapshot(fx.snapshot.tournament.id, fx.snapshot)
    }
    await clearCached(small.snapshot.tournament.slug)
    expect(await readCached(small.snapshot.tournament.slug)).toBeNull()
    expect(await readCached(live.snapshot.tournament.slug)).not.toBeNull()
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
