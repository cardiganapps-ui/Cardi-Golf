/**
 * QA-07 golden: rows → snapshot → state. Every design fixture is written out
 * as the rows the server holds for it (testing/rows.ts), exported with the
 * «Respaldo» client (backup.ts), served back from that file and loaded
 * through the store. The store must rebuild exactly the snapshot the rows
 * describe, and the engine must compute the same results as on the fixture
 * in memory. A mapper slip or a paging slip (a field past 1,000 score rows)
 * shows up here as a different board, not on the course.
 *
 * The design fixtures never use some of what the first tournament will
 * (§2): a second course, a tee per player per round, base handicaps with a
 * decimal, the snake's stored answers. `cabos()` adds them, so those rows
 * make the same trip.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIXTURE_NAMES, getFixture } from '../dev/fixtures'
import { computeTournament } from '../engine/computeTournament'
import { parseSettings } from '../engine/settings/schema'
import { PAR_72 } from '../engine/testing/fixtures'
import type { Hole, Snapshot } from '../engine/types'
import type { Backup } from './backup'
import { SNAPSHOT_KEYS, type SnapshotTable } from './snapshotTables'
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

/**
 * The first tournament as it will be loaded (§2, §5.1): Day 1 at Solmar on
 * one tee; Day 2 at Quivira, tiers A–C from the back tees (Negras) and D from
 * the forward ones (Rojas), whose card is not the same (holes 5 and 11 trade
 * stroke indexes 1 and 18, and the 18th is a par 4); a tee for every player
 * in every round (`round_tees`); base handicaps with a decimal, as numeric(4, 1)
 * keeps them; and the snake's question that full12-live leaves pending (Day 2,
 * group 1, hole 5: p1 and p4 three-putted) answered: p4 holed out last.
 * p10's Comité adjustment makes him play off 13 on Day 2, like p6, so the
 * two differ only by tee.
 */
function cabos(): Snapshot {
  const s = structuredClone(getFixture('full12-live')!.snapshot)
  s.courses[0]!.name = 'Solmar Golf Links'
  const negras: Hole[] = PAR_72.map(([par, si], i) => ({ number: i + 1, par, strokeIndex: si, yards: null }))
  const rojas: Hole[] = negras.map((h) => ({ ...h, strokeIndex: h.number === 5 ? 18 : h.number === 11 ? 1 : h.strokeIndex, par: h.number === 18 ? 4 : h.par }))
  s.courses.push({
    id: 'course-quivira',
    name: 'Quivira Los Cabos',
    tees: [
      { id: 'tee-q-negras', courseId: 'course-quivira', name: 'Negras', color: 'black', rating: 74.1, slope: 142, holes: negras },
      { id: 'tee-q-rojas', courseId: 'course-quivira', name: 'Rojas', color: 'red', rating: 63.7, slope: 107, holes: rojas },
    ],
  })
  s.rounds.find((r) => r.id === 'r2')!.courseId = 'course-quivira'
  s.roundTees = s.players.flatMap((p) => [
    { roundId: 'r1', playerId: p.id, teeId: 'tee1' },
    { roundId: 'r2', playerId: p.id, teeId: p.tier === 'D' ? 'tee-q-rojas' : 'tee-q-negras' },
  ])
  const decimals: Record<string, number> = { p3: 10.4, p9: 21.9, p12: 32.6 }
  for (const p of s.players) p.baseHcp = decimals[p.id] ?? p.baseHcp
  s.handicapOverrides.push({ roundId: 'r2', playerId: 'p10', playingHcp: 13, reason: 'Se lastimó la muñeca el día 1', by: 'p9', at: '2027-04-09T18:05:00Z' })
  s.snakeTiebreaks = [{ roundId: 'r2', groupId: 'r2g1', hole: 5, lastHoledPlayerId: 'p4' }]
  return s
}

/**
 * cabos() with at least two rows in every table the export pages, sharing
 * the leading columns of the key where it has more than one: teams, the
 * game tables (empty in the first tournament) and Day 1 group 3's two
 * questions (holes 10 and 17), answered. A key that does not tell two rows
 * apart then shows as a repeated row. Its games are not in the settings: the
 * engine leaves them out.
 */
function everyTable(): Snapshot {
  const s = cabos()
  s.teams = [
    { id: 'team1', name: 'Los de Solmar', number: 1, playerIds: ['p1', 'p2'], drawnAt: null },
    { id: 'team2', name: 'Los de Quivira', number: 2, playerIds: ['p3', 'p4'], drawnAt: null },
  ]
  s.snakeTiebreaks.push({ roundId: 'r1', groupId: 'r1g3', hole: 10, lastHoledPlayerId: 'p9' }, { roundId: 'r1', groupId: 'r1g3', hole: 17, lastHoledPlayerId: 'p3' })
  s.gameEntries = [
    { gameId: 'low', playerId: 'p1' },
    { gameId: 'low', playerId: 'p2' },
    { gameId: 'skins', playerId: 'p1' },
  ]
  // Closest to the pin, one winner per group on the 3rd.
  s.holeAwards = [
    { roundId: 'r1', groupId: 'r1g1', hole: 3, gameId: 'cerca', playerId: 'p1' },
    { roundId: 'r1', groupId: 'r1g2', hole: 3, gameId: 'cerca', playerId: 'p5' },
    { roundId: 'r1', groupId: 'r1g1', hole: 7, gameId: 'cerca', playerId: 'p4' },
  ]
  s.gameResults = [
    { gameId: 'tacos', playerId: 'p8', share: 1 },
    { gameId: 'tacos', playerId: 'p3', share: 0.5 },
  ]
  return s
}

/** Every table the store and the export page through: all but the tournament's own row, read on its own. */
const PAGED_TABLES = new Set(Object.keys(SNAPSHOT_KEYS).filter((t) => t !== 'tournaments'))

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

  it('every page the store reads is ordered by its table’s primary key, so pages never overlap', async () => {
    // A page without a unique ORDER BY may repeat rows of the page before and
    // skip others; asStored's order is the key's because nothing else orders
    // the server's answer. SNAPSHOT_KEYS are the migrations' keys (snapshotTables.test.ts).
    const s = everyTable()
    server = fakeSupabase(snapshotToRows(s))
    await useTournament.getState().load(s.tournament.id)
    expect(useTournament.getState().error).toBeNull()
    const paged = server.requests.filter((r) => r.range)
    expect(new Set(paged.map((r) => r.table))).toEqual(PAGED_TABLES)
    for (const r of paged) expect(r.order, r.table).toEqual([...SNAPSHOT_KEYS[r.table as SnapshotTable]])
  })
})

describe('golden: the first tournament’s shape (QA-07)', () => {
  /** cabos() through the backup and the store, with what the app shows for it and the engine's own result. */
  async function loadCabos() {
    const s = cabos()
    await loadThroughBackup(s)
    const { data, error } = useTournament.getState()
    expect(error).toBeNull()
    const stored = asStored(s)
    return { data: data!, stored, own: computeTournament(stored, parseSettings(s.tournament.settings)) }
  }

  it('two courses, a tee per player per round, decimal handicaps and a snake answer load back as the same snapshot, with the same results', async () => {
    const { data, stored, own } = await loadCabos()
    expect(data.snapshot.courses.map((c) => [c.id, c.tees.map((t) => t.id)])).toEqual([
      ['course-quivira', ['tee-q-negras', 'tee-q-rojas']],
      ['course1', ['tee1']],
    ])
    expect(data.snapshot.roundTees).toHaveLength(24)
    expect(data.snapshot.snakeTiebreaks).toEqual([{ roundId: 'r2', groupId: 'r2g1', hole: 5, lastHoledPlayerId: 'p4' }])
    expect(data.snapshot).toEqual(stored)
    expect(data.state).toEqual(own)
    expect(data.state.core.warnings).toEqual([])
  })

  it('Day 2 strokes follow each player’s own tee: p6 and p10 both play off 13, and the forward tees’ card turns hole 5 and hole 11 around', async () => {
    const r2 = (await loadCabos()).data.state.core.rounds.r2!
    const day2 = (pid: string) => {
      const pr = r2[pid]!
      const hole = (n: number) => pr.holes.find((h) => h.hole === n)!
      return [pr.tee?.id, pr.playingHcp, [hole(5).strokeIndex, hole(5).strokesReceived], [hole(11).strokeIndex, hole(11).strokesReceived], hole(18).par]
    }
    // Off 13, a stroke on SI 1–13: hole 5 is SI 1 from the back and SI 18 from the front; hole 11 the reverse.
    expect(day2('p6')).toEqual(['tee-q-negras', 13, [1, 1], [18, 0], 5])
    expect(day2('p10')).toEqual(['tee-q-rojas', 13, [18, 0], [1, 1], 4])
    // Every D player plays the forward card; everyone else the back one.
    for (const [pid, pr] of Object.entries(r2)) expect(pr.tee?.id, pid).toBe(['p10', 'p11', 'p12'].includes(pid) ? 'tee-q-rojas' : 'tee-q-negras')
  })

  it('a base handicap with a decimal reaches the engine as typed: 80% of 21.9 = 17.52 → 18', async () => {
    const { data } = await loadCabos()
    expect(data.snapshot.players.find((p) => p.id === 'p9')!.baseHcp).toBe(21.9)
    expect(data.state.core.handicaps.p9!.base).toBe(21.9)
    expect(data.state.core.rounds.r1!.p9!.playingHcpWhy.steps).toEqual(['Hándicap base 21.9', '80% de 21.9 = 17.52', 'Redondeado: 18'])
  })

  it('the stored answer decides who holds the snake: p4 holed out last on the 5th, so the pass on the 6th counts too', async () => {
    const { data, stored } = await loadCabos()
    const group = (st: typeof data.state) => {
      const g = st.modules.snake!.groups.find((x) => x.groupId === 'r2g1')!
      return { holder: g.holderId, pendingHole: g.pendingHole, passes: g.passes.map((p) => [p.hole, p.candidates, p.holderId]) }
    }
    expect(group(data.state)).toEqual({
      holder: 'p10',
      pendingHole: null,
      passes: [
        [2, ['p7'], 'p7'],
        [3, ['p7'], 'p7'],
        [4, ['p10'], 'p10'],
        [5, ['p1', 'p4'], 'p4'],
        [6, ['p10'], 'p10'],
      ],
    })
    expect(data.state.modules.snake!.pending.some((q) => q.groupId === 'r2g1')).toBe(false)
    // Without the answer the snake stops at the 5th: nobody holds it and nothing after counts.
    const unanswered = computeTournament({ ...stored, snakeTiebreaks: [] }, data.settings)
    expect(group(unanswered)).toEqual({
      holder: null,
      pendingHole: 5,
      passes: [
        [2, ['p7'], 'p7'],
        [3, ['p7'], 'p7'],
        [4, ['p10'], 'p10'],
        [5, ['p1', 'p4'], null],
        [6, ['p10'], null],
      ],
    })
  })
})

describe('the backup client (QA-07)', () => {
  it('the export holds every table the snapshot reads, each paged in an order that never repeats a row', async () => {
    const s = everyTable()
    server = fakeSupabase(snapshotToRows(s))
    const backup = await exportBackup(s.tournament.id)
    expect([backup.version, backup.tournamentId, backup.slug]).toEqual([1, s.tournament.id, s.tournament.slug])
    expect(Object.keys(backup.tables).sort()).toEqual(Object.keys(SNAPSHOT_KEYS).sort())
    // Pages never overlap only when the order is a unique key. An empty table
    // or a single row proves nothing, so every table checked has two or more.
    const paged = server.requests.filter((x) => x.range)
    expect(new Set(paged.map((r) => r.table))).toEqual(PAGED_TABLES)
    for (const r of paged) {
      const rows = server.tables[r.table]!
      expect(rows.length, `${r.table} needs rows to check`).toBeGreaterThan(1)
      const keys = rows.map((row) => JSON.stringify(r.order.map((c) => row[c])))
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
