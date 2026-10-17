#!/usr/bin/env node
// The database's TypeScript types, from a database the migrations built
// (ARCH-03): src/data/database.types.ts, in the shape `supabase gen types
// typescript` writes (Tables Row / Insert / Update / Relationships, Views,
// Functions Args / Returns, Enums, CompositeTypes; schema `public`), so
// `createClient<Database>` types every table read, write and RPC.
//
//   PGDATABASE=<a database with every migration applied> node scripts/gen-db-types.mjs > src/data/database.types.ts
//
// Of Supabase's helpers it writes the two the app reads (Tables, TablesUpdate):
// an export nobody reads fails src/lib/deadExports.test.ts.
//
// Read from the catalog through psql (scripts/lib/local.mjs, the PG*
// variables), never from production: the db CI job replays the chain from zero
// and fails when the committed file differs from what this prints. The CLI's
// generator needs Docker (postgres-meta); this needs nothing but psql.
//
// As Supabase maps them: integers, floats and numeric are number; bool is
// boolean; json and jsonb are Json; text, uuid, dates and times are string; an
// array is T[]; void is undefined; a domain is its base type; anything outside
// `public` is unknown. A row column is `T | null` unless NOT NULL; on Insert a
// column is optional when it is nullable, has a default or is an identity, and
// `never` when generated; on Update every column is optional. A function's
// arguments with defaults are optional; set-returning functions answer arrays;
// a function returning a table's row type carries SetofOptions; trigger
// functions are left out. Two differences, both from the catalog: a table's
// `tournament_id` that a BEFORE INSERT trigger fills from its parent (0030's
// `tenant_from_round/group/lot`) is optional on Insert, as every writer leaves
// it out; every argument also takes null, since SQL passes it through and the
// app sends `?? null` on purpose; and a json or jsonb argument is `unknown`
// (whatever JSON.stringify sends: the function's body reads it, and the app's
// interfaces carry no index signature to meet `Json` with).
import { rows } from './lib/local.mjs'

const NUMBER = new Set(['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'oid'])
const STRING = new Set(['text', 'varchar', 'bpchar', 'char', 'name', 'citext', 'uuid', 'date', 'time', 'timetz', 'timestamp', 'timestamptz', 'interval', 'bytea', 'inet', 'cidr', 'macaddr', 'tsvector', 'money'])

const types = new Map(
  rows(`
    select t.oid::int as oid, t.typname as name, t.typtype as kind, t.typelem::int as elem, t.typbasetype::int as base,
           t.typrelid::int as rel, n.nspname as schema, t.typcategory as category,
           (select c.relkind from pg_class c where c.oid = t.typrelid) as relkind,
           (select c.relname from pg_class c where c.oid = t.typrelid) as relname
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
  `).map((t) => [t.oid, t]),
)

const q = (s) => JSON.stringify(s)
const key = (s) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) ? s : q(s))
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/** The TypeScript type of a Postgres type, as Supabase's generator writes it. */
function ts(oid) {
  const t = types.get(oid)
  if (!t) return 'unknown'
  if (t.kind === 'd') return ts(t.base)
  if (t.category === 'A' && t.elem) return `${wrap(ts(t.elem))}[]`
  if (t.schema === 'pg_catalog') {
    if (t.name === 'bool') return 'boolean'
    if (t.name === 'json' || t.name === 'jsonb') return 'Json'
    if (t.name === 'void') return 'undefined'
    if (t.name === 'record') return 'Record<string, unknown>'
    if (NUMBER.has(t.name)) return 'number'
    if (STRING.has(t.name)) return 'string'
    return 'unknown'
  }
  if (t.schema !== 'public') return 'unknown'
  if (t.kind === 'e') return `Database["public"]["Enums"][${q(t.name)}]`
  if (t.kind === 'c') {
    if (t.relkind === 'c') return `Database["public"]["CompositeTypes"][${q(t.name)}]`
    if (t.relkind === 'v' || t.relkind === 'm') return `Database["public"]["Views"][${q(t.relname)}]["Row"]`
    return `Database["public"]["Tables"][${q(t.relname)}]["Row"]`
  }
  return 'unknown'
}
const wrap = (s) => (/[|&\s]/.test(s) ? `(${s})` : s)

const relations = rows(`
  select c.oid::int as oid, c.relname as name, c.relkind as kind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
`)
const columns = rows(`
  select a.attrelid::int as rel, a.attname as name, a.atttypid::int as type, a.attnotnull as notnull,
         a.atthasdef as hasdef, a.attidentity as identity, a.attgenerated as generated
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f') and a.attnum > 0 and not a.attisdropped
`)
// Foreign keys inside `public` (PostgREST embeds nothing else), each with whether its columns are also a key of the table (one to one).
const fkeys = rows(`
  select k.conname as name, k.conrelid::int as rel, r.relname as referenced,
         (select array_agg(a.attname order by x.n) from unnest(k.conkey) with ordinality x(attnum, n) join pg_attribute a on a.attrelid = k.conrelid and a.attnum = x.attnum) as columns,
         (select array_agg(a.attname order by x.n) from unnest(k.confkey) with ordinality x(attnum, n) join pg_attribute a on a.attrelid = k.confrelid and a.attnum = x.attnum) as "referencedColumns",
         exists (select 1 from pg_constraint u where u.conrelid = k.conrelid and u.contype in ('p', 'u')
                   and u.conkey::int[] @> k.conkey::int[] and u.conkey::int[] <@ k.conkey::int[]) as "isOneToOne"
  from pg_constraint k
  join pg_class r on r.oid = k.confrelid join pg_namespace rn on rn.oid = r.relnamespace
  join pg_class s on s.oid = k.conrelid join pg_namespace sn on sn.oid = s.relnamespace
  where k.contype = 'f' and sn.nspname = 'public' and rn.nspname = 'public'
`)
const functions = rows(`
  select p.proname as name, p.prorettype::int as returns, p.proretset as setof, p.pronargdefaults as defaults,
         coalesce(p.proallargtypes::int[], p.proargtypes::int[]) as types, p.proargnames as names, p.proargmodes as modes,
         pg_get_function_identity_arguments(p.oid) as signature
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
`)
// Tables whose tournament_id 0030's trigger fills when the writer leaves it out (tgtype 7: row, before, insert).
const filled = new Set(
  rows(`
    select t.tgrelid::int as rel from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_namespace n on n.oid = p.pronamespace
    where not t.tgisinternal and n.nspname = 'public' and p.proname in ('tenant_from_round', 'tenant_from_group', 'tenant_from_lot') and (t.tgtype & 7) = 7
  `).map((r) => r.rel),
)
const enums = rows(`
  select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
  from pg_type t join pg_namespace n on n.oid = t.typnamespace join pg_enum e on e.enumtypid = t.oid
  where n.nspname = 'public' group by t.typname
`)
const composites = rows(`
  select t.typname as name, c.oid::int as rel
  from pg_type t join pg_namespace n on n.oid = t.typnamespace join pg_class c on c.oid = t.typrelid
  where n.nspname = 'public' and t.typtype = 'c' and c.relkind = 'c'
`)

const out = []
const emit = (indent, line) => out.push(' '.repeat(indent) + line)
const never = (indent) => {
  emit(indent, '[_ in never]: never')
}
const colsOf = (rel) => columns.filter((c) => c.rel === rel).sort((a, b) => byName(a.name, b.name))

function table(rel, writable, indent) {
  const cols = colsOf(rel.oid)
  emit(indent, `${key(rel.name)}: {`)
  emit(indent + 2, 'Row: {')
  for (const c of cols) emit(indent + 4, `${key(c.name)}: ${ts(c.type)}${c.notnull ? '' : ' | null'}`)
  emit(indent + 2, '}')
  if (writable) {
    emit(indent + 2, 'Insert: {')
    for (const c of cols) {
      if (c.generated || c.identity === 'a') emit(indent + 4, `${key(c.name)}?: never`)
      else {
        const optional = !c.notnull || c.hasdef || c.identity || (c.name === 'tournament_id' && filled.has(rel.oid))
        emit(indent + 4, `${key(c.name)}${optional ? '?' : ''}: ${ts(c.type)}${c.notnull ? '' : ' | null'}`)
      }
    }
    emit(indent + 2, '}')
    emit(indent + 2, 'Update: {')
    for (const c of cols) {
      if (c.generated || c.identity === 'a') emit(indent + 4, `${key(c.name)}?: never`)
      else emit(indent + 4, `${key(c.name)}?: ${ts(c.type)}${c.notnull ? '' : ' | null'}`)
    }
    emit(indent + 2, '}')
  }
  const fks = fkeys.filter((k) => k.rel === rel.oid).sort((a, b) => byName(a.name, b.name) || byName(a.referenced, b.referenced))
  if (!fks.length) emit(indent + 2, 'Relationships: []')
  else {
    emit(indent + 2, 'Relationships: [')
    for (const k of fks) {
      emit(indent + 4, '{')
      emit(indent + 6, `foreignKeyName: ${q(k.name)}`)
      emit(indent + 6, `columns: [${k.columns.map(q).join(', ')}]`)
      emit(indent + 6, `isOneToOne: ${k.isOneToOne}`)
      emit(indent + 6, `referencedRelation: ${q(k.referenced)}`)
      emit(indent + 6, `referencedColumns: [${k.referencedColumns.map(q).join(', ')}]`)
      emit(indent + 4, '},')
    }
    emit(indent + 2, ']')
  }
  emit(indent, '}')
}

/** An argument's type: null too, and anything JSON for json and jsonb. */
function argType(oid) {
  const t = ts(oid)
  return t === 'Json' ? 'unknown' : `${t} | null`
}

/** One definition of a function: its arguments and what it answers. */
function definition(f) {
  const modes = f.modes ?? f.types.map(() => 'i')
  const names = f.names ?? []
  const ins = []
  const outs = []
  f.types.forEach((type, i) => {
    const mode = modes[i]
    const arg = { name: names[i] ?? '', type }
    if (mode === 'i' || mode === 'b' || mode === 'v') ins.push(arg)
    if (mode === 'o' || mode === 'b' || mode === 't') outs.push(arg)
  })
  const optionalFrom = ins.length - f.defaults
  const args = ins.length
    ? `{ ${ins.map((a, i) => `${key(a.name)}${i >= optionalFrom ? '?' : ''}: ${argType(a.type)}`).join('; ')} }`
    : 'Record<PropertyKey, never>'
  let returns
  let setof = null
  if (outs.length) {
    returns = `{ ${[...outs].sort((a, b) => byName(a.name, b.name)).map((a) => `${key(a.name)}: ${ts(a.type)} | null`).join('; ')} }`
    if (f.setof) returns += '[]'
  } else {
    const t = types.get(f.returns)
    returns = ts(f.returns)
    if (t && t.schema === 'public' && t.kind === 'c' && t.relkind !== 'c') {
      setof = `{ from: "*"; to: ${q(t.relname)}; isOneToOne: ${!f.setof}; isSetofReturn: ${f.setof} }`
    }
    if (f.setof) returns = `${wrap(returns)}[]`
  }
  return { args, returns, setof }
}

emit(0, '// Generated by scripts/gen-db-types.mjs from the migrations (ARCH-03). Do not edit:')
emit(0, '// the db CI job regenerates it and fails when this file differs.')
emit(0, 'export type Json =')
emit(2, '| string')
emit(2, '| number')
emit(2, '| boolean')
emit(2, '| null')
emit(2, '| { [key: string]: Json | undefined }')
emit(2, '| Json[]')
emit(0, '')
emit(0, 'export type Database = {')
emit(2, 'public: {')
emit(4, 'Tables: {')
for (const r of relations.filter((r) => r.kind === 'r' || r.kind === 'p' || r.kind === 'f').sort((a, b) => byName(a.name, b.name))) table(r, true, 6)
emit(4, '}')
emit(4, 'Views: {')
const views = relations.filter((r) => r.kind === 'v' || r.kind === 'm').sort((a, b) => byName(a.name, b.name))
if (!views.length) never(6)
for (const r of views) table(r, false, 6)
emit(4, '}')
emit(4, 'Functions: {')
const fnNames = [...new Set(functions.map((f) => f.name))].sort(byName)
if (!fnNames.length) never(6)
for (const name of fnNames) {
  const defs = functions.filter((f) => f.name === name).sort((a, b) => byName(a.signature, b.signature)).map(definition)
  const body = (d) => `{ Args: ${d.args}; Returns: ${d.returns}${d.setof ? `; SetofOptions: ${d.setof}` : ''} }`
  if (defs.length === 1) emit(6, `${key(name)}: ${body(defs[0])}`)
  else {
    emit(6, `${key(name)}:`)
    for (const d of defs) emit(8, `| ${body(d)}`)
  }
}
emit(4, '}')
emit(4, 'Enums: {')
if (!enums.length) never(6)
for (const e of enums.sort((a, b) => byName(a.name, b.name))) emit(6, `${key(e.name)}: ${e.labels.map(q).join(' | ')}`)
emit(4, '}')
emit(4, 'CompositeTypes: {')
if (!composites.length) never(6)
for (const c of composites.sort((a, b) => byName(a.name, b.name))) {
  emit(6, `${key(c.name)}: {`)
  for (const col of colsOf(c.rel)) emit(8, `${key(col.name)}: ${ts(col.type)} | null`)
  emit(6, '}')
}
emit(4, '}')
emit(2, '}')
emit(0, '}')
emit(0, '')
emit(0, 'type PublicSchema = Database["public"]')
emit(0, '')
emit(0, '/** A table\'s row as the server answers it. */')
emit(0, 'export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]')
emit(0, '/** What an update of the table may send. */')
emit(0, 'export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]')

process.stdout.write(out.join('\n') + '\n')
