/**
 * Backup export and restore (§13 Data): every row of one tournament as JSON,
 * and a restore that puts a backup of the SAME tournament back (ids are
 * preserved, so a backup restores exactly). Courses are shared and are not
 * touched. Player PINs live in a separate table and are never exported.
 */
import { supabase } from '../lib/supabase'
import { fetchAll, withCount } from './paged'
import { ApiError } from './apiError'
import { SNAPSHOT_KEYS, type SnapshotTable } from './snapshotTables'
import { entryChanged } from './entryEvents'

type Row = Record<string, unknown>

export interface Backup {
  version: 1
  exportedAt: string
  tournamentId: string
  slug: string
  tables: Record<string, Row[]>
}

/** Tables keyed by how they hang off the tournament. */
const BY_TOURNAMENT = [
  'players',
  'rounds',
  'pairs',
  'teams',
  'calcutta_lots',
  'payments',
  'money_adjustments',
  'game_entries',
  'game_results',
] as const
const BY_ROUND = [
  'groups',
  'round_tees',
  'scores',
  'snake_tiebreaks',
  'card_signatures',
  'handicap_overrides',
  'hole_awards',
] as const
const BY_LOT = ['calcutta_bids', 'calcutta_buybacks'] as const
/**
 * Every table a backup carries back through `restore_tournament`. Courses,
 * tees and holes ride along as a read-only reference and are never restored.
 * `backup.restore.test.ts` fails when the function's latest definition misses
 * one of these (DB-02: 0020 rebuilt it without the side-game tables).
 */
export const RESTORED_TABLES: readonly string[] = [
  'tournaments',
  ...BY_TOURNAMENT,
  ...BY_ROUND,
  'group_members',
  'team_members',
  ...BY_LOT,
]

/**
 * Paged by the boards' own keys (`SNAPSHOT_KEYS`, held to the migrations): the export kept a second list of
 * keys of its own (ARCH-16). The file carries the tables the boards load, which `tableRegistry.test.ts` holds.
 */
async function rows(table: SnapshotTable, col: string, ids: string[]): Promise<Row[]> {
  if (!ids.length) return []
  return fetchAll<Row>((from, to, count) => {
    let qb = supabase().from(table).select('*', withCount(count)).in(col, ids)
    // One tournament's rows: its id is the same on every one, so the key need not lead with it.
    for (const c of SNAPSHOT_KEYS[table]) if (!(col === 'tournament_id' && c === 'tournament_id')) qb = qb.order(c)
    return qb.range(from, to)
  })
}

export async function exportBackup(tournamentId: string): Promise<Backup> {
  const sb = supabase()
  const { data: tournament, error } = await sb.from('tournaments').select('*').eq('id', tournamentId).single()
  if (error) throw error
  const tables: Record<string, Row[]> = { tournaments: [tournament] }
  for (const t of BY_TOURNAMENT) tables[t] = await rows(t, 'tournament_id', [tournamentId])
  const roundIds = tables.rounds!.map((r) => r.id as string)
  for (const t of BY_ROUND) tables[t] = await rows(t, 'round_id', roundIds)
  const groupIds = tables.groups!.map((g) => g.id as string)
  tables.group_members = await rows('group_members', 'group_id', groupIds)
  tables.team_members = await rows(
    'team_members',
    'team_id',
    tables.teams!.map((x) => x.id as string),
  )
  const lotIds = tables.calcutta_lots!.map((l) => l.id as string)
  for (const t of BY_LOT) tables[t] = await rows(t, 'lot_id', lotIds)
  // Courses used (read-only reference, so a restore elsewhere can rebuild them by hand).
  const courseIds = [...new Set(tables.rounds!.map((r) => r.course_id).filter(Boolean))] as string[]
  tables.courses = await rows('courses', 'id', courseIds)
  tables.tees = await rows('tees', 'course_id', courseIds)
  tables.holes = await rows(
    'holes',
    'tee_id',
    tables.tees.map((t) => t.id as string),
  )
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tournamentId,
    slug: (tournament as Row).slug as string,
    tables,
  }
}

/**
 * Restore in one server transaction (`restore_tournament`): the backup is
 * validated whole before anything is deleted, players and rounds keep their
 * ids (PINs and device links survive), courses are left alone.
 */
export async function restoreBackup(
  tournamentId: string,
  backup: Backup,
): Promise<{ players: number; rounds: number; scores: number }> {
  if (backup.version !== 1 || backup.tournamentId !== tournamentId) throw new Error('wrong-tournament')
  const { courses: _c, tees: _t, holes: _h, ...tables } = backup.tables
  const res = await supabase().rpc('restore_tournament', {
    p_tournament_id: tournamentId,
    p_backup: { ...backup, tables },
  })
  if (res.error) throw ApiError.from(res.error)
  // A player missing from the backup goes, and his PIN and link with him.
  entryChanged()
  return res.data as { players: number; rounds: number; scores: number }
}

/** Minimal CSV: quotes fields that need it. */
export function toCsv(header: string[], lines: Array<Array<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header, ...lines].map((l) => l.map(cell).join(',')).join('\n') + '\n'
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
