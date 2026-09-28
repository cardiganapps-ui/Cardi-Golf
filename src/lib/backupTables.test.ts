import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES, backupKey } from './backupTables'

const dir = join(process.cwd(), 'supabase/migrations')
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n')
/** Table name → the text of its `create table` block (columns and constraints). */
const blocks = new Map<string, string>()
for (const m of sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)) blocks.set(m[1]!, m[2]!)
// Columns added later with `alter table … add column`.
for (const m of sql.matchAll(/alter table (?:only )?public\.([a-z_]+)\s+add column (?:if not exists )?([a-z_]+)/gi)) blocks.set(m[1]!, `${blocks.get(m[1]!) ?? ''}\n${m[2]!} `)
// Created by scripts/db.mjs, not by a migration.
blocks.set('_migrations', 'name text primary key, applied_at timestamptz ')
const created = new Set(blocks.keys())

describe('nightly backup', () => {
  it('covers every table the migrations create', () => {
    const missing = [...created].filter((t) => !(t in BACKUP_TABLES))
    expect(missing).toEqual([])
  })

  it('lists only tables some migration creates', () => {
    const unknown = Object.keys(BACKUP_TABLES).filter((t) => !created.has(t))
    expect(unknown).toEqual([])
  })

  it('pages every table by columns that exist in it', () => {
    const bad: string[] = []
    for (const [table, order] of Object.entries(BACKUP_TABLES)) {
      const block = blocks.get(table) ?? ''
      for (const col of order.split(',')) if (!new RegExp(`(^|\\s|,|\\()${col}\\s`, 'm').test(block)) bad.push(`${table}.${col}`)
    }
    expect(bad).toEqual([])
  })

  it('names one object per UTC day', () => {
    expect(backupKey(new Date('2027-04-10T08:59:00Z'))).toBe('backups/2027-04-10.json.gz')
  })
})
