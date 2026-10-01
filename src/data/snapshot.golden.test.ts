/**
 * QA-07 golden: rows → snapshot → state. Every design fixture is written out
 * as the rows the server holds for it (testing/rows.ts), exported with the
 * «Respaldo» client (backup.ts), served back from that file and loaded
 * through the store. The store must rebuild exactly the snapshot the rows
 * describe, and the engine must compute the same results as on the fixture
 * in memory. A mapper slip or a paging slip (a field past 1,000 score rows)
 * shows up here as a different board, not on the course.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIXTURE_NAMES, getFixture } from '../dev/fixtures'
import { computeTournament } from '../engine/computeTournament'
import { parseSettings } from '../engine/settings/schema'
import type { Snapshot } from '../engine/types'
import type { Backup } from './backup'
import { SNAPSHOT_KEYS } from './snapshotTables'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'
import { asStored, snapshotToRows } from './testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))

const { useTournament } = await import('./tournamentStore')
const { exportBackup, restoreBackup } = await import('./backup')
const { ApiError } = await import('./api')

afterEach(() => {
  useTournament.getState().unsubscribe()
  useTournament.setState({ tournamentId: null, loading: false, error: null, data: null, realtime: 'off', updatedAt: 0 })
})

/** The tournament on the server, exported to a file, the file served back, opened in the app. */
async function loadThroughBackup(snapshot: Snapshot): Promise<Backup> {
  server = fakeSupabase(snapshotToRows(snapshot))
  const file = JSON.stringify(await exportBackup(snapshot.tournament.id))
  const backup = JSON.parse(file) as Backup
  server = fakeSupabase(backup.tables)
  await useTournament.getState().load(snapshot.tournament.id)
  return backup
}

describe('golden: rows → snapshot → state (QA-07)', () => {
  it.each(FIXTURE_NAMES)('%s: its backup loads back as the same snapshot, with the same results', async (name) => {
    const fx = getFixture(name)!
    await loadThroughBackup(fx.snapshot)
    const { data, error } = useTournament.getState()
    expect(error).toBeNull()
    const stored = asStored(fx.snapshot)
    expect(data!.snapshot).toEqual(stored)
    const settings = parseSettings(fx.snapshot.tournament.settings)
    expect([data!.settings, data!.settingsError]).toEqual([settings, null])
    expect(data!.state).toEqual(computeTournament(stored, settings))
    // The server keeps no order for a group's members or most tables, and
    // none of that may move money: prizes, money and totals are the fixture's own.
    const own = computeTournament(fx.snapshot, settings)
    expect(data!.state.prizes).toEqual(own.prizes)
    expect(data!.state.money).toEqual(own.money)
    expect(data!.state.core.totals).toEqual(own.core.totals)
  })

  it('a field past 1,000 score rows comes back whole: the export and the snapshot both page (audit P0-12)', async () => {
    const fx = getFixture('large60')!
    expect(fx.snapshot.scores.length).toBeGreaterThan(1000)
    const backup = await loadThroughBackup(fx.snapshot)
    expect(backup.tables.scores).toHaveLength(fx.snapshot.scores.length)
    expect(useTournament.getState().data!.snapshot.scores).toHaveLength(fx.snapshot.scores.length)
    expect(server.requests.filter((r) => r.table === 'scores').map((r) => r.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })
})

describe('the backup client (QA-07)', () => {
  it('the export holds every table the snapshot reads, each paged in an order that never repeats a row', async () => {
    const fx = getFixture('full12-live')!
    server = fakeSupabase(snapshotToRows(fx.snapshot))
    const backup = await exportBackup(fx.snapshot.tournament.id)
    expect([backup.version, backup.tournamentId, backup.slug]).toEqual([1, fx.snapshot.tournament.id, fx.snapshot.tournament.slug])
    expect(Object.keys(backup.tables).sort()).toEqual(Object.keys(SNAPSHOT_KEYS).sort())
    // Pages never overlap only when the order is a unique key.
    for (const r of server.requests.filter((x) => x.range)) {
      const keys = server.tables[r.table]!.map((row) => JSON.stringify(r.order.map((c) => row[c])))
      expect(new Set(keys).size, `${r.table} by ${r.order.join(', ')}`).toBe(keys.length)
    }
  })

  it('a backup of another tournament is refused before anything reaches the server', async () => {
    server = fakeSupabase({})
    const other: Backup = { version: 1, exportedAt: '2027-04-09T08:00:00.000Z', tournamentId: 'otro', slug: 'otro', tables: {} }
    await expect(restoreBackup('fx-min', other)).rejects.toThrow('wrong-tournament')
    expect(server.rpcCalls).toEqual([])
  })

  it('a restore sends the tournament’s own tables and leaves the shared courses alone', async () => {
    const fx = getFixture('minimal4-live')!
    server = fakeSupabase(snapshotToRows(fx.snapshot))
    const backup = await exportBackup(fx.snapshot.tournament.id)
    server.rpcResult = { data: { players: 4, rounds: 1, scores: fx.snapshot.scores.length }, error: null }
    await expect(restoreBackup(fx.snapshot.tournament.id, backup)).resolves.toEqual({ players: 4, rounds: 1, scores: fx.snapshot.scores.length })
    expect(server.rpcCalls.map((c) => c.name)).toEqual(['restore_tournament'])
    const args = server.rpcCalls[0]!.args!
    expect(args.p_tournament_id).toBe(fx.snapshot.tournament.id)
    const sent = args.p_backup as Backup
    const shared = ['courses', 'tees', 'holes']
    expect(Object.keys(sent.tables).sort()).toEqual(Object.keys(backup.tables).filter((t) => !shared.includes(t)).sort())
    for (const t of Object.keys(sent.tables)) expect(sent.tables[t], t).toEqual(backup.tables[t])
  })

  it('a restore the server refuses keeps its code, for the copy', async () => {
    server = fakeSupabase({})
    server.rpcResult = { data: null, error: { message: 'El respaldo no trae la tabla players', code: '22023' } }
    const backup: Backup = { version: 1, exportedAt: '2027-04-09T08:00:00.000Z', tournamentId: 'fx-min', slug: 'x', tables: { players: [] } }
    const err = await restoreBackup('fx-min', backup).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as InstanceType<typeof ApiError>).code).toBe('22023')
  })
})
