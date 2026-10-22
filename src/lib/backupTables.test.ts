import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES, NOT_BACKED_UP, SECRET_KEYS, backupKey, withoutSecrets } from './backupTables'

const dir = join(process.cwd(), 'supabase/migrations')
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n')
/** Table name → the text of its `create table` block (columns and constraints). */
const blocks = new Map<string, string>()
for (const m of sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi))
  blocks.set(m[1]!, m[2]!)
// Columns added later with `alter table … add column`.
for (const m of sql.matchAll(/alter table (?:only )?public\.([a-z_]+)\s+add column (?:if not exists )?([a-z_]+)/gi))
  blocks.set(m[1]!, `${blocks.get(m[1]!) ?? ''}\n${m[2]!} `)
// Created by scripts/db.mjs, not by a migration.
blocks.set('_migrations', 'name text primary key, applied_at timestamptz ')
const created = new Set(blocks.keys())

describe('nightly backup', () => {
  it('covers every table the migrations create', () => {
    const missing = [...created].filter((t) => !(t in BACKUP_TABLES) && !(t in NOT_BACKED_UP))
    expect(missing).toEqual([])
  })

  it('leaves out only tables some migration creates, never one it also copies', () => {
    expect(Object.keys(NOT_BACKED_UP).filter((t) => !created.has(t) || t in BACKUP_TABLES)).toEqual([])
  })

  it('lists only tables some migration creates', () => {
    const unknown = Object.keys(BACKUP_TABLES).filter((t) => !created.has(t))
    expect(unknown).toEqual([])
  })

  it('pages every table by columns that exist in it', () => {
    const bad: string[] = []
    for (const [table, order] of Object.entries(BACKUP_TABLES)) {
      const block = blocks.get(table) ?? ''
      for (const col of order.split(','))
        if (!new RegExp(`(^|\\s|,|\\()${col}\\s`, 'm').test(block)) bad.push(`${table}.${col}`)
    }
    expect(bad).toEqual([])
  })

  it('copies no table with a secret in it: a PIN hash, a link token, a push address or its keys (TRUST-10)', () => {
    for (const t of [
      'player_pins',
      'profile_link_tokens',
      'push_subscriptions',
      'pin_push_subscriptions',
      'spectator_links',
    ]) {
      expect(BACKUP_TABLES, t).not.toHaveProperty(t)
      expect(NOT_BACKED_UP, t).toHaveProperty(t)
    }
    const bad = Object.keys(BACKUP_TABLES).flatMap((t) =>
      (blocks.get(t) ?? '')
        .split(/,|\n/)
        .map((piece) => piece.trim().split(/\s+/)[0] ?? '')
        .filter((c) => SECRET_KEYS.has(c))
        .map((c) => `${t}.${c}`),
    )
    expect(bad).toEqual([])
  })

  it('takes every secret-shaped key out, at any depth, and leaves the rest as it was', () => {
    expect(
      withoutSecrets([{ id: 1, pin_hash: 'x', before: { auth: 'k', a: [{ endpoint: 'e', b: 2 }] }, n: null }]),
    ).toEqual([{ id: 1, before: { a: [{ b: 2 }] }, n: null }])
    expect(withoutSecrets('texto')).toBe('texto')
  })

  it('names one object per UTC day', () => {
    expect(backupKey(new Date('2027-04-10T08:59:00Z'))).toBe('backups/2027-04-10.json.gz')
  })
})
