/**
 * REL-01: one unpublished table in the channel makes the server reject the
 * whole postgres_changes subscription, and no phone hears anything. Every
 * table the channel listens to must be in the `supabase_realtime` publication
 * built by the migrations, and by the ones already on production
 * (`ON_PRODUCTION`): the bundle may reach phones before a later migration
 * reaches the database.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APPLIED_TABLES } from './realtimeApply'
import { INBOX_TABLES, ON_PRODUCTION, REALTIME_TABLES } from './realtimeTables'
import { SNAPSHOT_KEYS } from './snapshotTables'

const dir = join(process.cwd(), 'supabase/migrations')
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
const prefix = (f: string) => f.slice(0, 4)
const text = (f: string) => readFileSync(join(dir, f), 'utf8').replace(/--[^\n]*/g, '')

/** Tables in the publication after replaying every migration in order. */
function published(): Set<string> {
  return publishedThrough(prefix(files.at(-1)!))
}

/** Tables in the publication after replaying the migrations up to `last` (its four-digit prefix), in order. */
function publishedThrough(last: string): Set<string> {
  const sql = files
    .filter((f) => prefix(f) <= last)
    .map(text)
    .join('\n')
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

  it('never names a table only a migration after ON_PRODUCTION publishes: the bundle may land before it does (REL-01)', () => {
    const onlyLater = REALTIME_TABLES.filter((t) => published().has(t) && !publishedThrough(ON_PRODUCTION).has(t))
    expect(onlyLater, `apply the migrations after ${ON_PRODUCTION} to production, check its publication, then move ON_PRODUCTION`).toEqual([])
    // Nor one a migration up to it took back out.
    expect(REALTIME_TABLES.filter((t) => !publishedThrough(ON_PRODUCTION).has(t))).toEqual([])
  })

  it('ON_PRODUCTION names a migration that exists, so a later one is still refused', () => {
    expect(files.some((f) => f.startsWith(`${ON_PRODUCTION}_`)), `${ON_PRODUCTION} is not a migration`).toBe(true)
    expect(ON_PRODUCTION <= prefix(files.at(-1)!)).toBe(true)
  })

  it('the guard bites: through 0026 neither table is published, through 0027 only money_adjustments, through 0028 both', () => {
    expect(publishedThrough('0026').has('money_adjustments')).toBe(false)
    expect(publishedThrough('0026').has('rejected_writes')).toBe(false)
    expect(publishedThrough('0027').has('money_adjustments')).toBe(true)
    expect(publishedThrough('0027').has('rejected_writes')).toBe(false)
    expect(publishedThrough('0028').has('rejected_writes')).toBe(true)
  })

  it('the inbox tables are on the channel and never applied to the boards', () => {
    for (const t of INBOX_TABLES) {
      expect(REALTIME_TABLES).toContain(t)
      expect(APPLIED_TABLES as readonly string[]).not.toContain(t)
      expect(Object.keys(SNAPSHOT_KEYS)).not.toContain(t)
    }
  })

  it('publishes every table the store applies by row, the ones still held off the channel included', () => {
    const pub = published()
    expect(APPLIED_TABLES.filter((t) => !pub.has(t)), 'publish these in a migration').toEqual([])
  })

  it('listens to every table the boards and the inbox need: each one applied by row, each structural one that reloads, each inbox one, and nothing else', () => {
    // The tables whose change reloads the snapshot (their rows need joins the event does not carry).
    // `teams` and `team_members` join this list in a change of their own (REL-01).
    const structural = ['tournaments', 'players', 'pairs', 'rounds', 'groups', 'group_members']
    const expected = new Set<string>([...APPLIED_TABLES, ...structural, ...INBOX_TABLES])
    expect(expected.size, 'a table is in two of the lists').toBe(APPLIED_TABLES.length + structural.length + INBOX_TABLES.length)
    const listened = new Set<string>(REALTIME_TABLES)
    expect([...expected].filter((t) => !listened.has(t)), 'dropped from REALTIME_TABLES: no phone hears these change').toEqual([])
    expect([...listened].filter((t) => !expected.has(t)), 'on the channel, but neither applied, structural nor inbox').toEqual([])
    // Every structural table is in the snapshot, so its reload brings the change.
    for (const t of structural) expect(Object.keys(SNAPSHOT_KEYS)).toContain(t)
  })

  it('lists each table once', () => {
    expect(new Set(REALTIME_TABLES).size).toBe(REALTIME_TABLES.length)
  })
})
