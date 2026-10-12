/**
 * TRUST-04: the privacy notice covers every table that keeps something about
 * people. Read from the migrations: a new table must be in DATA_INVENTORY,
 * with the notice section that tells people about it and a retention that
 * «Cuánto tiempo los guardamos» states, or say why it holds nobody. A table
 * with a column that names a person (an account, a player, a name, a photo,
 * an email, a device) can't be filed as holding nobody.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { t } from '../i18n/es-MX'
import { BACKUP_TABLES, NOT_BACKED_UP } from './backupTables'
import { DATA_INVENTORY, RETENTION_WORDS, type Retention } from './dataInventory'

const dir = join(process.cwd(), 'supabase/migrations')
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n')
const blocks = new Map<string, string>()
for (const m of sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)) blocks.set(m[1]!, m[2]!)
for (const m of sql.matchAll(/alter table (?:only )?public\.([a-z_]+)\s+add column (?:if not exists )?([a-z_]+)/gi)) blocks.set(m[1]!, `${blocks.get(m[1]!) ?? ''}\n${m[2]!} `)
blocks.set('_migrations', 'name text primary key, applied_at timestamptz ')

const sections = new Map(t.legal.privacy.sections)
/** Columns that name or point at a person. */
const PERSON = /^\s*(full_name|display_name|email|avatar_url|auth_user_id|player_id|profile_id|created_by|bidder_id|owner_id|from_player_id|to_player_id|signed_by|entered_by|device_id|endpoint|a|b)\s/m

describe('data inventory (TRUST-04)', () => {
  it('names every table the migrations create, and only those', () => {
    expect([...blocks.keys()].filter((x) => !(x in DATA_INVENTORY))).toEqual([])
    expect(Object.keys(DATA_INVENTORY).filter((x) => !blocks.has(x))).toEqual([])
  })

  it('agrees with the backup lists', () => {
    expect(Object.keys(DATA_INVENTORY).sort()).toEqual([...Object.keys(BACKUP_TABLES), ...Object.keys(NOT_BACKED_UP)].sort())
  })

  it('files no table with a person in it as holding nobody', () => {
    const bad = Object.entries(DATA_INVENTORY)
      .filter(([table, e]) => !e.personal && PERSON.test(blocks.get(table) ?? ''))
      .map(([table]) => table)
    expect(bad).toEqual([])
  })

  it('points each table that holds people at a section the notice has', () => {
    const bad = Object.entries(DATA_INVENTORY).filter(([, e]) => e.personal && !sections.has(e.section)).map(([table, e]) => `${table} → ${e.personal ? e.section : ''}`)
    expect(bad).toEqual([])
  })

  it('states every retention it uses, and uses every one it states', () => {
    const retention = sections.get('Cuánto tiempo los guardamos')!
    const used = new Set(Object.values(DATA_INVENTORY).flatMap((e) => (e.personal ? [e.retention] : [])))
    for (const [r, words] of Object.entries(RETENTION_WORDS) as Array<[Retention, string]>) {
      expect(retention, r).toContain(words)
      expect(used.has(r), `${r} is stated but no table uses it`).toBe(true)
    }
  })
})
