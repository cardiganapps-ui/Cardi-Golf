#!/usr/bin/env node
// Restores a nightly backup (api/backup-cron.ts) into an empty Postgres that
// already has Polo's schema, and proves it came back whole (DB-07).
//
//   node scripts/restore-r2.mjs --from r2:latest            # the newest night in R2
//   node scripts/restore-r2.mjs --from r2:2026-10-12        # one night
//   node scripts/restore-r2.mjs --from ./backup.json.gz     # a file
//   node scripts/restore-r2.mjs --from r2:latest --save ./backup.json.gz --download-only
//   node scripts/restore-r2.mjs --from ./backup.json.gz --verify-only   # compare a restored database again, write nothing
//
// The target is psql's: the PG* variables (PGHOST, PGPORT, PGUSER,
// PGPASSWORD, PGDATABASE), or --db <connection string>. Prepare it first:
// a fresh database (or a new Supabase project) with every migration applied
// (`node scripts/db.mjs migrate`, DB_TARGET=local for a local Postgres).
//
// It refuses production's database, a target that already holds a
// tournament, and one whose migrations are older than the backup's. In one
// transaction, with triggers off (no audit rows, no recomputed results, no
// guards: the rows come back as they were), it writes the accounts (format
// 2: essentials only, never a password: people sign in again with a code or
// Google, with the same id), their sign-in identities, then every table, and
// moves each identity sequence past its rows. Then it checks every table
// against the backup, row for row, and every foreign key for orphans, and
// prints the time it took. Files in Storage are not written: they are in R2
// under files/ (RUNBOOK.md says how to put them back).
//
// R2 needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and
// R2_BACKUP_BUCKET (.env.local). Nothing here prints a row or a secret.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'

const PRODUCTION_REF = 'gmohwledjejlhcwqjnhd'
const SKIP = new Set(['_migrations'])

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const flag = (name) => args.includes(name)
const from = opt('--from')
const db = opt('--db')
if (!from) {
  console.error('usage: node scripts/restore-r2.mjs --from r2:latest | r2:YYYY-MM-DD | <file.json.gz> [--db <url>] [--save <file>] [--download-only]')
  process.exit(2)
}

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// The backup
// ---------------------------------------------------------------------------
async function r2() {
  const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BACKUP_BUCKET'].filter((k) => !process.env[k])
  if (need.length) fail(`R2 needs ${need.join(', ')}`)
  const { AwsClient } = await import('aws4fetch')
  const client = new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' })
  const base = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BACKUP_BUCKET}`
  return { client, base }
}

async function latestKey({ client, base }) {
  const keys = []
  let token = ''
  for (;;) {
    const r = await client.fetch(`${base}?list-type=2&prefix=backups/${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`)
    if (!r.ok) fail(`R2 list: HTTP ${r.status}`)
    const xml = await r.text()
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1])
    const next = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)
    if (!next) break
    token = next[1]
  }
  const nights = keys.filter((k) => /^backups\/\d{4}-\d{2}-\d{2}\.json\.gz$/.test(k)).sort()
  if (!nights.length) fail('R2 has no backups/ yet')
  return nights.at(-1)
}

async function loadDump() {
  let raw
  let source = from
  if (from.startsWith('r2:')) {
    const store = await r2()
    const which = from.slice(3)
    const key = which === 'latest' ? await latestKey(store) : `backups/${which}.json.gz`
    const r = await store.client.fetch(`${store.base}/${key}`)
    if (!r.ok) fail(`R2 ${key}: HTTP ${r.status}`)
    raw = Buffer.from(await r.arrayBuffer())
    source = key
  } else raw = readFileSync(from)
  if (opt('--save')) writeFileSync(opt('--save'), raw, { mode: 0o600 })
  // R2 may hand the object back already decompressed (Content-Encoding: gzip).
  const text = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString('utf8') : raw.toString('utf8')
  const dump = JSON.parse(text)
  if (![1, 2].includes(dump.version) || typeof dump.tables !== 'object') fail(`${source}: not a Polo backup`)
  return { dump, source, bytes: raw.length }
}

// ---------------------------------------------------------------------------
// The target
// ---------------------------------------------------------------------------
const target = db ?? `${process.env.PGHOST ?? 'localhost'}:${process.env.PGPORT ?? '5432'}/${process.env.PGDATABASE ?? process.env.PGUSER ?? ''}`
function psql(sqlOrFile, { file = false } = {}) {
  const base = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At']
  const r = spawnSync('psql', [...(db ? ['-d', db] : []), ...base, ...(file ? ['-f', sqlOrFile] : ['-c', sqlOrFile])], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    env: { ...process.env, PGOPTIONS: `${process.env.PGOPTIONS ?? ''} -c client_min_messages=warning` },
  })
  if (r.status !== 0) fail(`psql: ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' ')}`)
  return r.stdout.trim()
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`

function guardTarget(dump) {
  if (target.includes(PRODUCTION_REF) || (process.env.PGHOST ?? '').includes(PRODUCTION_REF) || (process.env.PGUSER ?? '').includes(PRODUCTION_REF))
    fail('this is production: a restore never writes over it (CLAUDE.md §0.1). Restore into a new project or a local Postgres.')
  if (psql("select to_regclass('public.tournaments') is null") === 't') fail('the target has no Polo schema: apply the migrations first (node scripts/db.mjs migrate)')
  const n = Number(psql('select count(*) from public.tournaments'))
  if (n > 0) fail(`the target already holds ${n} tournament(s): restore only into an empty database`)
  const have = new Set(psql('select name from public._migrations').split('\n').filter(Boolean))
  const want = (dump.tables._migrations ?? []).map((m) => m.name)
  const missing = want.filter((m) => !have.has(m))
  if (missing.length) fail(`the target lacks ${missing.length} migration(s) the backup has (${missing.slice(0, 3).join(', ')}…): apply them first`)
}

/** Columns a restore writes in `schema.table`: not generated, as the target has them. */
function columns(schema, table) {
  const out = psql(
    `select string_agg(a.attname, ',' order by a.attnum) from pg_attribute a where a.attrelid = to_regclass(${lit(`${schema}.${ident(table)}`)}) and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''`,
  )
  return out ? out.split(',') : null
}

function primaryKey(table) {
  const out = psql(
    `select string_agg(a.attname, ',' order by array_position(i.indkey, a.attnum)) from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = to_regclass(${lit(`public.${ident(table)}`)}) and i.indisprimary`,
  )
  return out ? out.split(',') : null
}

// ---------------------------------------------------------------------------
// The restore
// ---------------------------------------------------------------------------
function quoteJson(rows) {
  const json = JSON.stringify(rows)
  let tag
  do tag = `$polo_${randomBytes(6).toString('hex')}$`
  while (json.includes(tag))
  return `${tag}${json}${tag}::jsonb`
}

function insert(schema, table, rows, cols, conflict = '') {
  const list = cols.map(ident).join(', ')
  return `insert into ${schema}.${ident(table)} (${list}) overriding system value select ${list} from jsonb_populate_recordset(null::${schema}.${ident(table)}, ${quoteJson(rows)})${conflict};\n`
}

async function main() {
  const t0 = Date.now()
  const { dump, source, bytes } = await loadDump()
  const tables = Object.keys(dump.tables).filter((t) => !SKIP.has(t))
  const rowsIn = tables.reduce((n, t) => n + dump.tables[t].length, 0)
  console.log(`▸ ${source}: format ${dump.version}, ${(bytes / 1e6).toFixed(1)} MB, ${tables.length} tables, ${rowsIn} rows, ${dump.auth?.users?.length ?? 0} accounts, taken ${dump.snapshotAt ?? dump.createdAt}`)
  if (flag('--download-only')) return
  const verifyOnly = flag('--verify-only')
  if (verifyOnly) {
    if (target.includes(PRODUCTION_REF) || (process.env.PGHOST ?? '').includes(PRODUCTION_REF)) fail('this is production: compare a restored copy, not production')
  } else guardTarget(dump)

  const work = mkdtempSync(join(tmpdir(), 'polo-restore-'))
  try {
    let sql = 'begin;\nset local session_replication_role = replica;\n'
    // Accounts first: almost every table points at one.
    const accounts = new Set()
    const ref = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v) && accounts.add(v)
    if (dump.auth?.users?.length) {
      const cols = columns('auth', 'users').filter((c) => c in dump.auth.users[0])
      sql += insert('auth', 'users', dump.auth.users, cols, ' on conflict (id) do nothing')
      for (const u of dump.auth.users) ref(u.id)
    }
    if (dump.auth?.identities?.length) {
      const cols = columns('auth', 'identities').filter((c) => c in dump.auth.identities[0])
      sql += insert('auth', 'identities', dump.auth.identities, cols, ' on conflict do nothing')
    }
    if (!dump.auth) {
      // Format 1 has no accounts: a bare one for each id a row names through a key to auth.users, so the keys hold.
      const ids = new Set()
      const refs = psql(`select string_agg(c.conrelid::regclass::text || ':' || a.attname, ',') from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1`)
      for (const pair of refs ? refs.split(',') : []) {
        const [rel, col] = pair.split(':')
        const t = rel.replace(/^public\./, '').replace(/"/g, '')
        for (const r of dump.tables[t] ?? []) if (r[col]) ids.add(r[col])
      }
      const stubs = [...ids].map((id) => ({ id, is_anonymous: false }))
      if (stubs.length) sql += insert('auth', 'users', stubs, ['id'], ' on conflict (id) do nothing')
      console.log(`  ! format 1: ${stubs.length} bare accounts (no email): people sign in again and the Comité links them`)
    }
    const counts = {}
    for (const t of tables) {
      const cols = columns('public', t)
      if (!cols) fail(`the target has no table ${t}`)
      const rows = dump.tables[t]
      counts[t] = rows.length
      if (!rows.length) continue
      sql += insert('public', t, rows, cols.filter((c) => rows.some((r) => c in r)))
    }
    // Each identity or serial column past the rows it holds now.
    sql += `do $$ declare r record; begin
  for r in select c.relname as t, a.attname as col, pg_get_serial_sequence(format('public.%I', c.relname), a.attname) as seq
    from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
      and pg_get_serial_sequence(format('public.%I', c.relname), a.attname) is not null
  loop
    execute format('select setval(%L, coalesce((select max(%I) from public.%I), 0) + 1, false)', r.seq, r.col, r.t);
  end loop;
end $$;
commit;
`
    if (!verifyOnly) {
      writeFileSync(join(work, 'restore.sql'), sql, { mode: 0o600 })
      psql(join(work, 'restore.sql'), { file: true })
    }
    const tWrite = Date.now()

    // Row for row: each table as the target now holds it, against the backup.
    let checked = 0
    for (const t of tables) {
      const pk = primaryKey(t)
      if (!pk) fail(`${t} has no primary key to compare by`)
      const rows = dump.tables[t]
      const cmp = `with got as (select coalesce(jsonb_agg(to_jsonb(x) order by ${pk.map((c) => `x.${ident(c)}`).join(', ')}), '[]'::jsonb) j from public.${ident(t)} x),
  want as (select coalesce(jsonb_agg(e order by ${pk.map((c) => `e->>${lit(c)}`).join(', ')}), '[]'::jsonb) j from jsonb_array_elements(${quoteJson(rows)}) e)
select (select jsonb_array_length(j) from got) || ' ' || ((select j from got) = (select j from want))`
      writeFileSync(join(work, 'cmp.sql'), cmp, { mode: 0o600 })
      const [n, same] = psql(join(work, 'cmp.sql'), { file: true }).split(' ')
      if (Number(n) !== rows.length) fail(`${t}: ${n} rows restored, the backup has ${rows.length}`)
      if (same !== 'true') {
        // The text order of a key can differ from its type's order: compare as sets.
        const set = `select (select count(*) from (select to_jsonb(x) j from public.${ident(t)} x except select e from jsonb_array_elements(${quoteJson(rows)}) e) d)`
        writeFileSync(join(work, 'set.sql'), set, { mode: 0o600 })
        const diff = Number(psql(join(work, 'set.sql'), { file: true }))
        if (diff !== 0) fail(`${t}: ${diff} row(s) differ from the backup`)
      }
      checked += rows.length
    }
    // Every foreign key in public, checked by hand: the triggers that enforce them were off.
    writeFileSync(
      join(work, 'fk.sql'),
      `create function pg_temp.orphans(k oid) returns bigint language plpgsql as $f$
declare child regclass; parent regclass; nn text; eq text; n bigint;
begin
  select conrelid, confrelid into child, parent from pg_constraint where oid = k;
  select string_agg(format('ch.%I is not null', a.attname), ' and '), string_agg(format('p.%I = ch.%I', pa.attname, a.attname), ' and ')
    into nn, eq
  from pg_constraint c, unnest(c.conkey, c.confkey) as u(ck, pk)
  join pg_attribute a on a.attrelid = child and a.attnum = u.ck
  join pg_attribute pa on pa.attrelid = parent and pa.attnum = u.pk
  where c.oid = k;
  execute format('select count(*) from %s ch where %s and not exists (select 1 from %s p where %s)', child, nn, parent, eq) into n;
  return n;
end $f$;
select coalesce(string_agg(format('%s.%s (%s)', c.conrelid::regclass, c.conname, n), ', '), '')
from pg_constraint c cross join lateral (select pg_temp.orphans(c.oid) n) x
where c.contype = 'f' and c.connamespace = 'public'::regnamespace and x.n > 0;
`,
      { mode: 0o600 },
    )
    const orphans = psql(join(work, 'fk.sql'), { file: true })
    if (orphans) fail(`orphans after the restore: ${orphans}`)
    const dt = (ms) => `${(ms / 1000).toFixed(1)} s`
    if (verifyOnly) {
      console.log(`✓ the target matches the backup: ${checked} rows in ${tables.length} tables, row for row and key by key, ${dt(Date.now() - t0)}`)
      return
    }
    console.log(`✓ restored ${checked} rows in ${tables.length} tables and ${dump.auth?.users?.length ?? 0} accounts into ${db ? 'the --db target' : target}: written in ${dt(tWrite - t0)}, checked row for row and key by key, ${dt(Date.now() - t0)} in all`)
    if (dump.storage?.objects?.length) console.log(`  · ${dump.storage.objects.length} file(s) listed in Storage: in R2 under files/ (RUNBOOK.md, «Si se pierde la base de datos»)`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main().catch((e) => fail(e.message))
