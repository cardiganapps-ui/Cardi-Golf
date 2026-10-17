/**
 * Every table's primary key as the migrations leave it, for the tests that
 * hold the client's paging keys to the database's (snapshotTables.test.ts,
 * backupKeys.test.ts). A key comes from the table's `create table` block, and
 * a later `alter table … add constraint … primary key (…)` replaces it (0042
 * gave hole_awards its `source`).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Every migration in order, comments out. */
export function migrationsSql(): string {
  const dir = join(process.cwd(), 'supabase/migrations')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8').replace(/--[^\n]*/g, ''))
    .join('\n')
}

/** Table → primary key columns, in the order the migrations last declared them. */
export function primaryKeys(sql = migrationsSql()): Map<string, string[]> {
  const keys = new Map<string, string[]>()
  const cols = (list: string) => list.split(',').map((c) => c.trim())
  const created = /create table (?:if not exists )?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi
  const altered = /alter table (?:only )?public\.([a-z_]+)\s+add constraint [a-z_]+ primary key\s*\(([^)]+)\)/gi
  // Statements in the order they run: a key declared later replaces the one before it.
  const found = [...sql.matchAll(created)].map((m) => ({ at: m.index, table: m[1]!, body: m[2]!, alter: false }))
  found.push(...[...sql.matchAll(altered)].map((m) => ({ at: m.index, table: m[1]!, body: m[2]!, alter: true })))
  for (const { table, body, alter } of found.sort((a, b) => a.at - b.at)) {
    if (alter) {
      keys.set(table, cols(body))
      continue
    }
    const composite = body.match(/primary key\s*\(([^)]+)\)/i)
    if (composite) {
      keys.set(table, cols(composite[1]!))
      continue
    }
    const column = body.match(/^\s*([a-z_]+)\s+[^,\n]*\bprimary key\b/im)
    if (column) keys.set(table, [column[1]!])
  }
  return keys
}
