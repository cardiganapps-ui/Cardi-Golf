#!/usr/bin/env node
// Seeds (or re-seeds) the "Ensayo" rehearsal tournament (CLAUDE.md §13, §17):
// the first tournament's settings, 12 made-up players in tiers with placeholder
// handicaps, a par-72 placeholder course, two rounds with the real dates, the
// pairs and groups of the fixture, and the logo. It sets no PIN: the Comité
// generates them in the app (Comité › Jugadores › Generar PINs), so no PIN is
// ever in the repo (CHAIR-02) and a re-seed keeps the ones already handed out.
//   node scripts/seed-ensayo.mjs --owner <email> [--reset]
// The owner account is created if it does not exist (a random password is
// set; the owner signs in with "Olvidé mi contraseña" or a magic link).
// Never touches any tournament other than the one with slug "ensayo".
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { loadEnv } from './lib/env.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
loadEnv()
const URL_ = process.env.VITE_SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY
if (!URL_ || !SECRET) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SECRET_KEY')
  process.exit(1)
}
const args = process.argv.slice(2)
const owner = args[args.indexOf('--owner') + 1]
const reset = args.includes('--reset')
if (!owner || owner.startsWith('--')) {
  console.error('usage: seed-ensayo.mjs --owner <email> [--reset]')
  process.exit(1)
}

const sb = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })
const die = (e, ctx) => {
  console.error(ctx, e?.message ?? e)
  process.exit(1)
}

// Owner account.
let ownerId = null
{
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if (error) die(error, 'listUsers')
  const u = data.users.find((x) => x.email?.toLowerCase() === owner.toLowerCase())
  if (u) ownerId = u.id
  else {
    const { data: created, error: e2 } = await sb.auth.admin.createUser({
      email: owner,
      password: randomBytes(18).toString('base64url'),
      email_confirm: true,
      user_metadata: { display_name: owner.split('@')[0] },
    })
    if (e2) die(e2, 'createUser')
    ownerId = created.user.id
    console.log('created owner account', owner)
  }
  await sb.from('organizers').upsert({ auth_user_id: ownerId, display_name: owner.split('@')[0] })
}

// Tournament.
const settings = JSON.parse(
  await readFile(path.join(root, 'scripts', 'fixtures', 'settings-first-tournament.json'), 'utf8'),
)
let { data: t } = await sb.from('tournaments').select('*').eq('slug', 'ensayo').maybeSingle()
if (t && reset) {
  await sb.from('tournaments').delete().eq('id', t.id)
  t = null
  console.log('deleted previous Ensayo')
}
if (!t) {
  const { data, error } = await sb
    .from('tournaments')
    .insert({
      slug: 'ensayo',
      name: 'Ensayo, Nacho Invitational',
      tagline: 'Torneo de prueba, Los Cabos 2027',
      join_code: 'ENSAYO',
      status: 'setup',
      settings,
      accent_color: '#1e6b3b', // ACCENTS[0] 'Fairway' in src/design/accents.ts
      created_by: ownerId,
    })
    .select('*')
    .single()
  if (error) die(error, 'insert tournament')
  t = data
  console.log('created tournament', t.slug, t.join_code)
} else {
  await sb.from('tournaments').update({ settings }).eq('id', t.id)
  console.log('tournament exists', t.slug, t.join_code)
}
await sb.from('tournament_organizers').upsert({ tournament_id: t.id, auth_user_id: ownerId, role: 'owner' })

// Logo: its rendition, as Comité › Torneo stores one (src/lib/logo.ts, PERF-01): WebP inside
// 720 × 240, transparency kept, its size in its name, a new file cached a year. The 889 KB
// PNG itself used to go up and ship to a 28 px header.
try {
  const { default: sharp } = await import('sharp')
  const png = await readFile(path.join(root, 'assets', 'nacho-logo.png'))
  const { data: webp, info } = await sharp(png)
    .resize({ width: 720, height: 240, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true })
  const p = `${t.id}/logo-${info.width}x${info.height}-${Date.now()}.webp`
  const { error } = await sb.storage
    .from('tournament-assets')
    .upload(p, webp, { upsert: true, contentType: 'image/webp', cacheControl: '31536000' })
  if (error) throw error
  const { data } = sb.storage.from('tournament-assets').getPublicUrl(p)
  await sb.from('tournaments').update({ logo_url: data.publicUrl }).eq('id', t.id)
  console.log('logo uploaded')
} catch (/** @type {any} */ e) {
  console.warn('logo skipped:', e.message)
}

// Course (placeholder until the real scorecards arrive).
const PAR_72 = [
  [4, 7],
  [4, 11],
  [3, 17],
  [5, 3],
  [4, 1],
  [4, 13],
  [3, 15],
  [4, 9],
  [5, 5],
  [4, 8],
  [3, 18],
  [4, 2],
  [5, 12],
  [4, 4],
  [4, 10],
  [3, 16],
  [4, 6],
  [5, 14],
]
let { data: course } = await sb
  .from('courses')
  .select('id')
  .eq('name', 'Campo de ensayo (par 72)')
  .eq('created_by', ownerId)
  .maybeSingle()
if (!course) {
  const { data, error } = await sb
    .from('courses')
    .insert({
      name: 'Campo de ensayo (par 72)',
      location: 'Los Cabos (placeholder)',
      source: 'manual',
      created_by: ownerId,
    })
    .select('id')
    .single()
  if (error) die(error, 'insert course')
  course = data
  const { data: tee, error: e2 } = await sb
    .from('tees')
    .insert({
      course_id: course.id,
      name: 'Azules',
      color: 'blue',
      rating: 72.0,
      slope: 125,
      par_total: 72,
      sort_order: 0,
    })
    .select('id')
    .single()
  if (e2) die(e2, 'insert tee')
  const { data: tee2 } = await sb
    .from('tees')
    .insert({
      course_id: course.id,
      name: 'Rojas',
      color: 'red',
      rating: 68.5,
      slope: 115,
      par_total: 72,
      sort_order: 1,
    })
    .select('id')
    .single()
  for (const tid of [tee.id, tee2.id]) {
    await sb
      .from('holes')
      .insert(PAR_72.map(([par, si], i) => ({ tee_id: tid, number: i + 1, par, stroke_index: si, yards: 320 + i * 7 })))
  }
  console.log('course created')
}
const { data: tees } = await sb.from('tees').select('id, name').eq('course_id', course.id).order('sort_order')
const blue = tees.find((x) => x.name === 'Azules')?.id
const red = tees.find((x) => x.name === 'Rojas')?.id

// Players: made-up names, never the real ones (those live in the tournament itself, CHAIR-02); two share a
// first name, as the first tournament's do, so the short names tell them apart. Tiers/handicaps are placeholders.
const PLAYERS = [
  ['Lorenzo Lizárraga', 'Lorenzo', 'A', 6],
  ['Santiago Arreola', 'Santiago A.', 'A', 8],
  ['Santiago Olvera', 'Santiago O.', 'A', 10],
  ['Gonzalo Zavala', 'Gonzalo', 'B', 12],
  ['Federico Macías', 'Federico', 'B', 14],
  ['Rafael Olguín', 'Rafael', 'B', 16],
  ['Héctor Izaguirre', 'Héctor', 'C', 18],
  ['Pablo Rentería', 'Pablo', 'C', 20],
  ['Ernesto Villarreal', 'Ernesto', 'C', 22],
  ['Álvaro Quintero', 'Álvaro', 'D', 25],
  ['Marcelo Carrasco', 'Marcelo', 'D', 28],
  ['Jugador 12 (por confirmar)', 'Jugador 12', 'D', 33],
]
const { data: existing } = await sb.from('players').select('id, full_name, sort_order').eq('tournament_id', t.id)
// A player is found by name, else by position: a re-seed that renames one updates his row (his PIN, scores and
// pairs stay) instead of adding a thirteenth.
const byName = new Map(existing.map((p) => [p.full_name, p.id]))
const byOrder = new Map(existing.map((p) => [p.sort_order, p.id]))
const used = new Set()
const ids = []
for (const [i, [full, short, tier, hcp]] of PLAYERS.entries()) {
  const row = {
    tournament_id: t.id,
    full_name: full,
    display_name: short,
    tier,
    base_hcp: hcp,
    handicap_source: 'manual',
    default_tee_id: tier === 'D' ? red : blue,
    is_honoree: false,
    is_admin: i === 8,
    sort_order: i,
  }
  let id = byName.get(full) ?? byOrder.get(i)
  if (id && used.has(id)) id = undefined
  if (id) {
    used.add(id)
    await sb.from('players').update(row).eq('id', id)
    ids.push(id)
  } else {
    const { data, error } = await sb.from('players').insert(row).select('id').single()
    if (error) die(error, 'insert player')
    ids.push(data.id)
  }
}
// No PIN here: the Comité generates one per player in the app, so none is ever in the repo (CHAIR-02), and a
// re-seed leaves the ones already handed out as they are.
console.log('players ready:', ids.length)
// The admin player is also the banker (§11) so Dinero has someone to settle through.
// Nacho is not marked as honoree until Diego confirms who he is (§15).
{
  const { error } = await sb.from('tournaments').update({ banker_player_id: ids[8] }).eq('id', t.id)
  if (error) die(error, 'set banker')
}

// Rounds with the real dates (§2).
const rounds = []
for (const [n, date] of [
  [1, '2027-04-09'],
  [2, '2027-04-10'],
]) {
  const { data, error } = await sb
    .from('rounds')
    .upsert(
      { tournament_id: t.id, number: n, date, course_id: course.id, holes: 18, status: 'scheduled' },
      { onConflict: 'tournament_id,number' },
    )
    .select('id')
    .single()
  if (error) die(error, 'upsert round')
  rounds.push(data.id)
}

// Pairs A+D / B+C and Day 1 groups (one A+D pair with one B+C pair).
const P = (i) => ids[i]
const must = (r, ctx) => {
  if (r.error) die(r.error, ctx)
  return r.data
}
const { count: pairCount } = await sb
  .from('pairs')
  .select('*', { count: 'exact', head: true })
  .eq('tournament_id', t.id)
if (!pairCount) {
  const pairs = [
    ['Los Uno', P(0), P(9), 'AD'],
    ['Los Dos', P(1), P(10), 'AD'],
    ['Los Tres', P(2), P(11), 'AD'],
    ['Los Cuatro', P(3), P(6), 'BC'],
    ['Los Cinco', P(4), P(7), 'BC'],
    ['Los Seis', P(5), P(8), 'BC'],
  ]
  must(
    await sb.from('pairs').insert(
      pairs.map(([name, a, b, kind]) => ({
        tournament_id: t.id,
        name,
        player1_id: a,
        player2_id: b,
        kind,
        drawn_at: new Date().toISOString(),
      })),
    ),
    'insert pairs',
  )
  console.log('pairs created')
}
for (const rid of rounds) {
  const groups = must(await sb.from('groups').select('id, number').eq('round_id', rid), 'select groups')
  /** @type {Array<[number, string[]]>} */
  const plan = [
    [1, [P(0), P(9), P(3), P(6)]],
    [2, [P(1), P(10), P(4), P(7)]],
    [3, [P(2), P(11), P(5), P(8)]],
  ]
  for (const [g, members] of plan) {
    let grp = groups.find((x) => x.number === g)
    if (!grp) {
      grp = must(
        await sb
          .from('groups')
          .insert({ round_id: rid, number: g, tee_time: `09:${String((g - 1) * 10).padStart(2, '0')}`, start_hole: 1 })
          .select('id, number')
          .single(),
        'insert group',
      )
    }
    const { count } = await sb.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', grp.id)
    if (!count)
      must(
        await sb.from('group_members').insert(members.map((pid) => ({ group_id: grp.id, player_id: pid }))),
        'insert group members',
      )
  }
}
console.log('groups ready')

console.log(`\n✓ Ensayo ready → /t/ensayo (code ENSAYO), owner ${owner}`)
console.log('Genera y reparte los PIN desde Comité › Jugadores › Generar PINs')
