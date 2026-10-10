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
import { readFile, readdir } from 'node:fs/promises'
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
const created = { users: [], tournaments: [], courses: [], crews: [] }
let failures = 0
let flagsTouched = false
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
  return { sb, id: made.user.id, email, password }
}

// Every platform_* RPC with harmless arguments.
const PLATFORM_CALLS = (tid, uid) => [
  ['platform_overview', {}],
  ['platform_daily', { p_days: 7 }],
  ['platform_tournaments', {}],
  ['platform_tournament', { p_tournament_id: tid }],
  ['platform_unlock', { p_tournament_id: tid, p_reason: 'prueba' }],
  ['platform_relock', { p_tournament_id: tid }],
  ['platform_people', {}],
  ['platform_person', { p_user_id: uid }],
  ['platform_delete_preview', { p_user_id: uid }],
  ['platform_block', { p_user_id: uid, p_reason: 'prueba' }],
  ['platform_unblock', { p_user_id: uid, p_reason: 'prueba' }],
  ['platform_delete_account', { p_user_id: uid, p_confirm: 'x', p_reason: 'prueba' }],
  ['platform_reset_pin_lock', { p_user_id: uid, p_reason: 'prueba' }],
  ['platform_set_organizer', { p_tournament_id: tid, p_user_id: uid, p_role: 'owner', p_reason: 'prueba' }],
  ['platform_courses', {}],
  ['platform_course', { p_course_id: tid }],
  ['platform_refresh_course_results', { p_course_id: tid }],
  ['platform_merge_courses', { p_keep: tid, p_drop: uid, p_tee_map: {}, p_reason: 'prueba' }],
  ['platform_delete_course', { p_course_id: tid, p_reason: 'prueba' }],
  ['platform_crews', {}],
  ['platform_crew', { p_crew_id: tid }],
  ['platform_crew_remove_member', { p_crew_id: tid, p_profile_id: uid, p_reason: 'prueba' }],
  ['platform_delete_crew', { p_crew_id: tid, p_confirm: 'x', p_reason: 'prueba' }],
  ['platform_set_flag', { p_key: 'maintenance_banner', p_value: 'x', p_reason: 'prueba' }],
  ['platform_audience', {}],
  ['platform_broadcast', { p_title: 'x', p_body: 'y', p_to: uid }],
  ['platform_audit', {}],
  ['platform_audit_entry', { p_source: 'platform', p_id: 1 }],
  ['platform_health', {}],
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
    const results = await Promise.all(PLATFORM_CALLS(T.id, A.id).map(([fn, args]) => sb.rpc(fn, args)))
    const leaks = PLATFORM_CALLS(T.id, A.id).filter((_, i) => !denied(results[i].error)).map(([fn]) => fn)
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

  console.log('Historial (tournament_audit):')
  const { error: nAudit } = await N.sb.rpc('tournament_audit', { p_tournament_id: T.id })
  const { data: hist, error: histErr } = await A.sb.rpc('tournament_audit', { p_tournament_id: T.id, p_limit: 200 })
  const platformRow = (hist ?? []).find((h) => h.platform && h.table === 'scores')
  check(denied(nAudit) && !histErr && !!platformRow && platformRow.actor === null, "the Comité reads its history, with the admin's changes marked; strangers cannot", { histErr: histErr?.message, n: hist?.length })
  const page2 = await A.sb.rpc('tournament_audit', { p_tournament_id: T.id, p_before: hist?.[1]?.id, p_limit: 1 })
  check(page2.data?.length === 1 && page2.data[0].id < hist[1].id, 'and pages by id')

  console.log('Personas:')
  const { data: found } = await P.sb.rpc('platform_people', { p_q: A.email })
  check(found?.total === 1 && found.rows[0].id === A.id && found.rows[0].tournaments >= 1, 'platform_people finds an account by email', found)
  const { data: devices } = await P.sb.rpc('platform_people', { p_filter: 'devices', p_limit: 200 })
  check(devices?.rows.every((r) => r.anonymous) && devices.rows.some((r) => r.id === anon.user.id), 'the devices filter lists phones without an account')
  const { data: aPerson } = await P.sb.rpc('platform_person', { p_user_id: A.id })
  check(aPerson?.email === A.email && aPerson.tournaments.some((x) => x.tournamentId === T.id && x.role === 'owner') && aPerson.isSelf === false, 'platform_person: account and tournaments with role', aPerson?.tournaments)
  check(!JSON.stringify(aPerson).match(/pin_hash|token_hash|p256dh|"auth"/), 'and nothing secret-shaped in it')
  const { error: selfBlock } = await P.sb.rpc('platform_block', { p_user_id: P.id, p_reason: 'prueba' })
  check(!!selfBlock, 'the admin cannot block himself', selfBlock?.message)

  // Z: an account with a crew, a solo tournament and a PIN-locked phone.
  const Z = await account('z', 'Zoe Borrable')
  await Z.sb.rpc('ensure_my_profile')
  const { data: crew } = await Z.sb.rpc('create_crew', { p_name: `Plat crew ${rand}` })
  await U.sb.rpc('join_crew', { p_code: crew.joinCode })
  const { data: TZ } = await Z.sb.rpc('create_tournament', { p_name: `Plat Z ${rand}`, p_settings: settings })
  created.tournaments.push(TZ.id)

  const { error: noReasonBlock } = await P.sb.rpc('platform_block', { p_user_id: Z.id, p_reason: '' })
  const { error: blockErr } = await P.sb.rpc('platform_block', { p_user_id: Z.id, p_reason: 'Prueba de bloqueo' })
  const zAgain = client()
  const { error: bannedSignIn } = await zAgain.auth.signInWithPassword({ email: Z.email, password: Z.password })
  const { data: blockedList } = await P.sb.rpc('platform_people', { p_filter: 'blocked', p_q: Z.email })
  check(!!noReasonBlock && !blockErr && !!bannedSignIn && blockedList?.total === 1, 'blocking needs a reason, stops sign-in, and lists as blocked', { blockErr: blockErr?.message, bannedSignIn: bannedSignIn?.message })
  const { error: unblockErr } = await P.sb.rpc('platform_unblock', { p_user_id: Z.id, p_reason: 'Ya se aclaró' })
  const { error: backIn } = await zAgain.auth.signInWithPassword({ email: Z.email, password: Z.password })
  check(!unblockErr && !backIn, 'unblocking lets the account back in', { unblockErr: unblockErr?.message, backIn: backIn?.message })

  // A phone locks itself out of a PIN; the admin clears it.
  const { data: pz } = await A.sb.from('players').insert({ tournament_id: T.id, full_name: 'Pin Bloqueado', display_name: 'Pin', sort_order: 1 }).select('id').single()
  await A.sb.rpc('set_player_pin', { p_player_id: pz.id, p_pin: '2468' })
  const phone = client()
  const { data: phoneSession } = await phone.auth.signInAnonymously()
  created.users.push(phoneSession.user.id)
  for (let i = 0; i < 5; i++) await phone.rpc('claim_player', { p_player_id: pz.id, p_pin: '0000' })
  const { data: lockedTry } = await phone.rpc('claim_player', { p_player_id: pz.id, p_pin: '2468' })
  const { data: phonePerson } = await P.sb.rpc('platform_person', { p_user_id: phoneSession.user.id })
  check(lockedTry?.reason === 'locked' && !!phonePerson?.deviceLock?.lockedUntil, 'five wrong PINs lock the phone, and the admin sees it', { lockedTry, lock: phonePerson?.deviceLock })
  await P.sb.rpc('platform_reset_pin_lock', { p_user_id: phoneSession.user.id, p_player_id: pz.id, p_reason: 'Se equivocó de jugador' })
  const { data: afterReset } = await phone.rpc('claim_player', { p_player_id: pz.id, p_pin: '2468' })
  check(afterReset?.ok === true, 'after clearing the lock the right PIN works', afterReset)

  // Delete Z: the crew survives with U as owner, the tournament is left without a Comité.
  const { data: preview } = await P.sb.rpc('platform_delete_preview', { p_user_id: Z.id })
  check(preview?.crewsHanded?.includes(crew.name ?? `Plat crew ${rand}`) && preview.orphaned.some((x) => x.id === TZ.id), 'the preview says which crew is handed over and which tournament is orphaned', preview)
  const { error: wrongEmail } = await P.sb.rpc('platform_delete_account', { p_user_id: Z.id, p_confirm: 'otro@correo.mx', p_reason: 'Prueba' })
  const { error: delErr } = await P.sb.rpc('platform_delete_account', { p_user_id: Z.id, p_confirm: Z.email.toUpperCase(), p_reason: 'Pidió borrar su cuenta' })
  const [crewAfter] = await query(`select c.created_by::text as owner, (select role from public.crew_members m where m.crew_id = c.id and m.profile_id = c.created_by) as role from public.crews c where c.id = '${uuid(crew.id)}'`)
  const { data: goneUser } = await service.auth.admin.getUserById(Z.id)
  check(!!wrongEmail && !delErr && !goneUser?.user && crewAfter?.owner === U.id && crewAfter.role === 'owner', 'deleting needs the exact email; the crew is handed to its member first', { delErr: delErr?.message, crewAfter })
  const { data: orphanList } = await P.sb.rpc('platform_tournaments', { p_kind: 'orphan', p_q: TZ.slug })
  check(orphanList?.total === 1, 'the tournament stays, without a Comité')
  const { error: setOrg } = await P.sb.rpc('platform_set_organizer', { p_tournament_id: TZ.id, p_user_id: A.id, p_role: 'owner', p_reason: 'Se quedó sin Comité' })
  const { data: aOnTZ } = await A.sb.rpc('my_membership', { tid: TZ.id })
  const { error: anonOrg } = await P.sb.rpc('platform_set_organizer', { p_tournament_id: TZ.id, p_user_id: anon.user.id, p_role: 'admin', p_reason: 'Prueba' })
  check(!setOrg && aOnTZ?.role === 'owner' && !!anonOrg, 'the admin gives it a new owner (an account, never a phone)', { setOrg: setOrg?.message, aOnTZ })
  const personLog = await query(`select action from public.platform_audit_log where target_id = '${uuid(Z.id)}' order by at`)
  check(personLog.map((x) => x.action).join(',') === 'block,unblock,delete', 'block, unblock and delete are in the platform log', personLog)
  await query(`delete from public.crews where id = '${uuid(crew.id)}'`)

  console.log('Campos:')
  const card = (pars) => Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: pars?.[i] ?? 4, stroke_index: i + 1 }))
  async function course(name, tees) {
    const { data: c } = await service.from('courses').insert({ name, created_by: A.id }).select('id').single()
    created.courses.push(c.id)
    const ids = []
    for (const [i, t] of tees.entries()) {
      const { data: tee } = await service.from('tees').insert({ course_id: c.id, name: t.name, rating: 72, slope: 113, sort_order: i }).select('id').single()
      await service.from('holes').insert((t.holes ?? card()).map((h) => ({ ...h, tee_id: tee.id })))
      ids.push(tee.id)
    }
    return { id: c.id, tees: ids }
  }
  const K = await course(`Plat Campo ${rand}`, [{ name: 'Azules' }, { name: 'Rojas', holes: card([5]) }])
  const D = await course(`Plat Campo ${rand} Los Cabos`, [{ name: 'Azules' }, { name: 'Blancas' }])
  const X = await course(`Plat Zzz ${rand} sin usar`, [{ name: 'Azules', holes: card().map((h) => ({ ...h, stroke_index: 1 })) }])
  const { data: r2 } = await A.sb.from('rounds').insert({ tournament_id: T.id, number: 2, holes: 18, course_id: D.id }).select('id').single()
  await A.sb.from('round_tees').insert({ round_id: r2.id, player_id: p0.id, tee_id: D.tees[0] })

  const { data: dupes } = await P.sb.rpc('platform_courses', { p_filter: 'dupes', p_q: `plat campo ${rand}` })
  check(dupes?.total === 2 && dupes.rows.every((r) => r.dupes >= 1), '«X» and «X Los Cabos» are flagged as duplicates', dupes)
  const { data: broken } = await P.sb.rpc('platform_courses', { p_filter: 'broken', p_q: `plat zzz ${rand}` })
  check(broken?.total === 1, 'a card whose stroke indexes repeat is flagged as broken')
  const { data: dCourse } = await P.sb.rpc('platform_course', { p_course_id: D.id })
  check(dCourse?.dupes.some((x) => x.id === K.id) && dCourse.usedBy.some((u) => u.tournamentId === T.id) && dCourse.tees[0].inUse === 1, 'platform_course: its duplicate, where it is played, which tee is in use', dCourse && { dupes: dCourse.dupes, usedBy: dCourse.usedBy })

  const { error: unmapped } = await P.sb.rpc('platform_merge_courses', { p_keep: K.id, p_drop: D.id, p_tee_map: {}, p_reason: 'Duplicado' })
  const { error: mismatch } = await P.sb.rpc('platform_merge_courses', { p_keep: K.id, p_drop: D.id, p_tee_map: { [D.tees[0]]: K.tees[1] }, p_reason: 'Duplicado' })
  check(/Falta/.test(unmapped?.message ?? '') && /no coinciden/.test(mismatch?.message ?? ''), 'merging refuses an unmapped tee in use, and a tee whose card scores differently', { unmapped: unmapped?.message, mismatch: mismatch?.message })
  await A.sb.rpc('set_tournament_protected', { p_tournament_id: T.id, p_on: true })
  const { error: protectedMerge } = await P.sb.rpc('platform_merge_courses', { p_keep: K.id, p_drop: D.id, p_tee_map: { [D.tees[0]]: K.tees[0] }, p_reason: 'Duplicado' })
  await A.sb.rpc('set_tournament_protected', { p_tournament_id: T.id, p_on: false, p_reason: 'Fin de la prueba' })
  check(denied(protectedMerge), 'and a course a locked Protegido tournament plays', protectedMerge?.message)
  const { data: merged, error: mergeErr } = await P.sb.rpc('platform_merge_courses', { p_keep: K.id, p_drop: D.id, p_tee_map: { [D.tees[0]]: K.tees[0] }, p_reason: 'Duplicado de Quivira' })
  const [after] = await query(`select (select course_id::text from public.rounds where id = '${uuid(r2.id)}') as course, (select tee_id::text from public.round_tees where round_id = '${uuid(r2.id)}') as tee, (select count(*) from public.courses where id = '${uuid(D.id)}') as dropped`)
  check(!mergeErr && merged?.rounds === 1 && after.course === K.id && after.tee === K.tees[0] && Number(after.dropped) === 0, 'a clean merge moves the round and its tees, and the duplicate is gone', { mergeErr: mergeErr?.message, merged, after })
  const { error: inUseDelete } = await P.sb.rpc('platform_delete_course', { p_course_id: K.id, p_reason: 'Prueba' })
  const { error: unusedDelete } = await P.sb.rpc('platform_delete_course', { p_course_id: X.id, p_reason: 'Tarjeta mal capturada' })
  check(/fusiónalo/.test(inUseDelete?.message ?? '') && !unusedDelete, 'a course in use cannot be deleted; an unused one can', { inUseDelete: inUseDelete?.message, unusedDelete: unusedDelete?.message })
  const { data: refreshed, error: refreshErr } = await P.sb.rpc('platform_refresh_course_results', { p_course_id: K.id })
  check(!refreshErr && refreshed === 0, 'recomputing results runs (no finished rounds here)', refreshErr?.message)

  console.log('Crews:')
  await A.sb.rpc('ensure_my_profile')
  const { data: c1 } = await U.sb.rpc('create_crew', { p_name: `Plat crew ${rand}` })
  created.crews.push(c1.id)
  await A.sb.rpc('join_crew', { p_code: c1.joinCode })
  const { data: crews } = await P.sb.rpc('platform_crews', { p_q: `plat crew ${rand}` })
  const { data: crewDetail } = await P.sb.rpc('platform_crew', { p_crew_id: c1.id })
  check(crews?.total === 1 && crews.rows[0].members === 2 && crewDetail?.members.length === 2 && crewDetail.members[0].profileId === U.id, 'platform_crews / platform_crew list the crew and its members, owner first', crewDetail?.members)
  const { data: handed } = await P.sb.rpc('platform_crew_remove_member', { p_crew_id: c1.id, p_profile_id: U.id, p_reason: 'Lo pidió' })
  const [owner] = await query(`select created_by::text as owner from public.crews where id = '${uuid(c1.id)}'`)
  check(handed === 'handed' && owner?.owner === A.id, 'taking out the owner hands the crew to the next member', { handed, owner })
  const { data: lastOut } = await P.sb.rpc('platform_crew_remove_member', { p_crew_id: c1.id, p_profile_id: A.id, p_reason: 'Lo pidió' })
  const [gone] = await query(`select count(*)::int as n from public.crews where id = '${uuid(c1.id)}'`)
  check(lastOut === 'deleted' && gone.n === 0, 'taking out the last member deletes it')
  const { data: c2 } = await U.sb.rpc('create_crew', { p_name: `Plat crew2 ${rand}` })
  created.crews.push(c2.id)
  await A.sb.rpc('set_tournament_crew', { p_tournament_id: T.id, p_crew_id: null })
  const { error: wrongName } = await P.sb.rpc('platform_delete_crew', { p_crew_id: c2.id, p_confirm: 'otro', p_reason: 'Prueba' })
  const { error: delCrew } = await P.sb.rpc('platform_delete_crew', { p_crew_id: c2.id, p_confirm: `Plat crew2 ${rand}`, p_reason: 'Crew de prueba' })
  check(!!wrongName && !delCrew, 'deleting a crew needs its exact name', { wrongName: wrongName?.message, delCrew: delCrew?.message })
  const catalogLog = await query(`select action from public.platform_audit_log where actor_auth_user_id = '${uuid(P.id)}' and target_kind in ('course', 'crew') order by at`)
  check(catalogLog.map((x) => x.action).join(',') === 'course_merge,course_delete,course_refresh,crew_remove_member,crew_remove_member,crew_delete', 'every catalog action is in the platform log', catalogLog)

  console.log('Switches (restored at the end, whatever happens):')
  flagsTouched = true
  const setFlag = (key, value) => P.sb.rpc('platform_set_flag', { p_key: key, p_value: value, p_reason: 'Prueba automática' })
  const { error: flagNoReason } = await P.sb.rpc('platform_set_flag', { p_key: 'new_tournaments_paused', p_value: true, p_reason: '' })
  const { error: badKey } = await P.sb.rpc('platform_set_flag', { p_key: 'drop_everything', p_value: true, p_reason: 'Prueba' })
  check(!!flagNoReason && !!badKey, 'a switch needs a reason and a known key')
  await setFlag('new_tournaments_paused', true)
  const { error: nPaused } = await N.sb.rpc('create_tournament', { p_name: `Plat paused ${rand}`, p_settings: settings })
  const { data: pT, error: pPaused } = await P.sb.rpc('create_tournament', { p_name: `Plat admin ${rand}`, p_settings: settings })
  if (pT) created.tournaments.push(pT.id)
  await setFlag('new_tournaments_paused', false)
  check(/no está creando torneos/.test(nPaused?.message ?? '') && !pPaused, 'pausing new tournaments stops everyone but the admin', { nPaused: nPaused?.message, pPaused: pPaused?.message })
  await setFlag('new_accounts_paused', true)
  const L = await account('l', 'Lalo Tarde')
  const { error: lPaused } = await L.sb.rpc('ensure_my_profile')
  await setFlag('new_accounts_paused', false)
  const { error: lLater } = await L.sb.rpc('ensure_my_profile')
  check(/no está aceptando cuentas/.test(lPaused?.message ?? '') && !lLater, 'pausing new accounts stops a new profile, and lifting it lets it through', { lPaused: lPaused?.message, lLater: lLater?.message })
  await setFlag('maintenance_banner', 'Prueba de mantenimiento')
  const { data: anonFlags } = await client().rpc('app_flags')
  await setFlag('maintenance_banner', null)
  const { data: clearFlags } = await client().rpc('app_flags')
  check(anonFlags?.maintenanceBanner === 'Prueba de mantenimiento' && clearFlags?.maintenanceBanner === null, 'the banner reaches even a phone with no session, and clears', { anonFlags, clearFlags })
  flagsTouched = false

  console.log('Avisos (never to everyone for real):')
  const { error: longTitle } = await P.sb.rpc('platform_broadcast', { p_title: 'x'.repeat(61), p_body: 'y', p_to: U.id })
  const { error: offsite } = await P.sb.rpc('platform_broadcast', { p_title: 'Hola', p_body: 'y', p_to: U.id, p_url: 'https://example.com' })
  check(!!longTitle && !!offsite, 'a notice has a short title and links only inside Polo')
  const { data: sent, error: sendErr } = await P.sb.rpc('platform_broadcast', { p_title: 'Prueba', p_body: 'Esto es una prueba', p_to: U.id, p_url: '/crews' })
  const { data: inbox } = await U.sb.rpc('my_notifications')
  const got = (inbox ?? []).find((n) => n.kind === 'platform_notice')
  check(!sendErr && sent === 1 && got?.data?.title === 'Prueba' && got.data.url === '/crews', 'a notice to one person lands in their inbox', { sendErr: sendErr?.message, sent, got })
  const { data: audience } = await P.sb.rpc('platform_audience')
  check(audience?.profiles >= 3 && audience.recent.some((r) => r.title === 'Prueba' && r.to === U.id), 'platform_audience counts who a notice reaches and lists recent ones')
  // The daily limit, checked inside a transaction that rolls back: even if it failed, nothing would be sent.
  let limitErr = ''
  try {
    await query(`begin;
      insert into public.platform_audit_log (actor_auth_user_id, action, target_kind, payload) values ('${uuid(P.id)}', 'broadcast', 'notice', '{"to":null}'), ('${uuid(P.id)}', 'broadcast', 'notice', '{"to":null}');
      set local role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${uuid(P.id)}","role":"authenticated"}', true);
      select public.platform_broadcast('Prueba', 'Nunca debe salir', null, null);
      rollback;`)
  } catch (e) {
    limitErr = String(e.message)
  }
  await query('rollback').catch(() => {})
  check(/dos avisos a todos/.test(limitErr), 'a third notice to everyone in a day is refused', limitErr.slice(0, 200))

  console.log('Auditoría and Salud:')
  const { data: feed } = await P.sb.rpc('platform_audit', { p_limit: 200 })
  const flagRow = (feed ?? []).find((x) => x.source === 'platform' && x.action === 'set_flag')
  const comiteRow = (feed ?? []).find((x) => x.source === 'comite' && x.tournamentId === T.id)
  check(!!flagRow && !!comiteRow, 'the audit feed has his platform actions and his changes inside tournaments', { n: feed?.length })
  const { data: onlyComite } = await P.sb.rpc('platform_audit', { p_source: 'comite', p_q: T.name ?? `Plat ${rand}` })
  check((onlyComite ?? []).length > 0 && onlyComite.every((x) => x.source === 'comite'), 'filters by source and search')
  const { data: entry } = await P.sb.rpc('platform_audit_entry', { p_source: 'comite', p_id: comiteRow?.id })
  check(!!entry && ('after' in entry || 'before' in entry) && !JSON.stringify(entry).includes('pin_hash'), 'an entry opens in full, nothing secret in it')
  // The newest file in the repo: production runs every one before this suite does.
  const latestMigration = (await readdir(path.join(root, 'supabase', 'migrations'))).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort().at(-1)
  const { data: run } = await service.from('backup_runs').insert({ ok: true, key: `backups/test-${rand}.json.gz`, bytes: 1234, tables: 3, rows: 99 }).select('id').single()
  const { data: health, error: healthErr } = await P.sb.rpc('platform_health')
  await service.from('backup_runs').delete().eq('id', run.id)
  check(!healthErr && health.backup.last?.key === `backups/test-${rand}.json.gz` && health.push.configured === true && health.database.lastMigration?.name === latestMigration && typeof health.people.blocked === 'number', 'platform_health: last backup (the cron can write it), push configured, last migration', healthErr?.message ?? health)
} catch (e) {
  console.error('ERROR', e.message ?? e)
  failures++
} finally {
  console.log('cleaning up…')
  // Never leave a switch on in production.
  if (flagsTouched) await query(`delete from public.platform_settings where key in ('new_accounts_paused', 'new_tournaments_paused', 'maintenance_banner') and updated_by in (select auth_user_id from public.platform_admins where note = 'platform-test')`)
  for (const id of created.tournaments) {
    await query(`begin; select set_config('cardi.protect', '1', true); update public.tournaments set is_protected = false where id = '${uuid(id)}'; commit;`)
    await service.from('tournaments').delete().eq('id', id)
  }
  if (created.users.length) await query(`delete from public.platform_audit_log where actor_auth_user_id in (${created.users.map((u) => `'${uuid(u)}'`).join(',')}) or target_id in (${created.users.map((u) => `'${uuid(u)}'`).join(',')})`)
  for (const id of created.crews) await service.from('crews').delete().eq('id', id)
  for (const id of created.courses) await service.from('courses').delete().eq('id', id)
  for (const id of created.users) await service.auth.admin.deleteUser(id)
  await query(`delete from public.platform_admins where note = 'platform-test'`)
}
console.log(failures === 0 ? '\n✓ the platform admin holds' : `\n✗ ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
