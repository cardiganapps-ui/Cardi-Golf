#!/usr/bin/env node
// The platform admin against the live Supabase project (migration 0021).
// Proves:
//   - nobody else reaches a platform_* RPC,
//   - the admin is the Comité of a tournament he does not belong to, and
//     what he does there is marked «Admin de Polo»,
//   - reading every tournament does not make every profile visible,
//   - Protegido holds against everyone until the admin unlocks it.
//
// Test accounts are made with the service key and one is made admin with
// SQL for the length of the run; everything is removed at the end.
//   node scripts/platform-test.mjs
// Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY,
// SUPABASE_PAT and SUPABASE_PROJECT_REF (.env.local).
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadEnv } from './lib/env.mjs'
import { query } from './lib/mgmt.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
loadEnv()
const URL_ = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SECRET = process.env.SUPABASE_SECRET_KEY
if (!URL_ || !ANON || !SECRET) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SECRET_KEY')
  process.exit(1)
}

const service = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })
const client = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
const rand = Math.random().toString(36).slice(2, 8)
const created = { users: [], tournaments: [] }
let failures = 0
const check = (cond, label, detail) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) {
    failures++
    if (detail !== undefined) console.log('    ', JSON.stringify(detail))
  }
}
const uuid = (s) => {
  if (!/^[0-9a-f-]{36}$/.test(s)) throw new Error(`not a uuid: ${s}`)
  return s
}
const settings = JSON.parse(await readFile(path.join(root, 'scripts', 'fixtures', 'settings-minimal.json'), 'utf8'))

async function account(tag, name) {
  const sb = client()
  const email = `plat-${tag}-${rand}@cardi-golf.test`
  const password = `Pw-${rand}-${tag}!`
  const { data: made, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } })
  if (error) throw error
  created.users.push(made.user.id)
  const { error: signInErr } = await sb.auth.signInWithPassword({ email, password })
  if (signInErr) throw signInErr
  return { sb, id: made.user.id, email }
}

// Every platform_* RPC with harmless arguments.
const PLATFORM_CALLS = (tid) => [
  ['platform_overview', {}],
  ['platform_daily', { p_days: 7 }],
  ['platform_tournaments', {}],
  ['platform_tournament', { p_tournament_id: tid }],
  ['platform_unlock', { p_tournament_id: tid, p_reason: 'prueba' }],
  ['platform_relock', { p_tournament_id: tid }],
]
const denied = (e) => !!e && (e.code === '42501' || /permission denied|Solo el admin/.test(e.message ?? ''))

try {
  console.log('setting up: an organizer with a tournament, a stranger, a device, a player account, the admin…')
  const A = await account('a', 'Ana Organiza')
  const { data: T, error: tErr } = await A.sb.rpc('create_tournament', { p_name: `Plat ${rand}`, p_settings: settings })
  if (tErr) throw tErr
  created.tournaments.push(T.id)
  const { data: p0 } = await A.sb.from('players').insert({ tournament_id: T.id, full_name: 'Pablo Jugador', display_name: 'Pablo', sort_order: 0 }).select('id').single()
  const { data: r1 } = await A.sb.from('rounds').insert({ tournament_id: T.id, number: 1, holes: 18 }).select('id').single()

  const N = await account('n', 'Nora Normal')
  const dev = client()
  const { data: anon } = await dev.auth.signInAnonymously()
  created.users.push(anon.user.id)

  // A player with a hidden profile, confirmed in the tournament.
  const U = await account('u', 'Úrsula Privada')
  const { data: uProfile } = await U.sb.rpc('ensure_my_profile')
  await A.sb.rpc('comite_link_profile', { p_player_id: p0.id, p_handle: uProfile.handle })
  const { data: linked } = await U.sb.rpc('link_my_profile', { p_player_id: p0.id })
  if (!linked?.ok) throw new Error('could not link U')
  await U.sb.from('profiles').update({ discoverable: false, bio: 'No me busquen' }).eq('id', U.id)

  const P = await account('p', 'Pepe Plataforma')
  await P.sb.rpc('ensure_my_profile')
  await query(`insert into public.platform_admins (auth_user_id, note) values ('${uuid(P.id)}', 'platform-test')`)

  console.log('nobody else reaches the platform:')
  for (const [who, sb] of [['an account', N.sb], ['an organizer', A.sb], ['an anonymous device', dev]]) {
    const { data: isAdmin } = await sb.rpc('is_platform_admin')
    const results = await Promise.all(PLATFORM_CALLS(T.id).map(([fn, args]) => sb.rpc(fn, args)))
    const leaks = PLATFORM_CALLS(T.id).filter((_, i) => !denied(results[i].error)).map(([fn]) => fn)
    check(isAdmin === false && leaks.length === 0, `${who}: is_platform_admin is false and every platform_* is refused`, { isAdmin, leaks })
  }
  const { data: nSees } = await N.sb.from('tournaments').select('id').eq('id', T.id)
  check((nSees ?? []).length === 0, 'an unrelated account still reads nothing of the tournament')

  console.log('the admin is the Comité anywhere:')
  const { data: pIs } = await P.sb.rpc('is_platform_admin')
  check(pIs === true, 'is_platform_admin is true for the admin')
  const { data: pSees } = await P.sb.from('tournaments').select('id, name').eq('id', T.id)
  check(pSees?.length === 1, 'the admin reads a tournament he does not belong to')
  const { data: pm } = await P.sb.rpc('my_membership', { tid: T.id })
  check(pm?.via === 'platform' && pm.role === 'platform' && pm.isOrganizer === true && pm.playerId === null && pm.protected === false, 'my_membership says via platform, organizer', pm)
  const { data: am } = await A.sb.rpc('my_membership', { tid: T.id })
  check(am?.via !== 'platform' && am?.role === 'owner' && am.isOrganizer === true, 'the owner is still the owner', am)
  const { error: pSave } = await P.sb.rpc('admin_save_score', { p_round_id: r1.id, p_player_id: p0.id, p_hole: 1, p_strokes: 5, p_putts: 2, p_picked_up: false, p_reason: 'Prueba de plataforma' })
  check(!pSave, 'the admin corrects a score (admin_save_score)', pSave?.message)
  const [mark] = await query(`select actor_platform, actor_auth_user_id::text as who from public.audit_log where table_name = 'scores' and tournament_id = '${uuid(T.id)}' order by at desc limit 1`)
  check(mark?.actor_platform === true && mark.who === P.id, 'the audit marks it as the Admin de Polo', mark)
  const { error: aSave } = await A.sb.rpc('admin_save_score', { p_round_id: r1.id, p_player_id: p0.id, p_hole: 2, p_strokes: 4, p_putts: 2, p_picked_up: false })
  const [aMark] = await query(`select actor_platform from public.audit_log where table_name = 'scores' and tournament_id = '${uuid(T.id)}' order by at desc limit 1`)
  check(!aSave && aMark?.actor_platform === false, 'the owner\'s own correction is not marked')
  const { data: pAudit } = await P.sb.from('audit_log').select('id').eq('tournament_id', T.id).limit(1)
  check((pAudit ?? []).length === 1, 'the admin reads the tournament\'s audit')
  await A.sb.from('tournaments').update({ tagline: 'cambio' }).eq('id', T.id)
  const [tRow] = await query(`select tournament_id::text as tid from public.audit_log where table_name = 'tournaments' and row_id = '${uuid(T.id)}' order by at desc limit 1`)
  check(tRow?.tid === T.id, 'a change to the tournaments row is logged against its tournament (was null)', tRow)

  console.log('his own lists stay his:')
  const { data: pOrgRows } = await P.sb.from('tournament_organizers').select('tournament_id').eq('auth_user_id', P.id)
  check((pOrgRows ?? []).length === 0, 'Mis torneos (filtered by account) does not fill up with other people\'s tournaments')

  console.log('reading tournaments is not reading people:')
  const { data: pCard } = await P.sb.rpc('profile_card', { p_handle: uProfile.handle })
  check(pCard === null, 'a hidden profile stays hidden from the admin', pCard)
  const { data: pReq } = await P.sb.rpc('friend_request', { p_handle: uProfile.handle })
  check(pReq === 'not_found', 'and he cannot send it a friend request', pReq)
  const { data: aCard } = await A.sb.rpc('profile_card', { p_handle: uProfile.handle })
  check(aCard?.related === true, 'while the tournament\'s own Comité still sees it in full')
  const { data: pProfiles } = await P.sb.from('profiles').select('id')
  check((pProfiles ?? []).every((x) => x.id === P.id), 'profiles: the admin reads only his own row', pProfiles?.length)

  console.log('the panel reads:')
  const { data: ov, error: ovErr } = await P.sb.rpc('platform_overview')
  check(!ovErr && ov.accounts >= 4 && ov.tournaments >= 1 && Array.isArray(ov.recent), 'platform_overview', ovErr?.message)
  const { data: daily } = await P.sb.rpc('platform_daily', { p_days: 14 })
  check(Array.isArray(daily) && daily.length === 14 && daily.at(-1).tournaments >= 1, 'platform_daily: 14 days, today has the new tournament', daily?.at(-1))
  const { data: list } = await P.sb.rpc('platform_tournaments', { p_q: A.email })
  check(list?.total === 1 && list.rows[0].id === T.id && list.rows[0].ownerEmail === A.email, 'platform_tournaments finds it by the organizer\'s email', list)
  const { data: orphans } = await P.sb.rpc('platform_tournaments', { p_kind: 'orphan', p_q: T.slug })
  check(orphans?.total === 0, 'it is not an orphan')
  const { data: one } = await P.sb.rpc('platform_tournament', { p_tournament_id: T.id })
  check(one?.organizers?.[0]?.email === A.email && one.counts.players === 1 && one.rounds.length === 1 && one.audit.length > 0, 'platform_tournament: Comité, counts, rounds, audit', one && { org: one.organizers, counts: one.counts })

  console.log('Protegido:')
  const { error: nProtect } = await N.sb.rpc('set_tournament_protected', { p_tournament_id: T.id, p_on: true })
  const { error: directFlag } = await A.sb.from('tournaments').update({ is_protected: true }).eq('id', T.id)
  check(denied(nProtect) && !!directFlag, 'only the owner or the admin protects, and never by a direct write', { nProtect: nProtect?.message, directFlag: directFlag?.message })
  const { error: aProtect } = await A.sb.rpc('set_tournament_protected', { p_tournament_id: T.id, p_on: true })
  check(!aProtect, 'the owner protects it', aProtect?.message)
  const { data: pmLocked } = await P.sb.rpc('my_membership', { tid: T.id })
  const { error: lockedSave } = await P.sb.rpc('admin_save_score', { p_round_id: r1.id, p_player_id: p0.id, p_hole: 3, p_strokes: 4, p_putts: 2, p_picked_up: false, p_reason: 'x' })
  const { data: lockedRead } = await P.sb.from('tournaments').select('id').eq('id', T.id)
  check(pmLocked?.protected === true && pmLocked.isOrganizer === false && !!lockedSave && lockedRead?.length === 1, 'the admin can read it but not write it', { pmLocked, lockedSave: lockedSave?.message })
  const { data: aDel } = await A.sb.from('tournaments').delete().eq('id', T.id).select('id')
  const { data: stillThere } = await A.sb.from('tournaments').select('id').eq('id', T.id)
  check(stillThere?.length === 1, 'the owner cannot delete a protected tournament', aDel)
  const { error: noReason } = await P.sb.rpc('platform_unlock', { p_tournament_id: T.id, p_reason: '' })
  const { data: until, error: unlockErr } = await P.sb.rpc('platform_unlock', { p_tournament_id: T.id, p_reason: 'Corregir un hoyo que reportaron' })
  check(!!noReason && !unlockErr && new Date(until) > new Date(), 'unlocking needs a reason and gives a deadline', unlockErr?.message)
  const { error: unlockedSave } = await P.sb.rpc('admin_save_score', { p_round_id: r1.id, p_player_id: p0.id, p_hole: 3, p_strokes: 4, p_putts: 2, p_picked_up: false, p_reason: 'Reportado' })
  check(!unlockedSave, 'unlocked, the admin writes', unlockedSave?.message)
  await P.sb.rpc('platform_relock', { p_tournament_id: T.id })
  const { error: relockedSave } = await P.sb.rpc('admin_save_score', { p_round_id: r1.id, p_player_id: p0.id, p_hole: 4, p_strokes: 4, p_putts: 2, p_picked_up: false, p_reason: 'x' })
  check(!!relockedSave, 'relocked, he cannot')
  const logged = await query(`select action from public.platform_audit_log where tournament_id = '${uuid(T.id)}' order by at`)
  check(logged.map((x) => x.action).join(',') === 'unlock,relock', 'unlock and relock are in the platform log', logged)
  const { error: offNoReason } = await A.sb.rpc('set_tournament_protected', { p_tournament_id: T.id, p_on: false })
  const { error: offOk } = await A.sb.rpc('set_tournament_protected', { p_tournament_id: T.id, p_on: false, p_reason: 'Ya terminó' })
  const { data: pmOpen } = await P.sb.rpc('my_membership', { tid: T.id })
  check(!!offNoReason && !offOk && pmOpen?.isOrganizer === true, 'unprotecting needs a reason, and then the admin is Comité again', offOk?.message)
} catch (e) {
  console.error('ERROR', e.message ?? e)
  failures++
} finally {
  console.log('cleaning up…')
  for (const id of created.tournaments) {
    await query(`begin; select set_config('cardi.protect', '1', true); update public.tournaments set is_protected = false where id = '${uuid(id)}'; commit;`)
    await service.from('tournaments').delete().eq('id', id)
  }
  if (created.users.length) await query(`delete from public.platform_audit_log where actor_auth_user_id in (${created.users.map((u) => `'${uuid(u)}'`).join(',')})`)
  for (const id of created.users) await service.auth.admin.deleteUser(id)
  await query(`delete from public.platform_admins where note = 'platform-test'`)
}
console.log(failures === 0 ? '\n✓ the platform admin holds' : `\n✗ ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
