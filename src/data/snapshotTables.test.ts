/**
 * ARCH-09: the snapshot ordered `team_members` by an `id` column it doesn't
 * have, PostgREST answered 400, and every tournament with a saved team draw
 * stopped loading. Each table the snapshot pages through must be ordered by
 * its real primary key, as declared in the migrations.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SNAPSHOT_KEYS } from './snapshotTables'

const dir = join(process.cwd(), 'supabase/migrations')
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8').replace(/--[^\n]*/g, ''))
  .join('\n')

/** Table → primary key columns, from its `create table` block. */
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

describe('snapshot tables', () => {
  const pk = primaryKeys()

  it('finds the tables in the migrations', () => {
    expect(pk.size).toBeGreaterThan(30)
  })

  it.each(Object.entries(SNAPSHOT_KEYS))('orders %s by its primary key', (table, key) => {
    expect(pk.get(table), `${table} has no create table block with a primary key`).toBeDefined()
    expect([...key]).toEqual(pk.get(table))
  })
})
