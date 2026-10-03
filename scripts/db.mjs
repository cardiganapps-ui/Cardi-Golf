#!/usr/bin/env node
// Runs SQL against the Cardi-Golf Supabase project through the Management API.
//   node scripts/db.mjs migrate            → applies supabase/migrations/*.sql not yet recorded
//   node scripts/db.mjs check              → read-only: what migrate would apply, and any applied file that changed
//   node scripts/db.mjs sql "select 1"     → runs a statement
//   node scripts/db.mjs file path.sql      → runs a file (never one of supabase/migrations: migrate runs those, once)
// Reads SUPABASE_PAT and SUPABASE_PROJECT_REF from the environment or .env.local.
// Never prints the token.
//
// DB_TARGET=local runs the same commands against a local Postgres through
// psql (PG* variables): the db CI job replays the chain exactly as production
// gets it. POLO_MIGRATIONS_DIR points migrate and check at another folder
// (the CI job's own tests).
//
// Every file applied is recorded in public._migrations with its sha256. A file
// that changed or disappeared after it ran is refused, and nothing is applied
// (DB-17): a migration is never edited once it ran; a new one fixes it.
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { loadEnv } from './lib/env.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const local = process.env.DB_TARGET === 'local'
let exec
let rows
if (local) {
  ;({ exec, rows } = await import('./lib/local.mjs'))
} else {
  loadEnv()
  if (!process.env.SUPABASE_PAT || !process.env.SUPABASE_PROJECT_REF) {
    console.error('Missing SUPABASE_PAT / SUPABASE_PROJECT_REF')
    process.exit(1)
  }
  const { query } = await import('./lib/mgmt.mjs')
  exec = query
  rows = query
}

const dir = process.env.POLO_MIGRATIONS_DIR ? path.resolve(process.env.POLO_MIGRATIONS_DIR) : path.join(root, 'supabase', 'migrations')
/** A migration's file name: four digits, words; nothing that needs quoting in SQL. */
const NAME = /^\d{4}_[a-z0-9_]+\.sql$/

/** What the database has recorded, without changing anything (no ledger yet: nothing recorded). */
async function recordedRuns() {
  const [have] = await rows(
    `select to_regclass('public._migrations') is not null as ledger,
            exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = '_migrations' and column_name = 'checksum') as sums`,
  )
  if (!have?.ledger) return new Map()
  const list = await rows(have.sums ? `select name, checksum from public._migrations` : `select name, null::text as checksum from public._migrations`)
  return new Map(list.map((r) => [r.name, r.checksum]))
}

/** The repo's migrations and what the database has recorded, compared. */
async function plan() {
  const recorded = await recordedRuns()
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  const bad = files.filter((f) => !NAME.test(f))
  if (bad.length) throw new Error(`Not a migration name: ${bad.join(', ')} (expected 0000_words.sql)`)
  const sums = new Map()
  for (const f of files) sums.set(f, createHash('sha256').update(await readFile(path.join(dir, f))).digest('hex'))
  const changed = files.filter((f) => recorded.get(f) && recorded.get(f) !== sums.get(f))
  const gone = [...recorded.keys()].filter((f) => !sums.has(f))
  const pending = files.filter((f) => !recorded.has(f))
  const unsummed = files.filter((f) => recorded.has(f) && !recorded.get(f))
  return { files, sums, changed, gone, pending, unsummed }
}

function refuse(p) {
  if (!p.changed.length && !p.gone.length) return false
  for (const f of p.changed) console.error(`  ✗ ${f} changed after it was applied: write a new migration instead of editing it`)
  for (const f of p.gone) console.error(`  ✗ ${f} was applied but is not in ${path.relative(root, dir) || dir} any more`)
  console.error('Refusing to migrate: the database and the repo disagree about what already ran (DB-17).')
  return true
}

async function migrate() {
  const p = await plan()
  if (refuse(p)) process.exit(1)
  // The ledger, before the first file (0000 makes the same table: a chain replayed by anything else needs nothing first).
  await exec(
    `create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now(), checksum text);
     alter table public._migrations add column if not exists checksum text;`,
  )
  // Files applied before checksums were kept: their sum as the repo has them now.
  for (const f of p.unsummed) await exec(`update public._migrations set checksum = '${p.sums.get(f)}' where name = '${f}' and checksum is null;`)
  for (const f of p.files) {
    if (!p.pending.includes(f)) {
      console.log('  – already applied', f)
      continue
    }
    const sql = await readFile(path.join(dir, f), 'utf8')
    process.stdout.write(`  ▸ applying ${f} … `)
    await exec(`begin;\n${sql}\ninsert into public._migrations (name, checksum) values ('${f}', '${p.sums.get(f)}');\ncommit;`)
    console.log('ok')
  }
}

async function check() {
  const p = await plan()
  for (const f of p.pending) console.log('  ▸ would apply', f)
  if (!p.pending.length) console.log('  – nothing to apply')
  if (refuse(p)) process.exit(1)
}

const [cmd, arg] = process.argv.slice(2)
try {
  if (cmd === 'migrate') await migrate()
  else if (cmd === 'check') await check()
  else if (cmd === 'sql') console.log(JSON.stringify(local ? await rows(arg) : await exec(arg), null, 2))
  else if (cmd === 'file') {
    // A migration runs once, through migrate: run again by hand it would put back definitions a later file changed (DB-17).
    const migrationsDir = path.join(root, 'supabase', 'migrations') + path.sep
    if (path.resolve(arg).startsWith(migrationsDir)) {
      console.error(`Refusing to run ${path.relative(root, path.resolve(arg))} by hand: migrations go through \`db.mjs migrate\`, once (DB-17).`)
      process.exit(1)
    }
    console.log(JSON.stringify(await exec(await readFile(arg, 'utf8')), null, 2))
  }
  else {
    console.error('usage: db.mjs migrate | check | sql "<sql>" | file <path>')
    process.exit(1)
  }
} catch (e) {
  console.error(String(e.message ?? e))
  process.exit(1)
}
