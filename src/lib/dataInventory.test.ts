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
// Multi-line or on one line, with or without the schema (PR 118's verifier: both slipped past).
for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\n\);/gi))
  blocks.set(m[1]!, m[2]!)
for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)\s*\(([^\n]*)\);/gi))
  if (!blocks.has(m[1]!)) blocks.set(m[1]!, m[2]!)
for (const m of sql.matchAll(/alter table (?:only )?public\.([a-z_]+)\s+add column (?:if not exists )?([a-z_]+)/gi))
  blocks.set(m[1]!, `${blocks.get(m[1]!) ?? ''}\n${m[2]!} `)
blocks.set('_migrations', 'name text primary key, applied_at timestamptz ')

const sections = new Map(t.legal.privacy.sections)
/** A column that names or points at a person: an account, a player, who did something, a name, a photo, an address, a device. */
const PERSON =
  /(^|_)(user|player|profile|actor|owner|bidder|writer|member|account)(_id)?$|(^|_)(photo|picture|phone)(_url)?$|_by$|^(a|b|email|avatar_url|full_name|display_name|handle|ip|user_agent|endpoint|device_id|auth_user_id)$/
/** The column names of a `create table` body (and of columns added later): the first word of each piece between commas. */
function columns(block: string): string[] {
  return block
    .split(/,|\n/)
    .map((piece) => piece.trim().split(/\s+/)[0] ?? '')
    .filter((c) => /^[a-z_]+$/.test(c))
}

describe('data inventory (TRUST-04)', () => {
  it('reads the columns of every table, a one-line one included', () => {
    expect(columns('id uuid primary key,\n  tournament_id uuid not null, player_id uuid, primary key (a, b)')).toEqual([
      'id',
      'tournament_id',
      'player_id',
      'primary',
    ])
    expect(
      [
        'user_id',
        'player_id',
        'updated_by',
        'ip',
        'user_agent',
        'handle',
        'writer_player_id',
        'member',
        'account_id',
        'photo_url',
        'phone',
      ].every((c) => PERSON.test(c)),
    ).toBe(true)
    expect(['id', 'name', 'tournament_id', 'round_id', 'par', 'stroke_index'].some((c) => PERSON.test(c))).toBe(false)
  })

  it('names every table the migrations create, and only those', () => {
    expect([...blocks.keys()].filter((x) => !(x in DATA_INVENTORY))).toEqual([])
    expect(Object.keys(DATA_INVENTORY).filter((x) => !blocks.has(x))).toEqual([])
  })

  it('agrees with the backup lists', () => {
    expect(Object.keys(DATA_INVENTORY).sort()).toEqual(
      [...Object.keys(BACKUP_TABLES), ...Object.keys(NOT_BACKED_UP)].sort(),
    )
  })

  it('files no table with a person in it as holding nobody', () => {
    const bad = Object.entries(DATA_INVENTORY)
      .filter(([table, e]) => !e.personal && columns(blocks.get(table) ?? '').some((c) => PERSON.test(c)))
      .map(([table]) => table)
    expect(bad).toEqual([])
  })

  it('points each table that holds people at a section the notice has', () => {
    const bad = Object.entries(DATA_INVENTORY)
      .filter(([, e]) => e.personal && !sections.has(e.section))
      .map(([table, e]) => `${table} → ${e.personal ? e.section : ''}`)
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
