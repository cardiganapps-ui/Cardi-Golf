#!/usr/bin/env node
// Writes a backup of a local Postgres the way the nightly route does
// (api/backup-cron.ts, format 2): backup_snapshot over every table in
// BACKUP_TABLES but the history, then the history up to the snapshot's last
// row. The db CI job restores it into a fresh database with
// scripts/restore-r2.mjs and compares (DB-07), so both halves are proven on
// every change to the schema.
//
//   PGDATABASE=polo_ci_seeded node scripts/backup-local.mjs out.json.gz
//
// Local only: it refuses production's database.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const out = process.argv[2]
if (!out) {
  console.error('usage: node scripts/backup-local.mjs <out.json.gz>')
  process.exit(2)
}
if (`${process.env.PGHOST ?? ''}${process.env.PGUSER ?? ''}`.includes('gmohwledjejlhcwqjnhd')) {
  console.error('✗ local only: this is production')
  process.exit(1)
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'src/lib/backupTables.ts'), 'utf8')
const body = src.slice(
  src.indexOf('export const BACKUP_TABLES'),
  src.indexOf('\n}', src.indexOf('export const BACKUP_TABLES')),
)
const tables = Object.fromEntries([...body.matchAll(/^\s+(\w+): '([^']+)',/gm)].map((m) => [m[1], m[2]]))
const history = 'audit_log'
const pTables = Object.fromEntries(Object.entries(tables).filter(([t]) => t !== history))

function psql(sql) {
  const r = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  })
  if (r.status !== 0) {
    console.error(`✗ psql: ${r.stderr.trim()}`)
    process.exit(1)
  }
  return r.stdout.trim()
}
const lit = (s) => `'${s.replace(/'/g, "''")}'`

const createdAt = new Date().toISOString()
const snap = JSON.parse(
  psql(`set role service_role; select public.backup_snapshot(${lit(JSON.stringify(pTables))}::jsonb)`),
)
const rows =
  snap.auditMaxId == null
    ? []
    : JSON.parse(
        psql(
          `select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb) from public.${history} a where a.id <= ${Number(snap.auditMaxId)}`,
        ),
      )
const dump = {
  version: 2,
  createdAt,
  snapshotAt: snap.snapshotAt,
  tables: { ...snap.tables, [history]: rows },
  auth: snap.auth,
  storage: snap.storage,
}
writeFileSync(out, gzipSync(JSON.stringify(dump)), { mode: 0o600 })
const n = Object.values(dump.tables).reduce((a, t) => a + t.length, 0)
console.log(`✓ ${Object.keys(dump.tables).length} tables, ${n} rows, ${dump.auth.users.length} accounts → ${out}`)
