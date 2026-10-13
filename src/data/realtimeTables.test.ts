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
import { APPLIED_TABLES, RELOADED_TABLES } from './realtimeApply'
import { filterColumn, INBOX_TABLES, liveFilter, ON_PRODUCTION, REALTIME_TABLES } from './realtimeTables'
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

/** The tables that log their whole old row (`replica identity full`) after replaying the migrations up to `last`. */
function fullIdentityThrough(last: string): Set<string> {
  const sql = files
    .filter((f) => prefix(f) <= last)
    .map(text)
    .join('\n')
  const tables = new Set<string>()
  for (const m of sql.matchAll(/alter table\s+(?:only\s+)?(?:if exists\s+)?(?:public\.)?(\w+)\s+replica identity\s+(full|default|nothing|using index)\b/gi)) {
    if (m[2]!.toLowerCase() === 'full') tables.add(m[1]!)
    else tables.delete(m[1]!)
  }
  return tables
}

/**
 * The columns `table` has after replaying the migrations up to `last`: its `create table`'s, each one an
 * `alter table … add column` added since (or 0030's loop, which adds `tournament_id` over a list of
 * tables), less each one dropped.
 */
function columnsThrough(table: string, last: string): Set<string> {
  const cols = new Set<string>()
  for (const f of files.filter((f) => prefix(f) <= last)) {
    const sql = text(f)
    for (const m of sql.matchAll(new RegExp(`create table\\s+(?:if not exists\\s+)?(?:public\\.)?${table}\\s*\\(`, 'gi'))) {
      let depth = 1
      let start = m.index! + m[0].length
      for (let i = start; i < sql.length && depth > 0; i++) {
        const ch = sql[i]
        if (ch === '(') depth++
        else if (ch === ')') depth--
        if ((ch === ',' && depth === 1) || depth === 0) {
          const name = /^\s*"?(\w+)/.exec(sql.slice(start, i))?.[1]?.toLowerCase()
          if (name && !['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude', 'like'].includes(name)) cols.add(name)
          start = i + 1
        }
      }
    }
    for (const m of sql.matchAll(new RegExp(`alter table\\s+(?:only\\s+)?(?:if exists\\s+)?(?:public\\.)?${table}\\b([^;]*);`, 'gi'))) {
      for (const a of m[1]!.matchAll(/\badd\s+column\s+(?:if not exists\s+)?"?(\w+)/gi)) cols.add(a[1]!.toLowerCase())
      for (const d of m[1]!.matchAll(/\bdrop\s+column\s+(?:if exists\s+)?"?(\w+)/gi)) cols.delete(d[1]!.toLowerCase())
    }
    for (const m of sql.matchAll(/\bdo \$\$([\s\S]*?)\$\$;/gi)) {
      const added = /format\('alter table public\.%I add column if not exists (\w+)/i.exec(m[1]!)
      if (added && new RegExp(`\\(\\s*\\d+\\s*,\\s*'${table}'`).test(m[1]!)) cols.add(added[1]!.toLowerCase())
    }
  }
  return cols
}

describe('each binding is filtered by tournament (DB-05)', () => {
  it('reads the columns the migrations give a table, 0030’s loop included', () => {
    expect(columnsThrough('players', '0001').has('tournament_id')).toBe(true)
    expect(columnsThrough('groups', '0029').has('tournament_id')).toBe(false)
    expect(columnsThrough('groups', '0030').has('tournament_id')).toBe(true)
    expect(columnsThrough('calcutta_bids', '0030').has('tournament_id')).toBe(true)
    expect(columnsThrough('rejected_writes', '0026').has('tournament_id')).toBe(true)
    expect(columnsThrough('scores', '0001').has('putts')).toBe(true)
    expect(columnsThrough('scores', '0001').has('primary')).toBe(false)
  })

  it('on a column each table has on production: Realtime refuses a filter on a column the table lacks, and the whole channel with it (REL-01)', () => {
    const lacking = REALTIME_TABLES.filter((t) => !columnsThrough(t, ON_PRODUCTION).has(filterColumn(t)))
    expect(lacking, `give these the column in a migration, apply it to production, then move ON_PRODUCTION`).toEqual([])
  })

  it('a table filtered on anything but its primary key logs its whole old row on production: Postgres Changes reads a delete’s filter from what the delete logged, so without it the phone hears none of its deletes', () => {
    const blind = REALTIME_TABLES.filter((t) => filterColumn(t) !== 'id' && !fullIdentityThrough(ON_PRODUCTION).has(t))
    expect(blind, `apply the migration that sets replica identity full to production, read it back, then move ON_PRODUCTION`).toEqual([])
  })

  it('the guard bites: through 0048 no table logs its whole old row, through 0049 every filtered one does', () => {
    expect(fullIdentityThrough('0048').size).toBe(0)
    expect(REALTIME_TABLES.filter((t) => filterColumn(t) !== 'id' && !fullIdentityThrough('0049').has(t))).toEqual([])
  })

  it('the tournament row by its id, every other table by its tournament', () => {
    expect(liveFilter('tournaments', 't1')).toBe('id=eq.t1')
    for (const t of REALTIME_TABLES.filter((t) => t !== 'tournaments')) expect(liveFilter(t, 't1')).toBe('tournament_id=eq.t1')
  })
})

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

  it('the team draw is heard once 0025 is on production, never before (REL-01)', () => {
    expect(publishedThrough('0024').has('teams')).toBe(false)
    expect(publishedThrough('0024').has('team_members')).toBe(false)
    expect(publishedThrough('0025').has('teams')).toBe(true)
    expect(publishedThrough('0025').has('team_members')).toBe(true)
    expect(REALTIME_TABLES).toContain('teams')
    expect(REALTIME_TABLES).toContain('team_members')
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
    const structural: readonly string[] = RELOADED_TABLES
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
