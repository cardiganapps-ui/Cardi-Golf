import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES, backupKey } from './backupTables'

const dir = join(process.cwd(), 'supabase/migrations')
const created = new Set(
  readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .flatMap((f) => [...readFileSync(join(dir, f), 'utf8').matchAll(/create table (?:if not exists )?public\.([a-z_]+)/gi)].map((m) => m[1] ?? '')),
)

describe('nightly backup', () => {
  it('covers every table the migrations create', () => {
    const missing = [...created].filter((t) => !(t in BACKUP_TABLES))
    expect(missing).toEqual([])
  })

  it('names one object per UTC day', () => {
    expect(backupKey(new Date('2027-04-10T08:59:00Z'))).toBe('backups/2027-04-10.json.gz')
  })
})
