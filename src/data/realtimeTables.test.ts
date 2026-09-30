/**
 * REL-01: one unpublished table in the channel makes the server reject the
 * whole postgres_changes subscription, and no phone hears anything. Every
 * table the channel listens to must be in the `supabase_realtime` publication
 * built by the migrations.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REALTIME_TABLES } from './realtimeTables'

const dir = join(process.cwd(), 'supabase/migrations')
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8').replace(/--[^\n]*/g, ''))
  .join('\n')

/** Tables in the publication after replaying every migration in order. */
function published(): Set<string> {
  const tables = new Set<string>()
  for (const m of sql.matchAll(/alter publication supabase_realtime\s+(add|drop)\s+table\s+([^;]+);/gi)) {
    for (const name of m[2]!.split(',').map((s) => s.trim().replace(/^public\./, ''))) {
      if (m[1]!.toLowerCase() === 'add') tables.add(name)
      else tables.delete(name)
    }
  }
  return tables
}

describe('realtime tables', () => {
  it('finds the publication in the migrations', () => {
    expect(published().size).toBeGreaterThan(10)
  })

  it('only listens to published tables', () => {
    const pub = published()
    const missing = REALTIME_TABLES.filter((t) => !pub.has(t))
    expect(missing, 'publish these in a migration before listening to them').toEqual([])
  })

  it('lists each table once', () => {
    expect(new Set(REALTIME_TABLES).size).toBe(REALTIME_TABLES.length)
  })
})
