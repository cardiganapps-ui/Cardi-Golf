#!/usr/bin/env node
// Runs SQL against the Cardi-Golf Supabase project through the Management API.
//   node scripts/db.mjs migrate            → applies supabase/migrations/*.sql not yet recorded
//   node scripts/db.mjs sql "select 1"     → runs a statement
//   node scripts/db.mjs file path.sql      → runs a file
// Reads SUPABASE_PAT and SUPABASE_PROJECT_REF from the environment or .env.local.
// Never prints the token.
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { loadEnv } from './lib/env.mjs'
import { query } from './lib/mgmt.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
loadEnv()
if (!process.env.SUPABASE_PAT || !process.env.SUPABASE_PROJECT_REF) {
  console.error('Missing SUPABASE_PAT / SUPABASE_PROJECT_REF')
  process.exit(1)
}

async function migrate() {
  await query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`)
  const applied = new Set((await query(`select name from public._migrations`)).map((r) => r.name))
  const dir = path.join(root, 'supabase', 'migrations')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    if (applied.has(f)) {
      console.log('  – already applied', f)
      continue
    }
    const sql = await readFile(path.join(dir, f), 'utf8')
    process.stdout.write(`  ▸ applying ${f} … `)
    await query(`begin;\n${sql}\ninsert into public._migrations (name) values ('${f}');\ncommit;`)
    console.log('ok')
  }
}

const [cmd, arg] = process.argv.slice(2)
try {
  if (cmd === 'migrate') await migrate()
  else if (cmd === 'sql') console.log(JSON.stringify(await query(arg), null, 2))
  else if (cmd === 'file') console.log(JSON.stringify(await query(await readFile(arg, 'utf8')), null, 2))
  else {
    console.error('usage: db.mjs migrate | sql "<sql>" | file <path>')
    process.exit(1)
  }
} catch (e) {
  console.error(String(e.message ?? e))
  process.exit(1)
}
