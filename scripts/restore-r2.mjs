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
// It refuses production's database, a target that already holds an account,
// a profile or a tournament, and one whose migrations are older than the
// backup's. In ONE transaction, with triggers off (no audit rows, no
// recomputed results, no guards: the rows come back as they were), it
// writes the accounts (format 2: essentials only, never a password: people
// sign in again with a code or Google, with the same id), filled in the way
// GoTrue reads them (instance, audience, role, empty tokens), their sign-in
// identities, then every table, moves each sequence past its rows, and then,
// still inside it, checks every table and the accounts against the backup,
// row for row (the backup's columns, in UTC), and every foreign key for
// orphans. Anything that does not match rolls the whole restore back: the
// target is never left half restored. Files in Storage are not written: they
// are in R2 under files/ (RUNBOOK.md §8b says how to put them back).
//
// R2 needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and
// R2_BACKUP_BUCKET (the environment, or .env.local). Nothing here prints a
// row or a secret.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'

const PRODUCTION_REF = 'gmohwledjejlhcwqjnhd'
const SKIP = new Set(['_migrations'])
/** What GoTrue needs on an account it reads (its migrations give these no default): filled where the backup has none. */
const ACCOUNT_FILL = {
  instance_id: "'00000000-0000-0000-0000-000000000000'::uuid",
  aud: "'authenticated'",
  role: "'authenticated'",
  confirmation_token: "''",
  recovery_token: "''",
  email_change_token_new: "''",
  email_change_token_current: "''",
  email_change: "''",
  phone_change: "''",
  phone_change_token: "''",
  reauthentication_token: "''",
  updated_at: 'coalesce(created_at, now())',
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// .env.local fills what the environment doesn't (R2's keys), as scripts/db.mjs does.
if (existsSync(join(root, '.env.local')))
  for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const flag = (name) => args.includes(name)
const from = opt('--from')
const db = opt('--db')
if (!from) {
  console.error('usage: node scripts/restore-r2.mjs --from r2:latest | r2:YYYY-MM-DD | <file.json.gz> [--db <url>] [--save <file>] [--download-only | --verify-only]')
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
  if (r.status !== 0) {
    // A check that failed inside the transaction says so in its own words; psql's prefix is noise.
    const said = (r.stderr || r.stdout)
      .trim()
      .split('\n')
      .filter((l) => /ERROR/.test(l))
      .map((l) => l.replace(/^.*ERROR:\s*/, ''))
    fail(said.length ? said.join(' ') : (r.stderr || r.stdout).trim().split('\n').slice(-3).join(' '))
  }
  return r.stdout.trim()
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`

function refuseProduction() {
  const named = [target, process.env.PGHOST, process.env.PGHOSTADDR, process.env.PGUSER, process.env.PGSERVICE].filter(Boolean).join(' ')
  if (named.includes(PRODUCTION_REF)) fail('this is production: a restore never writes over it (CLAUDE.md §0.1). Restore into a new project or a local Postgres.')
}

function guardTarget(dump) {
  refuseProduction()
  if (psql("select to_regclass('public.tournaments') is null") === 't') fail('the target has no Polo schema: apply the migrations first (node scripts/db.mjs migrate)')
  // Production, or any database people already use, has accounts: whatever its name, a restore never mixes into it.
  const [users, profiles, tournaments] = psql("select (select count(*) from auth.users) || '|' || (select count(*) from public.profiles) || '|' || (select count(*) from public.tournaments)")
    .split('|')
    .map(Number)
  if (users + profiles + tournaments > 0)
    fail(`the target already holds ${users} account(s), ${profiles} profile(s) and ${tournaments} tournament(s): restore only into an empty database`)
  const have = new Set(psql('select name from public._migrations').split('\n').filter(Boolean))
  const want = (dump.tables._migrations ?? []).map((m) => m.name)
  const missing = want.filter((m) => !have.has(m))
  if (missing.length) fail(`the target lacks ${missing.length} migration(s) the backup has (${missing.slice(0, 3).join(', ')}…): apply them first`)
}

/** Every column of `schema.table` as the target has it, and which are generated. */
function columns(schema, table) {
  const out = psql(
    `select string_agg(a.attname || ':' || (a.attgenerated <> '')::int, ',' order by a.attnum) from pg_attribute a where a.attrelid = to_regclass(${lit(`${schema}.${ident(table)}`)}) and a.attnum > 0 and not a.attisdropped`,
  )
  if (!out) return null
  return out.split(',').map((c) => {
    const [name, gen] = c.split(':')
    return { name, generated: gen === '1' }
  })
}

function primaryKey(schema, table) {
  const out = psql(
    `select string_agg(a.attname, ',' order by array_position(i.indkey, a.attnum)) from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = to_regclass(${lit(`${schema}.${ident(table)}`)}) and i.indisprimary`,
  )
  return out ? out.split(',') : null
}

// ---------------------------------------------------------------------------
// The restore, and its check, in one transaction
// ---------------------------------------------------------------------------
function quoteJson(rows) {
  const json = JSON.stringify(rows)
  let tag
  do tag = `$polo_${randomBytes(6).toString('hex')}$`
  while (json.includes(tag))
  return `${tag}${json}${tag}::jsonb`
}

/** One row per key: a history page that repeated a row must not stop the night from restoring. */
function dedupe(rows, pk) {
  const seen = new Set()
  return rows.filter((r) => {
    const k = JSON.stringify(pk.map((c) => r[c]))
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function insert(schema, table, rows, cols, conflict = '') {
  const list = cols.map(ident).join(', ')
  return `insert into ${schema}.${ident(table)} (${list}) overriding system value select ${list} from jsonb_populate_recordset(null::${schema}.${ident(table)}, ${quoteJson(rows)})${conflict};\n`
}

/**
 * Inside the transaction: `schema.table` against `rows`, on the backup's own
 * columns (a newer schema's extra ones, and what the restore filled in for
 * GoTrue, are left out), with the same count and not one row different;
 * raises, so the whole restore rolls back.
 */
function check(schema, table, rows, all) {
  const keys = new Set(rows.flatMap((r) => Object.keys(r)))
  const extra = all.filter((c) => !keys.has(c.name)).map((c) => lit(c.name))
  const proj = extra.length ? `to_jsonb(x) - array[${extra.join(', ')}]::text[]` : 'to_jsonb(x)'
  const name = `${schema === 'public' ? '' : `${schema}.`}${table}`
  return `do $check$
declare n bigint; want jsonb := ${quoteJson(rows)};
begin
  select count(*) into n from ${schema}.${ident(table)} x;
  if n <> jsonb_array_length(want) then
    raise exception '%: % rows restored, the backup has %', ${lit(name)}, n, jsonb_array_length(want);
  end if;
  select count(*) into n from (select ${proj} as j from ${schema}.${ident(table)} x except select e from jsonb_array_elements(want) e) d;
  if n > 0 then
    raise exception '%: % row(s) differ from the backup', ${lit(name)}, n;
  end if;
end $check$;
`
}

/** Every foreign key in public, checked by hand (the triggers that enforce them were off); raises on an orphan. */
const ORPHANS = `create function pg_temp.orphans(k oid) returns bigint language plpgsql as $f$
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
do $fk$
declare bad text;
begin
  select string_agg(format('%s.%s (%s)', c.conrelid::regclass, c.conname, n), ', ') into bad
  from pg_constraint c cross join lateral (select pg_temp.orphans(c.oid) n) x
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace and x.n > 0;
  if bad is not null then
    raise exception 'orphans after the restore: %', bad;
  end if;
end $fk$;
`

async function main() {
  const t0 = Date.now()
  const { dump, source, bytes } = await loadDump()
  const tables = Object.keys(dump.tables).filter((t) => !SKIP.has(t))
  console.log(
    `▸ ${source}: format ${dump.version}, ${(bytes / 1e6).toFixed(1)} MB, ${tables.length} tables, ${tables.reduce((n, t) => n + dump.tables[t].length, 0)} rows, ${dump.auth?.users?.length ?? 0} accounts, taken ${dump.snapshotAt ?? dump.createdAt}`,
  )
  if (flag('--download-only')) return
  const verifyOnly = flag('--verify-only')
  if (verifyOnly) refuseProduction()
  else guardTarget(dump)

  const work = mkdtempSync(join(tmpdir(), 'polo-restore-'))
  try {
    // Every timestamp compared as the backup wrote it (UTC), whatever the target's own time zone.
    let sql = "begin;\nset local timezone = 'UTC';\nset local session_replication_role = replica;\n"
    let checks = ''
    let accounts = 0
    let restored = 0
    if (dump.auth?.users?.length) {
      const all = columns('auth', 'users')
      const users = dedupe(dump.auth.users, ['id'])
      sql += insert('auth', 'users', users, all.filter((c) => !c.generated && users.some((u) => c.name in u)).map((c) => c.name), ' on conflict (id) do nothing')
      checks += check('auth', 'users', users, all)
      accounts = users.length
    }
    if (dump.auth?.identities?.length) {
      const all = columns('auth', 'identities')
      const ids = dedupe(dump.auth.identities, ['id'])
      sql += insert('auth', 'identities', ids, all.filter((c) => !c.generated && ids.some((u) => c.name in u)).map((c) => c.name), ' on conflict do nothing')
      sql += 'update auth.identities set updated_at = coalesce(created_at, now()) where updated_at is null;\n'
      checks += check('auth', 'identities', ids, all)
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
      if (stubs.length) sql += insert('auth', 'users', stubs, ['id', 'is_anonymous'], ' on conflict (id) do nothing')
      console.log(`  ! format 1: ${stubs.length} bare accounts (no email): their profiles, friends and crews stay on those ids, and nobody can sign in to them (RUNBOOK.md §8b)`)
    }
    // Each account as GoTrue reads it: the columns its own migrations leave without a default.
    const userCols = new Set((columns('auth', 'users') ?? []).map((c) => c.name))
    const fill = Object.entries(ACCOUNT_FILL).filter(([c]) => userCols.has(c))
    if (fill.length) sql += `update auth.users set ${fill.map(([c, v]) => `${ident(c)} = coalesce(${ident(c)}, ${v})`).join(', ')};\n`

    for (const t of tables) {
      const all = columns('public', t)
      if (!all) fail(`the target has no table ${t}`)
      const pk = primaryKey('public', t)
      if (!pk) fail(`${t} has no primary key to compare by`)
      const rows = dedupe(dump.tables[t], pk)
      restored += rows.length
      if (rows.length) sql += insert('public', t, rows, all.filter((c) => !c.generated && rows.some((r) => c.name in r)).map((c) => c.name))
      checks += check('public', t, rows, all)
    }
    // Each identity or serial column past the rows it holds now.
    sql += `do $seq$ declare r record; begin
  for r in select c.relname as t, a.attname as col, pg_get_serial_sequence(format('public.%I', c.relname), a.attname) as seq
    from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
      and pg_get_serial_sequence(format('public.%I', c.relname), a.attname) is not null
  loop
    execute format('select setval(%L, coalesce((select max(%I) from public.%I), 0) + 1, false)', r.seq, r.col, r.t);
  end loop;
end $seq$;
`
    // The check, inside the same transaction: any mismatch rolls everything back.
    const file = join(work, 'restore.sql')
    if (verifyOnly) writeFileSync(file, `begin;\nset local timezone = 'UTC';\n${checks}${ORPHANS}rollback;\n`, { mode: 0o600 })
    else writeFileSync(file, `${sql}${checks}${ORPHANS}commit;\n`, { mode: 0o600 })
    psql(file, { file: true })

    const rows = restored
    const dt = `${((Date.now() - t0) / 1000).toFixed(1)} s`
    if (verifyOnly) console.log(`✓ the target matches the backup: ${rows} rows in ${tables.length} tables and ${accounts} accounts, row for row and key by key, ${dt}`)
    else
      console.log(
        `✓ restored ${rows} rows in ${tables.length} tables and ${accounts} accounts into ${db ? 'the --db target' : target}, checked row for row and key by key before it was committed, ${dt} in all`,
      )
    if (dump.storage?.objects?.length) console.log(`  · ${dump.storage.objects.length} file(s) listed in Storage: in R2 under files/ (RUNBOOK.md §8b)`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main().catch((e) => fail(e.message))
