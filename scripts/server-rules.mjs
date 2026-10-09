#!/usr/bin/env node
// The test server's rules, against the real ones (QA-06).
//
// src/data/testing/fakeSupabase.ts stands in for Supabase under the outbox's
// tests. What it lets a phone write, what it refuses and what it changes on
// the way in must be what the database does, or those tests prove nothing.
// Every case in src/data/testing/cases/serverRules.json is one request a
// phone makes, written as PostgREST receives it. This script runs each one on
// a migrated database the way PostgREST does: the caller's role and JWT
// claims, the INSERT … ON CONFLICT or DELETE it builds, and the HTTP status it
// gives the SQLSTATE. src/data/testing/serverRules.test.ts sends the same
// requests to the fake. Both must give the answer each case expects and leave
// the rows it expects.
//
// Each case runs in its own transaction, rolled back: the case file's world
// (inserted by the superuser, so no rules, but every trigger), the case's own
// rows, then the request. Ids in the case file are names (`p1`, `r1`); in
// every uuid column this script writes md5(name) instead.
//   PGDATABASE=<a migrated database> node scripts/server-rules.mjs [--print]
// scripts/db-test.sh runs it on a fresh copy in the db job. --print shows each
// case's outcome, and the rows it checks, without judging them.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const spec = JSON.parse(await readFile(path.join(root, 'src', 'data', 'testing', 'cases', 'serverRules.json'), 'utf8'))
const print = process.argv.includes('--print')

function psql(sql) {
  const r = spawnSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `psql exited ${r.status}`).trim().slice(0, 4000))
  return r.stdout.trim()
}

/** A table or column name from the case file, checked before it goes into SQL. */
function ident(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`not a plain SQL name: ${name}`)
  return name
}

// Where a name stands for a uuid.
const uuidColumns = new Map()
for (const line of psql(`select table_schema || '.' || table_name || ' ' || column_name from information_schema.columns where table_schema in ('public', 'auth') and data_type = 'uuid'`).split('\n')) {
  const [table, column] = line.split(' ')
  if (!uuidColumns.has(table)) uuidColumns.set(table, new Set())
  uuidColumns.get(table).add(column)
}
const names = new Map()
function uuid(name) {
  const h = createHash('md5').update(name).digest('hex')
  const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  names.set(id, name)
  return id
}
const isUuid = (table, column) => uuidColumns.get(table.includes('.') ? table : `public.${table}`)?.has(column) ?? false
// Each table's columns, as PostgREST's schema cache knows them: a body naming another is refused before the database sees it.
const tableColumns = new Map()
for (const line of psql(`select table_name || ' ' || column_name from information_schema.columns where table_schema = 'public'`).split('\n')) {
  const [table, column] = line.split(' ')
  if (!tableColumns.has(table)) tableColumns.set(table, new Set())
  tableColumns.get(table).add(column)
}
/**
 * The columns a POST writes: its `columns` when the case gives them (PostgREST reads only those keys of
 * the body), else every key of the body's rows, as supabase-js names them for a list.
 */
const columnsOf = (req) => req.columns ?? [...new Set((Array.isArray(req.body) ? req.body : [req.body]).flatMap((r) => Object.keys(r)))]
/** PGRST204, PostgREST's own answer to a column the table doesn't have. */
function unknownColumn(req) {
  if (req.method !== 'POST') return null
  const known = tableColumns.get(req.table) ?? new Set()
  const col = columnsOf(req).find((c) => !known.has(c))
  return col ? `PGRST204 Could not find the '${col}' column of '${req.table}' in the schema cache` : null
}
function toDb(table, row) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [ident(k), typeof v === 'string' && isUuid(table, k) ? uuid(v) : v]))
}
/** Every uuid the script wrote for a name, back to the name, however deep (an RPC's jsonb answer holds rows). */
function fromDb(value) {
  if (typeof value === 'string') return names.has(value) ? names.get(value) : value
  if (Array.isArray(value)) return value.map(fromDb)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromDb(v)]))
  return value
}
/** A jsonb argument's names as uuids: a string under a key that names an id (`round_id`, `player_id`, `mutation_id`…). */
function idsToDb(value, key = '') {
  if (typeof value === 'string') return /_id$/.test(key) ? uuid(value) : value
  if (Array.isArray(value)) return value.map((v) => idsToDb(v, key))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, idsToDb(v, k)]))
  return value
}
/** A JSON literal SQL can read, whatever the text holds. */
function jsonLiteral(value) {
  const text = JSON.stringify(value)
  let tag = 'j'
  while (text.includes(`$${tag}$`)) tag += 'j'
  return `$${tag}$${text}$${tag}$::json`
}

/** Rows into a table as the superuser: what the database already holds. */
function insertRows(table, rows) {
  if (!rows.length) return ''
  const t = ident(table)
  const db = rows.map((r) => toDb(t, r))
  const cols = [...new Set(db.flatMap((r) => Object.keys(r)))].join(', ')
  return `insert into public.${t} (${cols}) select ${cols} from json_populate_recordset(null::public.${t}, ${jsonLiteral(db)});\n`
}

/** Equality on each column, as text: `eq.` filters arrive as text and PostgREST casts them to the column's type. */
function whereSql(table, where) {
  const parts = Object.entries(toDb(ident(table), where)).map(([k, v]) => (v === null ? `${k} is null` : `${k}::text = (${jsonLiteral([v])} ->> 0)`))
  return parts.length ? parts.join(' and ') : 'true'
}

/** `in.(…)` on a column, as text against the list (a name in a uuid column is its uuid), as PostgREST casts each value. */
function inSql(table, column, values, alias = '') {
  const db = values.map((v) => (typeof v === 'string' && isUuid(table, column) ? uuid(v) : v))
  return `${alias}${ident(column)}::text in (select jsonb_array_elements_text(${jsonLiteral(db)}::jsonb))`
}

/**
 * A GET's `select` as PostgREST reads it: plain columns, and to-many embeds
 * `name(cols)` or `name!<foreign key>(cols)` (src/data/outbox.ts's look at gone rounds).
 */
function parseSelect(select) {
  const columns = []
  const embeds = []
  for (const item of select.match(/[^,(]+(\([^()]*\))?/g) ?? []) {
    const m = /^([a-z_][a-z0-9_]*)(?:!([a-z0-9_]+))?\(([^()]*)\)$/.exec(item)
    if (m) embeds.push({ name: ident(m[1]), hint: m[2] ? ident(m[2]) : null, columns: m[3].split(',').map(ident) })
    else columns.push(ident(item))
  }
  return { columns, embeds }
}

/**
 * The relationship PostgREST embeds by, from the schema: the foreign keys
 * between the two tables, either way, narrowed to the hint's constraint when
 * there is one. None is PostgREST's PGRST200, more than one its PGRST201
 * (`tournaments` and `rounds` are joined two ways). Only a to-many embed
 * (the child's key points at the parent) is run here.
 */
function relationship(parent, embed) {
  const fks = psql(`select c.conname || ' ' || c.conrelid::regclass::text || ' ' || a.attname || ' ' || fa.attname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
      where c.contype = 'f'
        and ((c.conrelid = 'public.${parent}'::regclass and c.confrelid = 'public.${embed.name}'::regclass)
          or (c.conrelid = 'public.${embed.name}'::regclass and c.confrelid = 'public.${parent}'::regclass))`)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, child, column, key] = line.split(' ')
      return { name, child: child.replace(/^public\./, ''), column, key }
    })
    .filter((fk) => !embed.hint || fk.name === embed.hint)
  if (!fks.length) return { refused: `PGRST200 Could not find a relationship between '${parent}' and '${embed.name}' in the schema cache` }
  if (fks.length > 1) return { refused: `PGRST201 Could not embed because more than one relationship was found for '${parent}' and '${embed.name}'` }
  const [fk] = fks
  if (fk.child !== embed.name) throw new Error(`only a to-many embed is run here: ${parent} → ${embed.name}`)
  return { column: ident(fk.column), key: ident(fk.key) }
}
/** What PostgREST refuses before the database sees the request: a column it doesn't know, an embed it can't place. */
function refusedBeforeDb(req) {
  const column = unknownColumn(req)
  if (column || req.method !== 'GET' || !req.select.includes('(')) return column
  for (const e of parseSelect(req.select).embeds) {
    const rel = relationship(ident(req.table), e)
    if (rel.refused) return rel.refused
  }
  return null
}

/** An RPC argument as SQL: a uuid for an id, jsonb for an object or a list (its ids mapped, at any depth: `idsToDb`), else text. */
function argSql(k, v) {
  if (v !== null && typeof v === 'object') return `(${jsonLiteral(idsToDb(v))})::jsonb`
  if (typeof v === 'string' && (/_id$/.test(k) || k === 'tid')) return `'${uuid(v)}'::uuid`
  return `${jsonLiteral([v])} ->> 0`
}

/**
 * The statement PostgREST builds for a request (src/data/testing/fakeSupabase.ts
 * parses the same request off the wire):
 * - POST: INSERT of the columns written (`columnsOf`) from
 *   json_populate_recordset; with `Prefer: resolution=merge-duplicates`
 *   ON CONFLICT (on_conflict, or the primary key) DO UPDATE SET each of them;
 *   with ignore-duplicates DO NOTHING.
 * - DELETE: the eq filters as a WHERE.
 * - RPC: the function called with the arguments named, its answer kept to be read.
 */
function requestSql(req) {
  if (req.method === 'RPC') {
    const args = Object.entries(req.args ?? {}).map(([k, v]) => `${ident(k)} => ${argSql(k, v)}`).join(', ')
    return `perform set_config('polo.result', json_build_array((select public.${ident(req.fn)}(${args})))::text, true)`
  }
  const t = ident(req.table)
  if (req.method === 'GET') {
    // As PostgREST builds it: each embed a json_agg subquery of the same statement, as the same caller, its
    // own filters (`<embed>.<column>`) inside it, an empty list when nothing matches (the parent stays).
    const { columns, embeds } = parseSelect(req.select)
    const filters = Object.entries(req.in ?? {})
    const items = columns.map((c) => `p.${c}`)
    for (const e of embeds) {
      const rel = relationship(t, e)
      const own = filters.filter(([k]) => k.startsWith(`${e.name}.`)).map(([k, v]) => inSql(e.name, k.slice(e.name.length + 1), v, 'c.'))
      const where = [`c.${rel.column} = p.${rel.key}`, ...own].join(' and ')
      items.push(`coalesce((select json_agg(x) from (select ${e.columns.map((c) => `c.${c}`).join(', ')} from public.${e.name} c where ${where}) x), '[]'::json) as ${e.name}`)
    }
    const where = [whereSql(t, req.eq ?? {}), ...filters.filter(([k]) => !k.includes('.')).map(([k, v]) => inSql(t, k, v, 'p.'))].join(' and ')
    return `perform set_config('polo.result', (select coalesce(json_agg(q), '[]'::json)::text from (select ${items.join(', ')} from public.${t} p where ${where}) q), true)`
  }
  if (req.method === 'DELETE') return `delete from public.${t} where ${whereSql(t, req.eq ?? {})}`
  const body = (Array.isArray(req.body) ? req.body : [req.body]).map((r) => toDb(t, r))
  // Every row's keys, as supabase-js's `columns` names them (or the case's own): a key one row leaves out is null in it.
  const cols = columnsOf(req).map(ident)
  const list = cols.join(', ')
  let sql = `insert into public.${t} (${list}) select ${list} from json_populate_recordset(null::public.${t}, ${jsonLiteral(body)})`
  const resolution = /resolution=(merge|ignore)-duplicates/.exec(req.prefer ?? '')?.[1]
  if (resolution) {
    const target = (req.onConflict ?? primaryKey(t)).split(',').map(ident).join(', ')
    sql += resolution === 'merge' ? ` on conflict (${target}) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}` : ` on conflict (${target}) do nothing`
  }
  return sql
}

const keys = new Map()
function primaryKey(table) {
  if (!keys.has(table)) {
    keys.set(
      table,
      psql(`select string_agg(a.attname, ',' order by k.ord) from pg_index i
        cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
        where i.indrelid = 'public.${ident(table)}'::regclass and i.indisprimary`),
    )
  }
  return keys.get(table)
}

/** PostgREST's HTTP status for a SQLSTATE (its documented table), and for its own PGRST204. */
function statusOf(state, anon) {
  if (state === '00000') return null
  if (state === 'PGRST204' || state === 'PGRST200') return 400
  if (state === 'PGRST201') return 300
  if (state === '42501') return anon ? 401 : 403
  if (state === '23503' || state === '23505') return 409
  if (state === '25006') return 405
  if (state === 'P0001') return 400
  if (/^(08|53)/.test(state)) return 503
  if (/^(0L|0P|28)/.test(state)) return 403
  if (state === '42883' || state === '42P01') return 404
  // 21000 is a 400 only for pg-safeupdate's «UPDATE requires a WHERE clause», which these requests never meet.
  if (/^(09|21|25|2D|38|39|3B|40|54|55|57|58|F0|HV|P0|XX)/.test(state) || state === '42P17') return 500
  return 400
}

function runCase(c) {
  const anon = c.as === 'anon'
  const claims = anon ? { role: 'anon' } : { sub: uuid(c.as), role: 'authenticated', aud: 'authenticated', is_anonymous: true }
  let sql = 'begin;\n'
  const users = spec.world.users.map((u) => ({ id: uuid(u), is_anonymous: true, raw_app_meta_data: { provider: 'anonymous', providers: ['anonymous'] }, raw_user_meta_data: {} }))
  sql += `insert into auth.users (id, is_anonymous, raw_app_meta_data, raw_user_meta_data) select id, is_anonymous, raw_app_meta_data, raw_user_meta_data from json_populate_recordset(null::auth.users, ${jsonLiteral(users)});\n`
  for (const [table, rows] of Object.entries(spec.world.tables)) sql += insertRows(table, rows)
  for (const [table, rows] of Object.entries(c.given ?? {})) sql += insertRows(table, rows)
  // The players whose PIN the case's phone knows: 1234, as claim_player checks it.
  for (const p of c.pins ?? []) sql += `insert into public.player_pins (player_id, pin_hash) values ('${uuid(p)}', extensions.crypt('1234', extensions.gen_salt('bf')));\n`
  sql += `set local role ${anon ? 'anon' : 'authenticated'};\n`
  sql += `set local request.jwt.claims to '${JSON.stringify(claims)}';\n`
  // Earlier requests of the same phone: each must go through.
  for (const step of c.before ?? []) sql += `do $before$\nbegin\n  ${requestSql(step)};\nend\n$before$;\n`
  sql += `select set_config('polo.result', '[]', true) is null;\n`
  const refused = refusedBeforeDb(c.request)
  sql += refused
    ? `select set_config('polo.outcome', ${jsonLiteral([refused])} ->> 0, true) is null;\n`
    : `do $request$\nbegin\n  ${requestSql(c.request)};\n  perform set_config('polo.outcome', '00000', true);\nexception when others then\n  perform set_config('polo.outcome', sqlstate || ' ' || sqlerrm, true);\nend\n$request$;\n`
  sql += 'reset role;\n'
  const checks = (c.then ?? []).map((t) => {
    const cols = [...new Set(t.rows.flatMap((r) => Object.keys(r)))].map(ident)
    const select = cols.length ? cols.join(', ') : '1 as present'
    return `(select coalesce(json_agg(q), '[]'::json) from (select ${select} from public.${ident(t.table)} where ${whereSql(t.table, t.where ?? {})}) q)`
  })
  // As jsonb text: one line, whatever json_agg put between its rows.
  sql += `select json_build_object('outcome', current_setting('polo.outcome'), 'read', current_setting('polo.result')::json, 'after', json_build_array(${checks.join(', ')}))::jsonb::text;\nrollback;\n`
  const out = JSON.parse(psql(sql).split('\n').at(-1))
  const [state, ...message] = out.outcome.split(' ')
  return { state, message: message.join(' '), status: statusOf(state, anon), read: out.read.map(fromDb), after: out.after.map((rows) => rows.map(fromDb)) }
}

/** The status a request answered with when it went through. */
const okStatus = { GET: 200, POST: 201, DELETE: 204, RPC: 200 }

const sortRows = (rows) => rows.map((r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]))).sort()
/**
 * `expect.answer`: an RPC's answer holds at least what the case writes. An object, the keys it names; a list, as
 * many items, each matching a different one in any order (the database's order of a set is none); else equal.
 */
function holds(actual, want) {
  if (Array.isArray(want)) {
    if (!Array.isArray(actual) || actual.length !== want.length) return false
    const free = actual.map(() => true)
    return want.every((w) => {
      const i = actual.findIndex((a, j) => free[j] && holds(a, w))
      if (i < 0) return false
      free[i] = false
      return true
    })
  }
  if (want && typeof want === 'object') return !!actual && typeof actual === 'object' && !Array.isArray(actual) && Object.entries(want).every(([k, v]) => holds(actual[k] ?? null, v))
  return actual === want
}
let failed = 0
for (const c of spec.cases) {
  let got
  try {
    got = runCase(c)
  } catch (e) {
    failed++
    console.log(`  ✗ ${c.name}\n      ${String(e.message ?? e).split('\n').join('\n      ')}`)
    continue
  }
  const want = c.expect
  const problems = []
  const status = got.status ?? okStatus[c.request.method]
  if (want.status !== status) problems.push(`status ${status} (${got.state} ${got.message}), expected ${want.status}${want.code ? ` ${want.code}` : ''}`)
  else if (want.code && want.code !== got.state) problems.push(`code ${got.state} (${got.message}), expected ${want.code}`)
  if (want.rows && JSON.stringify(sortRows(got.read)) !== JSON.stringify(sortRows(want.rows))) problems.push(`read ${JSON.stringify(got.read)}, expected ${JSON.stringify(want.rows)}`)
  if (want.answer && !(got.read.length === 1 && holds(got.read[0], want.answer))) problems.push(`answered ${JSON.stringify(got.read)}, expected at least ${JSON.stringify(want.answer)}`)
  ;(c.then ?? []).forEach((t, i) => {
    const expected = t.rows.map((r) => Object.fromEntries(Object.entries(r)))
    const actual = got.after[i].map((r) => (Object.keys(r).length === 1 && 'present' in r ? {} : r))
    if (JSON.stringify(sortRows(actual)) !== JSON.stringify(sortRows(expected))) problems.push(`${t.table} where ${JSON.stringify(t.where ?? {})}: ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
  })
  if (print) {
    console.log(`${problems.length ? '≠' : '='} ${c.name}\n    ${status} ${got.state} ${got.message}\n    ${JSON.stringify(['GET', 'RPC'].includes(c.request.method) ? got.read : got.after)}`)
  } else if (problems.length) {
    failed++
    console.log(`  ✗ ${c.name}\n      ${problems.join('\n      ')}`)
  }
}
if (!print) {
  if (failed) {
    console.log(`  ✗ ${failed} of ${spec.cases.length} cases: the database disagrees with the case file (and so with the test server)`)
    process.exit(1)
  }
  console.log(`  ✓ ${spec.cases.length} requests: the database answers each as the case file (and the test server) does`)
}
