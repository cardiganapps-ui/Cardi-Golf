/**
 * DB-02: 0020 rebuilt `restore_tournament` from 0010's body to add teams, and
 * silently lost the side-game tables 0011 had added. The backup kept
 * exporting game_entries, hole_awards and game_results, the restore kept
 * ignoring them, and the Comité was told it had worked. Whichever migration
 * last defines the function must carry every table the backup exports, in
 * the places that matter: read from the backup, and written back.
 * (`supabase/tests/restore_roundtrip.sql` proves the same on a database.)
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RESTORED_TABLES } from './backup'

const dir = join(process.cwd(), 'supabase/migrations')

/** The last definition of the function in the chain, and the file it is in. */
function latestRestore(): { file: string; body: string } {
  let found: { file: string; body: string } | null = null
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8')
    for (const m of sql.matchAll(/create or replace function public\.restore_tournament\(([\s\S]*?)\n\$\$;/gi)) found = { file, body: m[1]! }
  }
  if (!found) throw new Error('no restore_tournament in supabase/migrations')
  return found
}

describe('restore_tournament brings back every table the backup carries (DB-02)', () => {
  const { file, body } = latestRestore()

  it.each(RESTORED_TABLES.map((t) => [t]))('%s: read from the backup and written back', (table) => {
    expect(body, `${file}: ${table} is never read from the backup`).toMatch(new RegExp(`create temp table r_${table}\\b[^;]*tb -> '${table}'`))
    const written = table === 'tournaments' ? /update public\.tournaments t[\s\S]*from r_tournaments r/ : new RegExp(`insert into public\\.${table} \\(`)
    expect(body, `${file}: ${table} is never written back`).toMatch(written)
  })

  it('a hole contest comes back with its group, not as a Comité ruling', () => {
    expect(body).toMatch(/insert into public\.hole_awards \([^)]*\bgroup_id\b/)
    // Wiped before the groups, whose delete would set every award's group to null.
    expect(body.indexOf('delete from public.hole_awards')).toBeGreaterThan(-1)
    expect(body.indexOf('delete from public.hole_awards')).toBeLessThan(body.indexOf('delete from public.groups'))
  })
})
