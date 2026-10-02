/**
 * QA-07: the «Respaldo» export (backup.ts) pages every table of the
 * tournament, so it must order each one by a key that tells rows apart, or
 * pages overlap and the file repeats some rows and loses others; and only by
 * columns the table has, or PostgREST answers 400 and the export fails
 * (what ARCH-09 did to the snapshot). Its keys are private to backup.ts, so
 * this reads them off the requests the export makes and holds each one to
 * the primary key the migrations declare, the way snapshotTables.test.ts
 * holds the store's. Only the parent rows are served: every other table is
 * empty, so a table that is usually empty (the snake's answers, the tees per
 * round) is checked like a full one; the fake server would let an empty
 * table's wrong key through.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Row } from './mappers'
import { SNAPSHOT_KEYS } from './snapshotTables'
import { fakeSupabase, type FakeSupabase } from './testing/fakeSupabase'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))

const { exportBackup } = await import('./backup')

const dir = join(process.cwd(), 'supabase/migrations')
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8').replace(/--[^\n]*/g, ''))
  .join('\n')

/** Table → primary key columns, from its `create table` block (the parse snapshotTables.test.ts uses). */
function primaryKeys(): Map<string, string[]> {
  const keys = new Map<string, string[]>()
  for (const m of sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)) {
    const body = m[2]!
    const composite = body.match(/primary key\s*\(([^)]+)\)/i)
    if (composite) {
      keys.set(m[1]!, composite[1]!.split(',').map((c) => c.trim()))
      continue
    }
    const column = body.match(/^\s*([a-z_]+)\s+[^,\n]*\bprimary key\b/im)
    if (column) keys.set(m[1]!, [column[1]!])
  }
  return keys
}

describe('the backup’s paging keys (QA-07)', () => {
  it('orders every table it pages by the table’s primary key, whether or not the table has rows', async () => {
    const T = 'torneo'
    // One parent of each kind, so the export asks for every child table.
    const parents: Record<string, Row[]> = {
      tournaments: [{ id: T, slug: 'torneo' }],
      rounds: [{ id: 'r1', tournament_id: T, course_id: 'c1' }],
      groups: [{ id: 'g1', round_id: 'r1' }],
      teams: [{ id: 'e1', tournament_id: T }],
      calcutta_lots: [{ id: 'l1', tournament_id: T }],
      courses: [{ id: 'c1' }],
      tees: [{ id: 't1', course_id: 'c1' }],
    }
    server = fakeSupabase({ ...Object.fromEntries(Object.keys(SNAPSHOT_KEYS).map((t) => [t, []])), ...parents })
    const backup = await exportBackup(T)
    const pk = primaryKeys()
    const paged = server.requests.filter((r) => r.range)
    // Every table in the file but the tournament's own row (one row, read on its own).
    expect(paged.map((r) => r.table).sort()).toEqual(Object.keys(backup.tables).filter((t) => t !== 'tournaments').sort())
    for (const r of paged) {
      expect(pk.get(r.table), `${r.table} has no primary key in the migrations`).toBeDefined()
      // A read of one tournament's rows may leave its id out of the key: it is the same on every row.
      const free = (c: string) => !(c === 'tournament_id' && r.filters.includes('tournament_id=in.(1)'))
      expect(r.order.filter(free), `${r.table} ordered by ${r.order.join(', ') || 'nothing'}`).toEqual(pk.get(r.table)!.filter(free))
    }
  })
})
