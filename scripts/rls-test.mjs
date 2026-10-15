#!/usr/bin/env node
// Tenant-isolation test against the live Supabase project (CLAUDE.md §16 M2):
// two organizers, two tournaments, one claimed player device. Proves that a
// device linked to tournament A reads nothing from tournament B, and that
// organizer A cannot see tournament B. Cleans up after itself.
//   node scripts/rls-test.mjs
// Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SECRET_KEY (.env.local).
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadEnv } from './lib/env.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
loadEnv()
const URL_ = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SECRET = process.env.SUPABASE_SECRET_KEY
if (!URL_ || !ANON || !SECRET) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SECRET_KEY')
  process.exit(1)
}

const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })
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
const settings = JSON.parse(await readFile(path.join(root, 'scripts', 'fixtures', 'settings-minimal.json'), 'utf8'))

async function organizer(tag) {
  const sb = client()
  const email = `rls-${tag}-${rand}@cardi-golf.test`
  const password = `Pw-${rand}-${tag}!`
  // Sign-ups confirm by email (mailer_autoconfirm is off), so test accounts are created confirmed by the admin API.
  const { data: made, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: tag } })
  if (error) throw error
  created.users.push(made.user.id)
  const { error: signInErr } = await sb.auth.signInWithPassword({ email, password })
  if (signInErr) throw signInErr
  const { data: t, error: e2 } = await sb.rpc('create_tournament', { p_name: `RLS ${tag} ${rand}`, p_settings: settings })
  if (e2) throw e2
  created.tournaments.push(t.id)
  const { data: p, error: e3 } = await sb.from('players').insert({ tournament_id: t.id, full_name: `Player ${tag}`, display_name: tag, sort_order: 0 }).select('id').single()
  if (e3) throw e3
  const { error: e4 } = await sb.rpc('set_player_pin', { p_player_id: p.id, p_pin: '1234' })
  if (e4) throw e4
  return { sb, tournament: t, player: p }
}

try {
  console.log('creating two organizers with one tournament each…')
  const A = await organizer('a')
  const B = await organizer('b')

  console.log('organizer isolation:')
  const { data: aSees } = await A.sb.from('tournaments').select('id')
  check(aSees.some((x) => x.id === A.tournament.id) && !aSees.some((x) => x.id === B.tournament.id), 'organizer A sees only tournament A')
  const { data: aPlayersB } = await A.sb.from('players').select('id').eq('tournament_id', B.tournament.id)
  check(aPlayersB.length === 0, 'organizer A reads no players of tournament B')
  const { error: aWriteB } = await A.sb.from('players').insert({ tournament_id: B.tournament.id, full_name: 'X', display_name: 'X' })
  check(!!aWriteB, 'organizer A cannot add a player to tournament B')

  console.log('player device (anonymous) isolation:')
  const dev = client()
  const { data: anon, error: anonErr } = await dev.auth.signInAnonymously()
  if (anonErr) throw anonErr
  created.users.push(anon.user.id)
  const { data: before } = await dev.from('players').select('id')
  check(before.length === 0, 'unlinked device reads no players')
  const { data: lookup } = await dev.rpc('lookup_tournament', { p_code: A.tournament.join_code })
  check(lookup && lookup.id === A.tournament.id && lookup.players.length === 1 && lookup.players[0].hasPin === true, 'lookup by join code returns the face grid')
  const { data: wrong } = await dev.rpc('claim_player', { p_player_id: A.player.id, p_pin: '0000' })
  check(wrong.ok === false && wrong.reason === 'wrong_pin' && wrong.attemptsLeft === 4, 'wrong PIN is rejected with attempts left')
  const { data: claim } = await dev.rpc('claim_player', { p_player_id: A.player.id, p_pin: '1234' })
  check(claim.ok === true && claim.tournamentId === A.tournament.id, 'right PIN links the device')
  const { data: devTournaments } = await dev.from('tournaments').select('id')
  check(devTournaments.length === 1 && devTournaments[0].id === A.tournament.id, 'linked device sees only tournament A')
  const { data: devUser } = await dev.auth.getUser()
  const { data: devOrgRows } = await dev.from('tournament_organizers').select('role').eq('tournament_id', A.tournament.id).eq('auth_user_id', devUser.user.id)
  check((devOrgRows?.length ?? 0) === 0, 'a linked player is not an organizer (own-row check)')
  const { data: aOrgRows } = await A.sb.from('tournament_organizers').select('role').eq('tournament_id', A.tournament.id).eq('auth_user_id', (await A.sb.auth.getUser()).data.user.id)
  check(aOrgRows?.length === 1 && aOrgRows[0].role === 'owner', 'the organizer sees its own owner row')
  const { data: devPlayersB } = await dev.from('players').select('id').eq('tournament_id', B.tournament.id)
  check(devPlayersB.length === 0, 'linked device reads no players of tournament B')
  const { data: devPlayersA } = await dev.from('players').select('id, full_name')
  check(devPlayersA.length === 1 && devPlayersA[0].id === A.player.id, 'linked device reads tournament A players')
  const { data: pins, error: pinsErr } = await dev.from('player_pins').select('*')
  check((pins?.length ?? 0) === 0 || !!pinsErr, 'pin hashes are never readable')
  const { error: devWrite } = await dev.from('players').update({ full_name: 'Hacked' }).eq('id', A.player.id)
  const { data: afterWrite } = await A.sb.from('players').select('full_name').eq('id', A.player.id).single()
  check(afterWrite.full_name === 'Player a' || !!devWrite, 'a player cannot edit players')
  const { data: bClaim } = await dev.rpc('claim_player', { p_player_id: B.player.id, p_pin: '1234' })
  check(bClaim.ok === true, 'a device can re-link to another tournament (switch)')
  const { data: afterSwitch } = await dev.from('tournaments').select('id')
  check(afterSwitch.length === 1 && afterSwitch[0].id === B.tournament.id, 'after switching it sees only tournament B')

  console.log('lockout (per device first):')
  await dev.rpc('release_device')
  for (let i = 0; i < 5; i++) await dev.rpc('claim_player', { p_player_id: A.player.id, p_pin: '9999' })
  const { data: locked } = await dev.rpc('claim_player', { p_player_id: A.player.id, p_pin: '1234' })
  check(locked.ok === false && locked.reason === 'locked', 'five failures lock this device for 5 minutes')
  const dev2 = client()
  const { data: anon2, error: anon2Err } = await dev2.auth.signInAnonymously()
  if (anon2Err) throw anon2Err
  created.users.push(anon2.user.id)
  const { data: otherDevice } = await dev2.rpc('claim_player', { p_player_id: A.player.id, p_pin: '1234' })
  check(otherDevice.ok === true, 'another device still claims the player with the right PIN')
  await admin.from('pin_attempts').update({ locked_until: new Date(Date.now() - 1000).toISOString() }).eq('auth_user_id', anon.user.id)
  const { data: afterLock } = await dev.rpc('claim_player', { p_player_id: A.player.id, p_pin: '9999' })
  check(afterLock.ok === false && afterLock.reason === 'wrong_pin' && afterLock.attemptsLeft === 4, 'once the lock passes the counter starts over')
  const { data: unlockedDev } = await dev.rpc('claim_player', { p_player_id: A.player.id, p_pin: '1234' })
  check(unlockedDev.ok === true, 'and the right PIN links the device again')

  console.log('roles and organizers table:')
  const { data: roleA } = await A.sb.rpc('my_tournament_role', { tid: A.tournament.id })
  const { data: roleAB } = await A.sb.rpc('my_tournament_role', { tid: B.tournament.id })
  const { data: roleDev } = await dev.rpc('my_tournament_role', { tid: A.tournament.id })
  check(roleA === 'owner' && roleAB === 'none' && roleDev === 'member', 'my_tournament_role: owner / none / member')
  const { data: orgRows } = await dev.from('tournament_organizers').select('auth_user_id')
  check((orgRows ?? []).length === 0, 'a linked device reads no organizer rows (self-only policy)')
  const { error: selfPromote } = await dev.from('tournament_organizers').insert({ tournament_id: A.tournament.id, auth_user_id: anon.user.id, role: 'admin' })
  check(!!selfPromote, 'a device cannot add itself as organizer')
  const { error: migRead } = await dev.from('_migrations').select('name')
  const { data: migRows } = await dev.from('_migrations').select('name')
  check(!!migRead || (migRows ?? []).length === 0, '_migrations is not readable with the publishable key')
  const noSession = client()
  // 0040 (TRUST-05): the faces a link shows anyone, before any user exists; nothing of the caller's, no join code.
  const { data: lookupNoSession, error: lookupNoSessionErr } = await noSession.rpc('lookup_tournament', { p_code: A.tournament.join_code })
  check(
    !lookupNoSessionErr && lookupNoSession?.id === A.tournament.id && lookupNoSession.joinCode == null && lookupNoSession.players.every((p) => !p.isMe && !p.pendingMe),
    'lookup_tournament without a session shows the faces, with nothing of the caller and no join code',
  )
  const { data: lookupMember } = await dev.rpc('lookup_tournament', { p_code: A.tournament.slug })
  const { data: lookupStranger } = await dev2.rpc('lookup_tournament', { p_code: B.tournament.slug })
  check(lookupMember?.joinCode === A.tournament.join_code && lookupStranger?.joinCode == null, 'the join code is returned to members only')
  check(
    lookupMember?.players?.every((p) => typeof p.fullName === 'string') &&
      lookupStranger?.players?.length > 0 && lookupStranger.players.every((p) => p.fullName == null && p.displayName) &&
      lookupNoSession?.players?.every((p) => p.fullName == null),
    'full names go to members only; the faces before a PIN carry short names (SEC-06, 0056)',
  )
  const { data: newCode, error: rotateErr } = await A.sb.rpc('rotate_join_code', { p_tournament_id: A.tournament.id })
  const { error: rotateB } = await A.sb.rpc('rotate_join_code', { p_tournament_id: B.tournament.id })
  check(!rotateErr && /^[A-Z2-9]{6}$/.test(newCode) && newCode !== A.tournament.join_code && !!rotateB, 'rotate_join_code works for the owner and not across tournaments')

  console.log('settings, key by key (0043, ARCH-13):')
  const { data: before0043 } = await A.sb.from('tournaments').select('settings').eq('id', A.tournament.id).single()
  const s0 = before0043.settings
  const saveSettings = (sb, tid, seen, set) => sb.rpc('update_settings', { p_tournament_id: tid, p_seen: { settings: seen }, p_set: { settings: set } })
  const { data: u1, error: u1Err } = await saveSettings(A.sb, A.tournament.id, { entryFee: s0.entryFee }, { entryFee: s0.entryFee + 100 })
  const { data: u2, error: u2Err } = await saveSettings(A.sb, A.tournament.id, { labels: s0.labels }, { labels: { ...s0.labels, lastPlace: 'La Cuchara' } })
  check(
    !u1Err && !u2Err && u1?.ok === true && u2?.ok === true && u2.now.settings.entryFee === s0.entryFee + 100 && u2.now.settings.labels.lastPlace === 'La Cuchara',
    'update_settings: two saves of different keys, each from the row it saw, both stay',
    { u1Err, u2Err },
  )
  const { data: stale } = await saveSettings(A.sb, A.tournament.id, { entryFee: s0.entryFee }, { entryFee: 1 })
  const { data: afterStale } = await A.sb.from('tournaments').select('settings').eq('id', A.tournament.id).single()
  check(stale?.ok === false && stale.changed?.join() === 'settings.entryFee' && afterStale.settings.entryFee === s0.entryFee + 100, 'a save from a stale entry is refused, names the key and writes nothing')
  const { error: crossSave } = await saveSettings(A.sb, B.tournament.id, { entryFee: null }, { entryFee: 1 })
  const { error: devSave } = await saveSettings(dev, A.tournament.id, { entryFee: s0.entryFee + 100 }, { entryFee: 1 })
  check(crossSave?.code === '42501' && devSave?.code === '42501', 'neither another tournament’s Comité nor a player saves settings', { crossSave, devSave })
  const { data: back } = await saveSettings(A.sb, A.tournament.id, { entryFee: s0.entryFee + 100, labels: u2.now.settings.labels }, { entryFee: s0.entryFee, labels: s0.labels })
  check(back?.ok === true, 'and the settings go back as they were')

  console.log('handicap lock (0046, UX-28):')
  const hcp = async () => (await A.sb.from('players').select('base_hcp, form_guide, handicap_note').eq('id', A.player.id).single()).data
  const h0 = await hcp()
  const { error: lockDev } = await dev.rpc('lock_handicaps', { p_tournament_id: A.tournament.id })
  const { error: lockCross } = await B.sb.rpc('lock_handicaps', { p_tournament_id: A.tournament.id })
  check(lockDev?.code === '42501' && lockCross?.code === '42501', 'only the Comité fixes the handicaps', { lockDev, lockCross })
  const { data: lockedAt, error: lockErr } = await A.sb.rpc('lock_handicaps', { p_tournament_id: A.tournament.id })
  check(!lockErr && typeof lockedAt === 'string', 'the Comité fixes them', { lockErr })
  const { error: directHcp } = await A.sb.from('players').update({ base_hcp: Number(h0.base_hcp) + 3 }).eq('id', A.player.id)
  check(directHcp?.code === '22023' && Number((await hcp()).base_hcp) === Number(h0.base_hcp), 'a fixed handicap changed with no reason is refused, as an older bundle sends it', { directHcp })
  const { error: guideOnly } = await A.sb.from('players').update({ form_guide: 'Viene en racha' }).eq('id', A.player.id)
  check(!guideOnly, 'the rest of the player still saves', { guideOnly })
  const { error: withReason } = await A.sb.rpc('update_player', { p_player_id: A.player.id, p_row: { base_hcp: Number(h0.base_hcp) + 3 }, p_reason: 'Prueba de rls-test' })
  const h1 = await hcp()
  check(!withReason && Number(h1.base_hcp) === Number(h0.base_hcp) + 3 && h1.handicap_note?.changes?.[0]?.reason === 'Prueba de rls-test', 'with the Comité’s reason it changes, and the record says why', { withReason, note: h1.handicap_note })
  const { error: devChange } = await dev.rpc('update_player', { p_player_id: A.player.id, p_row: { base_hcp: 1 }, p_reason: 'Me lo bajo' })
  const { data: devSees } = await dev.from('players').select('handicap_note').eq('id', A.player.id).single()
  check(devChange?.code === '42501' && devSees?.handicap_note?.changes?.length === 1, 'a player reads the record and cannot change it', { devChange })
  const { error: lockForge } = await A.sb.from('tournaments').update({ handicaps_locked_at: null }).eq('id', A.tournament.id)
  check(lockForge?.code === '42501', 'nobody frees them by writing the column', { lockForge })
  const { error: freeErr } = await A.sb.rpc('unlock_handicaps', { p_tournament_id: A.tournament.id, p_reason: 'Fin de la prueba' })
  check(!freeErr && (await hcp()).handicap_note === null, 'freed in setup, with a reason, the record goes', { freeErr })
  await A.sb.from('tournaments').update({ status: 'auction' }).eq('id', A.tournament.id)
  const { data: inAuction } = await A.sb.from('tournaments').select('handicaps_locked_at').eq('id', A.tournament.id).single()
  const { error: freeAuction } = await A.sb.rpc('unlock_handicaps', { p_tournament_id: A.tournament.id, p_reason: 'No se puede' })
  check(inAuction?.handicaps_locked_at != null && freeAuction?.code === '22023', 'opening the auction fixes them by itself, and then nobody frees them', { freeAuction })
  await A.sb.from('tournaments').update({ status: 'setup' }).eq('id', A.tournament.id)
  const { error: freeBack } = await A.sb.rpc('unlock_handicaps', { p_tournament_id: A.tournament.id, p_reason: 'Fin de la prueba' })
  const { error: hcpBack } = await A.sb.from('players').update({ base_hcp: Number(h0.base_hcp), form_guide: h0.form_guide }).eq('id', A.player.id)
  check(!freeBack && !hcpBack, 'and the tournament goes back as it was', { freeBack, hcpBack })

  console.log('rounds, groups, tiebreaks:')
  const mk = async (sb, tid, name, tier) => (await sb.from('players').insert({ tournament_id: tid, full_name: name, display_name: name, tier, sort_order: 1 }).select('id').single()).data.id
  const p2 = await mk(A.sb, A.tournament.id, 'P2', null)
  const p3 = await mk(A.sb, A.tournament.id, 'P3', null)
  const p4 = await mk(A.sb, A.tournament.id, 'P4', null)
  const { data: r1 } = await A.sb.from('rounds').insert({ tournament_id: A.tournament.id, number: 1, holes: 18 }).select('id').single()
  const { error: dupRound } = await A.sb.from('rounds').insert({ tournament_id: A.tournament.id, number: 1, holes: 18 })
  check(dupRound?.code === '23505', 'a duplicate round number is a 23505')
  const { data: g1, error: g1Err } = await A.sb.rpc('upsert_groups', { p_round_id: r1.id, p_groups: [{ number: 1, tee_time: '09:00', start_hole: 1, player_ids: [A.player.id, p2] }, { number: 2, tee_time: '09:10', start_hole: 1, player_ids: [p3, p4] }] })
  check(!g1Err && g1.length === 2, 'upsert_groups creates two groups')
  const gid1 = g1.find((x) => x.number === 1).id
  const gid2 = g1.find((x) => x.number === 2).id
  const { error: foreign } = await A.sb.rpc('upsert_groups', { p_round_id: r1.id, p_groups: [{ number: 1, player_ids: [B.player.id] }] })
  check(!!foreign, 'upsert_groups rejects a player of another tournament')
  const { error: twice } = await A.sb.rpc('upsert_groups', { p_round_id: r1.id, p_groups: [{ number: 1, player_ids: [p2] }, { number: 2, player_ids: [p2] }] })
  check(!!twice, 'upsert_groups rejects a player in two groups')
  const { error: devGroups } = await dev.rpc('upsert_groups', { p_round_id: r1.id, p_groups: [] })
  check(!!devGroups, 'a player cannot call upsert_groups')
  await A.sb.from('rounds').update({ status: 'live' }).eq('id', r1.id)
  const { error: tbErr } = await A.sb.from('snake_tiebreaks').insert({ round_id: r1.id, group_id: gid1, hole: 7, last_holed_player_id: p2 })
  check(!tbErr, 'organizer records a tiebreak answer')
  // Swap numbers and change a tee time: ids and the answer survive.
  const { data: g2 } = await A.sb.rpc('upsert_groups', { p_round_id: r1.id, p_groups: [{ id: gid2, number: 1, tee_time: '09:00', start_hole: 10, player_ids: [p3, p4] }, { id: gid1, number: 2, tee_time: '09:20', start_hole: 1, player_ids: [A.player.id, p2] }] })
  const { data: tbAfter } = await A.sb.from('snake_tiebreaks').select('group_id').eq('round_id', r1.id)
  check(g2.find((x) => x.number === 2).id === gid1 && tbAfter.length === 1 && tbAfter[0].group_id === gid1, 'renumbering keeps ids and the tiebreak answer')
  // Without ids, the same members still match; moving the answered player out voids the answer.
  const { data: g3 } = await A.sb.rpc('upsert_groups', { p_round_id: r1.id, p_groups: [{ number: 1, player_ids: [p3, p4] }, { number: 2, player_ids: [A.player.id, p2] }] })
  check(g3.find((x) => x.number === 2).id === gid1, 'same member set matches the existing group without an id')
  const { data: g4 } = await A.sb.rpc('upsert_groups', { p_round_id: r1.id, p_groups: [{ number: 1, player_ids: [p3, p4, p2] }, { number: 2, player_ids: [A.player.id] }] })
  const { data: tbGone } = await A.sb.from('snake_tiebreaks').select('hole').eq('round_id', r1.id)
  check(g4.find((x) => x.number === 1).id === gid2 && g4.find((x) => x.number === 2).id === gid1, 'moving one player keeps both group ids (majority match)')
  check(tbGone.length === 0, 'an answer naming a player who left the group is dropped')
  await A.sb.rpc('upsert_groups', { p_round_id: r1.id, p_groups: [{ id: gid1, number: 1, tee_time: '09:00', start_hole: 1, player_ids: [A.player.id, p2] }, { id: gid2, number: 2, tee_time: '09:10', start_hole: 1, player_ids: [p3, p4] }] })

  console.log('scores: players write the card, the Comité corrects with a reason:')
  const scoreRow = { round_id: r1.id, player_id: A.player.id, hole: 1, strokes: 5, putts: 2, picked_up: false, entered_by: A.player.id, client_ts: new Date().toISOString() }
  const { error: playerScore } = await dev.from('scores').upsert(scoreRow, { onConflict: 'round_id,player_id,hole' })
  check(!playerScore, 'a player in the group writes a score')
  const { error: playerReason } = await dev.from('scores').update({ reason: 'x' }).eq('round_id', r1.id).eq('player_id', A.player.id).eq('hole', 1)
  const { error: playerFlag } = await dev.from('scores').update({ disputed: true }).eq('round_id', r1.id).eq('player_id', A.player.id).eq('hole', 1)
  check(!!playerReason && !!playerFlag, 'a player cannot write reason or disputed (column grants)')
  const { data: devScore } = await dev.from('scores').select('strokes, disputed, reason').eq('round_id', r1.id).eq('player_id', A.player.id).eq('hole', 1).single()
  check(devScore.strokes === 5 && devScore.disputed === false && devScore.reason === null, 'the row stays as the player wrote it')
  const { error: adminSave } = await A.sb.rpc('admin_save_score', { p_round_id: r1.id, p_player_id: A.player.id, p_hole: 1, p_strokes: 6, p_putts: 3, p_picked_up: false, p_reason: null })
  const { data: afterAdmin } = await A.sb.from('scores').select('strokes, reason, disputed').eq('round_id', r1.id).eq('player_id', A.player.id).eq('hole', 1).single()
  check(!adminSave && afterAdmin.strokes === 6 && afterAdmin.reason === 'Corrección del Comité' && afterAdmin.disputed === false, 'admin_save_score corrects an unsigned card with a default reason')
  const { error: badPutts } = await A.sb.rpc('admin_save_score', { p_round_id: r1.id, p_player_id: A.player.id, p_hole: 2, p_strokes: 4, p_putts: 5, p_picked_up: false })
  check(!!badPutts, 'admin_save_score refuses putts above strokes')
  const { error: devAdmin } = await dev.rpc('admin_save_score', { p_round_id: r1.id, p_player_id: A.player.id, p_hole: 1, p_strokes: 3, p_putts: 1, p_picked_up: false })
  check(!!devAdmin, 'a player cannot call admin_save_score')
  // A second device changes the hole → discrepancy; the Comité resolves it.
  const { data: link2 } = await dev2.rpc('claim_player', { p_player_id: p2, p_pin: '1234' })
  void link2
  await A.sb.rpc('set_player_pin', { p_player_id: p2, p_pin: '1234' })
  const { data: link2b } = await dev2.rpc('claim_player', { p_player_id: p2, p_pin: '1234' })
  check(link2b.ok === true, 'second device links to P2 (same group)')
  const { error: otherDev } = await dev2.from('scores').upsert({ ...scoreRow, strokes: 4, entered_by: p2, client_ts: new Date().toISOString() }, { onConflict: 'round_id,player_id,hole' })
  const { data: disputed } = await A.sb.from('scores').select('strokes, disputed, previous, reason').eq('round_id', r1.id).eq('player_id', A.player.id).eq('hole', 1).single()
  check(!otherDev && disputed.strokes === 4 && disputed.disputed === true && disputed.previous?.strokes === 6 && disputed.reason === null, 'a different device overwriting flags a discrepancy and clears the reason', { otherDev, disputed })
  const { error: restoreErr } = await A.sb.rpc('resolve_score_dispute', { p_round_id: r1.id, p_player_id: A.player.id, p_hole: 1, p_keep: false })
  const { data: restored } = await A.sb.from('scores').select('strokes, disputed, previous').eq('round_id', r1.id).eq('player_id', A.player.id).eq('hole', 1).single()
  check(!restoreErr && restored.strokes === 6 && restored.disputed === false && restored.previous === null, 'resolve_score_dispute(keep=false) restores the previous values')
  // Signature: the rival pair's card, by a member of the group, while live.
  const { data: pairA } = await A.sb.from('pairs').insert({ tournament_id: A.tournament.id, player1_id: A.player.id, player2_id: p2, kind: 'X' }).select('id').single()
  const { data: pairB } = await A.sb.from('pairs').insert({ tournament_id: A.tournament.id, player1_id: p3, player2_id: p4, kind: 'Y' }).select('id').single()
  const { error: ownSign } = await dev.from('card_signatures').insert({ round_id: r1.id, pair_id: pairA.id, signed_by: A.player.id })
  check(!!ownSign, 'a player cannot sign his own pair\'s card')
  const { error: otherGroupSign } = await dev.from('card_signatures').insert({ round_id: r1.id, pair_id: pairB.id, signed_by: A.player.id })
  check(!!otherGroupSign, 'nor a card of a pair not in his group')
  await A.sb.rpc('upsert_groups', { p_round_id: r1.id, p_groups: [{ id: gid1, number: 1, player_ids: [A.player.id, p2, p3, p4] }] })
  const { error: forgedSigner } = await dev.from('card_signatures').insert({ round_id: r1.id, pair_id: pairB.id, signed_by: p2 })
  check(!!forgedSigner, 'signed_by must be the device\'s own player')
  const { error: goodSign } = await dev.from('card_signatures').insert({ round_id: r1.id, pair_id: pairB.id, signed_by: A.player.id })
  check(!goodSign, 'the rival pair\'s card can be signed from the same group')
  const { error: signedEdit } = await A.sb.rpc('admin_save_score', { p_round_id: r1.id, p_player_id: p3, p_hole: 1, p_strokes: 4, p_putts: 2, p_picked_up: false })
  const { error: signedEditOk } = await A.sb.rpc('admin_save_score', { p_round_id: r1.id, p_player_id: p3, p_hole: 1, p_strokes: 4, p_putts: 2, p_picked_up: false, p_reason: 'Se equivocó el anotador' })
  check(!!signedEdit && !signedEditOk, 'a signed card needs a reason (3+ chars) to be corrected')
  const { error: tbForeign } = await dev.from('snake_tiebreaks').upsert({ round_id: r1.id, group_id: gid1, hole: 9, last_holed_player_id: B.player.id, decided_by: A.player.id }, { onConflict: 'round_id,group_id,hole' })
  const { error: tbForged } = await dev.from('snake_tiebreaks').upsert({ round_id: r1.id, group_id: gid1, hole: 9, last_holed_player_id: p2, decided_by: p2 }, { onConflict: 'round_id,group_id,hole' })
  const { error: tbOk } = await dev.from('snake_tiebreaks').upsert({ round_id: r1.id, group_id: gid1, hole: 9, last_holed_player_id: p2, decided_by: A.player.id }, { onConflict: 'round_id,group_id,hole' })
  check(!!tbForeign && !!tbForged && !tbOk, 'a tiebreak answer names a group member and is signed by the device\'s player', { tbForeign: tbForeign?.message, tbForged: tbForged?.message, tbOk: tbOk?.message })
  await A.sb.from('rounds').update({ status: 'finished' }).eq('id', r1.id)
  const { error: lateSign } = await dev.from('card_signatures').insert({ round_id: r1.id, pair_id: pairA.id, signed_by: A.player.id })
  check(!!lateSign, 'no signatures once the round is finished')
  await A.sb.from('rounds').update({ status: 'live' }).eq('id', r1.id)

  console.log('draw, payments:')
  const { error: drawSigned } = await A.sb.rpc('save_draw', { p_tournament_id: A.tournament.id, p_pairs: [{ player1_id: A.player.id, player2_id: p3, kind: 'X' }], p_round1_groups: null, p_go_live: false })
  check(!!drawSigned, 'save_draw refuses once a card is signed')
  await A.sb.from('card_signatures').delete().eq('round_id', r1.id)
  const { error: drawForeign } = await A.sb.rpc('save_draw', { p_tournament_id: A.tournament.id, p_pairs: [{ player1_id: A.player.id, player2_id: B.player.id, kind: 'X' }] })
  check(!!drawForeign, 'save_draw refuses a pair with a foreign player')
  const { data: drawn, error: drawErr } = await A.sb.rpc('save_draw', {
    p_tournament_id: A.tournament.id,
    p_pairs: [{ name: 'Uno', player1_id: A.player.id, player2_id: p3, kind: 'X' }, { player1_id: p2, player2_id: p4, kind: 'Y' }],
    p_round1_groups: [{ number: 1, tee_time: '09:00', start_hole: 1, player_ids: [A.player.id, p3, p2, p4] }],
    p_go_live: true,
  })
  const { data: pairsNow } = await A.sb.from('pairs').select('id').eq('tournament_id', A.tournament.id)
  const { data: groupsNow } = await A.sb.from('groups').select('id').eq('round_id', r1.id)
  check(!drawErr && drawn.pairs === 2 && pairsNow.length === 2 && groupsNow.length === 1, 'save_draw replaces pairs and the round-1 groups in one call')
  const { error: pay1 } = await A.sb.rpc('set_payment_paid', { p_tournament_id: A.tournament.id, p_kind: 'entry', p_from: A.player.id, p_to: null, p_amount: 500, p_paid: true })
  const { error: pay2 } = await A.sb.rpc('set_payment_paid', { p_tournament_id: A.tournament.id, p_kind: 'entry', p_from: A.player.id, p_to: null, p_amount: 500, p_paid: false })
  const { data: payRows } = await A.sb.from('payments').select('paid').eq('tournament_id', A.tournament.id).eq('kind', 'entry')
  check(!pay1 && !pay2 && payRows.length === 1 && payRows[0].paid === false, 'set_payment_paid keeps one row per flow, banker legs included')
  const { error: payDev } = await dev.rpc('set_payment_paid', { p_tournament_id: A.tournament.id, p_kind: 'entry', p_from: A.player.id, p_to: null, p_amount: 500, p_paid: true })
  check(!!payDev, 'a player cannot mark payments')

  console.log('instance games: entrants, hole awards, results, new payment kinds:')
  const { error: entryOk } = await A.sb.from('game_entries').insert({ tournament_id: A.tournament.id, game_id: 'skins-1', player_id: A.player.id })
  check(!entryOk, 'the Comité adds a player to a side pot')
  const { error: entryForeign } = await A.sb.from('game_entries').insert({ tournament_id: A.tournament.id, game_id: 'skins-1', player_id: B.player.id })
  check(!!entryForeign, 'a player of another tournament cannot enter a side pot')
  const { error: entryCross } = await A.sb.from('game_entries').insert({ tournament_id: B.tournament.id, game_id: 'skins-1', player_id: B.player.id })
  check(!!entryCross, 'organizer A cannot write entrants of tournament B')
  await B.sb.from('game_entries').insert({ tournament_id: B.tournament.id, game_id: 'skins-1', player_id: B.player.id })
  const { error: entryDev } = await dev.from('game_entries').insert({ tournament_id: A.tournament.id, game_id: 'skins-1', player_id: p2 })
  check(!!entryDev, 'a player cannot enter people into a pot')
  const { data: devEntries } = await dev.from('game_entries').select('tournament_id')
  check(devEntries.length === 1 && devEntries[0].tournament_id === A.tournament.id, 'a device reads only its own tournament\'s entrants')
  const { error: resultDev } = await dev.from('game_results').insert({ tournament_id: A.tournament.id, game_id: 'bet-1', player_id: A.player.id, share: 1 })
  const { error: resultOk } = await A.sb.from('game_results').insert({ tournament_id: A.tournament.id, game_id: 'bet-1', player_id: p2, share: 1 })
  check(!!resultDev && !resultOk, 'custom-bet results: the Comité writes them, a player cannot')
  const { error: awardOk } = await dev.from('hole_awards').insert({ round_id: r1.id, group_id: gid1, hole: 3, game_id: 'ctp', player_id: p2, decided_by: A.player.id })
  check(!awardOk, 'a player records who won a contest in his group')
  const { error: awardForged } = await dev.from('hole_awards').insert({ round_id: r1.id, group_id: gid1, hole: 4, game_id: 'ctp', player_id: p2, decided_by: p2 })
  check(!!awardForged, 'decided_by must be the device\'s own player')
  const { error: awardStranger } = await dev.from('hole_awards').insert({ round_id: r1.id, group_id: gid1, hole: 5, game_id: 'ctp', player_id: B.player.id, decided_by: A.player.id })
  check(!!awardStranger, 'the winner must be in the group')
  const { data: bAwards } = await B.sb.from('hole_awards').select('hole').eq('round_id', r1.id)
  check((bAwards ?? []).length === 0, 'organizer B reads no hole awards of tournament A')
  // 0044 (ARCH-13): the same writes as one call each, a list of winners reaching the function as uuid[].
  // Each is put back as it was: the restore below counts these rows.
  const groupAwards = (sb, winners) => sb.rpc('save_group_awards', { p_round_id: r1.id, p_group_id: gid1, p_game_id: 'ctp', p_hole: 3, p_player_ids: winners, p_decided_by: A.player.id })
  const { data: groupCall, error: groupCallErr } = await groupAwards(dev, [A.player.id])
  check(!groupCallErr && groupCall?.deleted?.length === 1 && groupCall.deleted[0].player_id === p2 && groupCall.rows?.[0]?.player_id === A.player.id, 'save_group_awards: the group\'s winners replaced in one call, the old one named', { groupCallErr })
  const { error: groupRefused } = await groupAwards(dev, [B.player.id])
  const { data: claimNow } = await A.sb.from('hole_awards').select('player_id').eq('round_id', r1.id).eq('hole', 3).eq('game_id', 'ctp')
  check(groupRefused?.code === '22023' && claimNow?.length === 1 && claimNow[0].player_id === A.player.id, 'a refused winner leaves the group\'s claim as it was', { groupRefused })
  const ruling = (sb, winners) => sb.rpc('set_hole_ruling', { p_round_id: r1.id, p_game_id: 'ctp', p_hole: 3, p_player_ids: winners, p_decided_by: null })
  const { data: ruled, error: ruledErr } = await ruling(A.sb, [p2])
  const { error: ruledDev } = await ruling(dev, null)
  const { data: cleared } = await ruling(A.sb, null)
  check(!ruledErr && ruled?.rows?.[0]?.source === 'comite' && ruledDev?.code === '42501' && cleared?.deleted?.length === 1, 'set_hole_ruling: the Comité rules beside the claim and clears it, a player cannot', { ruledErr, ruledDev })
  const { error: groupBack } = await groupAwards(dev, [p2])
  const { error: resultsErr } = await A.sb.rpc('set_game_results', { p_tournament_id: A.tournament.id, p_game_id: 'bet-1', p_winners: [{ player_id: A.player.id, share: 2 }] })
  const { data: resultsNow } = await A.sb.from('game_results').select('player_id, share').eq('tournament_id', A.tournament.id).eq('game_id', 'bet-1')
  const { error: resultsBack } = await A.sb.rpc('set_game_results', { p_tournament_id: A.tournament.id, p_game_id: 'bet-1', p_winners: [{ player_id: p2, share: 1 }] })
  check(!resultsErr && resultsNow?.length === 1 && resultsNow[0].player_id === A.player.id && Number(resultsNow[0].share) === 2 && !groupBack && !resultsBack, 'set_game_results: a bet\'s result replaced in one call, and both put back', { resultsErr, groupBack, resultsBack })
  const { error: paySide } = await A.sb.rpc('set_payment_paid', { p_tournament_id: A.tournament.id, p_kind: 'side', p_from: A.player.id, p_to: null, p_amount: 200, p_paid: true })
  const { error: payBet } = await A.sb.rpc('set_payment_paid', { p_tournament_id: A.tournament.id, p_kind: 'bet', p_from: A.player.id, p_to: p2, p_amount: 50, p_paid: true })
  check(!paySide && !payBet, 'side-pot buy-ins and direct bets can be marked paid')

  console.log('restore:')
  const fullTables = {}
  for (const t of ['tournaments', 'players', 'rounds', 'pairs', 'calcutta_lots', 'payments']) fullTables[t] = (await A.sb.from(t).select('*').eq(t === 'tournaments' ? 'id' : 'tournament_id', A.tournament.id)).data
  for (const t of ['groups', 'round_tees', 'scores', 'snake_tiebreaks', 'card_signatures', 'handicap_overrides']) fullTables[t] = (await A.sb.from(t).select('*').eq('round_id', r1.id)).data
  fullTables.group_members = (await A.sb.from('group_members').select('*').in('group_id', fullTables.groups.map((g) => g.id))).data
  fullTables.game_entries = (await A.sb.from('game_entries').select('*').eq('tournament_id', A.tournament.id)).data
  fullTables.game_results = (await A.sb.from('game_results').select('*').eq('tournament_id', A.tournament.id)).data
  fullTables.hole_awards = (await A.sb.from('hole_awards').select('*').eq('round_id', r1.id)).data
  fullTables.calcutta_bids = []
  fullTables.calcutta_buybacks = []
  const backup = { version: 1, exportedAt: new Date().toISOString(), tournamentId: A.tournament.id, slug: A.tournament.slug, tables: fullTables }
  const { error: wrongT } = await A.sb.rpc('restore_tournament', { p_tournament_id: B.tournament.id, p_backup: backup })
  check(!!wrongT, 'restore refuses a backup of another tournament')
  const broken = { ...backup, tables: { ...fullTables, scores: [{ ...fullTables.scores[0], player_id: B.player.id }] } }
  const { error: brokenErr } = await A.sb.rpc('restore_tournament', { p_tournament_id: A.tournament.id, p_backup: broken })
  const { data: stillThere } = await A.sb.from('scores').select('id').eq('round_id', r1.id)
  check(!!brokenErr && stillThere.length === fullTables.scores.length, 'an inconsistent backup is refused before anything is deleted')
  await A.sb.rpc('admin_save_score', { p_round_id: r1.id, p_player_id: p4, p_hole: 18, p_strokes: 7, p_putts: 2, p_picked_up: false })
  const { data: counts, error: restoreOk } = await A.sb.rpc('restore_tournament', { p_tournament_id: A.tournament.id, p_backup: backup })
  const { data: afterRestore } = await A.sb.from('scores').select('id').eq('round_id', r1.id)
  const { data: pAfter } = await A.sb.from('players').select('id').eq('tournament_id', A.tournament.id)
  const { data: devStill } = await dev.from('device_sessions').select('player_id')
  check(!restoreOk && counts?.scores === fullTables.scores.length && afterRestore.length === fullTables.scores.length && pAfter.length === 4 && devStill.length === 1, 'a good backup restores exactly, keeping player ids and device links', { restoreOk, counts, after: afterRestore.length, expected: fullTables.scores.length, players: pAfter.length, dev: devStill.length })
  const { data: geAfter } = await A.sb.from('game_entries').select('player_id').eq('tournament_id', A.tournament.id)
  const { data: haAfter } = await A.sb.from('hole_awards').select('hole').eq('round_id', r1.id)
  const { data: grAfter } = await A.sb.from('game_results').select('player_id').eq('tournament_id', A.tournament.id)
  check(geAfter.length === 1 && haAfter.length === 1 && grAfter.length === 1, 'restore brings back entrants, hole awards and results')
  const { error: devRestore } = await dev.rpc('restore_tournament', { p_tournament_id: A.tournament.id, p_backup: backup })
  check(!!devRestore, 'a player cannot restore')

  console.log('the Calcutta, one call each (0045, ARCH-13):')
  const { data: drawnLots, error: lotsErr } = await A.sb.rpc('create_lots', { p_tournament_id: A.tournament.id, p_player_ids: [p2, A.player.id] })
  check(!lotsErr && drawnLots?.length === 2 && drawnLots[0].player_id === p2 && drawnLots[0].lot_number === 1, 'create_lots: one lot per player in the order drawn', { lotsErr })
  const { error: lotsForeign } = await A.sb.rpc('create_lots', { p_tournament_id: A.tournament.id, p_player_ids: [B.player.id] })
  const { data: lotsStill } = await A.sb.from('calcutta_lots').select('id').eq('tournament_id', A.tournament.id)
  check(lotsForeign?.code === '22023' && lotsStill?.length === 2, 'a draw naming another tournament\'s player is refused, and the lots stand', { lotsForeign })
  const soldLot = drawnLots[0]
  // The Calcutta's money rules on the server (0048, MONEY-19): bids only on the open lot, up in the increment from
  // the bid standing ($250 over the opening $250), by the tournament's players; the hammer sells at the top bid to its bidder.
  const bidOn = (bidder, amount) => A.sb.from('calcutta_bids').insert({ lot_id: soldLot.id, bidder_id: bidder, amount }).select('id')
  const hammer = (owner, price) => A.sb.from('calcutta_lots').update({ status: 'sold', owner_id: owner, price, sold_at: new Date().toISOString() }).eq('id', soldLot.id).select('id')
  const { error: pendingBid } = await bidOn(A.player.id, 500)
  const { error: pendingSale } = await hammer(A.player.id, 250)
  await A.sb.from('calcutta_lots').update({ status: 'open' }).eq('id', soldLot.id).select('id')
  const { error: offStep } = await bidOn(A.player.id, 620)
  const { error: foreignBidder } = await bidOn(B.player.id, 500)
  const { error: onStep } = await bidOn(A.player.id, 500)
  check(pendingBid?.code === '22023' && pendingSale?.code === '22023' && offStep?.code === '22023' && /\$500 o \$750/.test(offStep?.message ?? '') && foreignBidder?.code === '22023' && !onStep, 'the Calcutta (0048): bids only on the open lot, up in the increment, by the tournament\'s players', { pendingBid, pendingSale, offStep, foreignBidder, onStep })
  const { error: staleSale } = await hammer(A.player.id, 250)
  const { error: sale } = await hammer(A.player.id, 500)
  const { error: saleChanged } = await A.sb.from('calcutta_lots').update({ price: 1370 }).eq('id', soldLot.id).select('id')
  check(staleSale?.code === '22023' && !sale && saleChanged?.code === '22023', 'the hammer sells at the bid standing, and a sale is never changed after (0048)', { staleSale, sale, saleChanged })
  await A.sb.from('calcutta_buybacks').insert({ lot_id: soldLot.id, pct: 50, amount: 250 })
  const { error: reopenDev } = await dev.rpc('reopen_lot', { p_lot_id: soldLot.id })
  const { data: lotReopened, error: reopenErr } = await A.sb.rpc('reopen_lot', { p_lot_id: soldLot.id })
  const { data: buybackLeft } = await A.sb.from('calcutta_buybacks').select('lot_id').eq('lot_id', soldLot.id)
  check(reopenDev?.code === '42501' && !reopenErr && lotReopened?.status === 'open' && lotReopened.owner_id === null && (buybackLeft ?? []).length === 0, 'reopen_lot: the sale undone with its buyback, by the Comité only', { reopenDev, reopenErr })
  await A.sb.from('calcutta_lots').delete().eq('tournament_id', A.tournament.id)

  console.log('accounts:')
  // An anonymous session that sets an email must verify it (mailer_autoconfirm off): it stays anonymous until then.
  const probe = client()
  const { data: probeSession } = await probe.auth.signInAnonymously()
  created.users.push(probeSession.user.id)
  await probe.auth.updateUser({ email: `delivered+rls-${rand}@resend.dev` })
  const { data: probeUser } = await admin.auth.admin.getUserById(probeSession.user.id)
  check(probeUser.user.is_anonymous === true && !probeUser.user.email_confirmed_at, 'an anonymous email change waits for the code (no instant account)', { anonymous: probeUser.user.is_anonymous, confirmed: !!probeUser.user.email_confirmed_at })
  // A sign-up confirms with the six-digit code from the email (generateLink returns it without sending).
  const signupEmail = `rls-signup-${rand}@example.com`
  const { data: gen, error: genErr } = await admin.auth.admin.generateLink({ type: 'signup', email: signupEmail, password: `rls-${rand}-password` })
  if (gen?.user?.id) created.users.push(gen.user.id)
  const otp = gen?.properties?.email_otp ?? ''
  const { data: verified, error: verifyErr } = await client().auth.verifyOtp({ email: signupEmail, token: otp, type: 'signup' })
  check(!genErr && /^\d{6}$/.test(otp) && !verifyErr && !!verified.session && !!verified.user?.email_confirmed_at, 'a sign-up confirms with the six-digit code', { genErr: genErr?.message, otpLength: otp.length, verifyErr: verifyErr?.message })

  console.log('courses:')
  await A.sb.from('players').update({ is_admin: true }).eq('id', A.player.id)
  const { data: devCourse, error: devCourseErr } = await dev.from('courses').insert({ name: `RLS course ${rand}` }).select('id, created_by').single()
  check(!devCourseErr && devCourse.created_by === anon.user.id, 'an admin player creates a course (created_by defaults to him)')
  const { error: devUpload } = await dev.storage.from('tournament-assets').upload(`courses/${devCourse.id}/rls-${rand}.png`, new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), { contentType: 'image/png' })
  check(!devUpload, 'and uploads a scorecard under courses/')
  // Without a session nobody may overwrite or delete scorecards (0012 closed this).
  const nobody = client()
  const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 1])], { type: 'image/png' })
  await nobody.storage.from('tournament-assets').update(`courses/${devCourse.id}/rls-${rand}.png`, png(), { contentType: 'image/png' })
  await nobody.storage.from('tournament-assets').remove([`courses/${devCourse.id}/rls-${rand}.png`])
  const { data: listed } = await admin.storage.from('tournament-assets').list(`courses/${devCourse.id}`)
  const kept = (listed ?? []).find((o) => o.name === `rls-${rand}.png`)
  check(!!kept && kept.metadata?.size === 4, 'no session: a scorecard cannot be overwritten or deleted')
  const { error: oddFolder } = await dev.storage.from('tournament-assets').upload(`zzz-${rand}/x.png`, png(), { contentType: 'image/png' })
  check(!!oddFolder && !/invalid input syntax/i.test(oddFolder.message), 'an upload outside a tournament folder is refused cleanly', oddFolder?.message)
  await admin.storage.from('tournament-assets').remove([`courses/${devCourse.id}/rls-${rand}.png`])
  const { error: strangerCourse } = await dev2.from('courses').insert({ name: 'nope' })
  check(!!strangerCourse, 'a plain player cannot create a course')
  const { error: notMine } = await A.sb.rpc('delete_course', { p_course_id: devCourse.id })
  check(!!notMine, 'delete_course refuses a course someone else created')
  await A.sb.from('rounds').update({ course_id: devCourse.id }).eq('id', r1.id)
  const { error: inUse } = await dev.rpc('delete_course', { p_course_id: devCourse.id })
  check(!!inUse, 'delete_course refuses a course a round uses')
  const { data: tee } = await dev.from('tees').insert({ course_id: devCourse.id, name: 'Azules' }).select('id').single()
  await A.sb.from('round_tees').insert({ round_id: r1.id, player_id: p2, tee_id: tee.id })
  const { error: teeGuard } = await dev.from('tees').delete().eq('id', tee.id)
  check(!!teeGuard, 'a tee someone plays in a round cannot be deleted')
  await A.sb.from('round_tees').delete().eq('tee_id', tee.id)
  await A.sb.from('rounds').update({ course_id: null }).eq('id', r1.id)
  const { error: delOk } = await dev.rpc('delete_course', { p_course_id: devCourse.id })
  check(!delOk, 'the creator deletes an unused course')
  // 0045 (ARCH-13): a course's card in one call, all of it or none of it.
  const teeCard = (firstPar) => Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: i === 0 ? firstPar : 4, stroke_index: i + 1, yards: 350 }))
  const { data: cardId, error: cardErr } = await A.sb.rpc('save_course', { p: { name: `RLS card ${rand}`, tees: [{ name: 'Azules', color: 'blue', rating: 72.1, slope: 131, holes: teeCard(4) }] } })
  const { data: cardTees } = await A.sb.from('tees').select('id, name, par_total').eq('course_id', cardId)
  const { data: cardHoles } = await A.sb.from('holes').select('number').eq('tee_id', cardTees?.[0]?.id)
  check(!cardErr && cardTees?.length === 1 && cardTees[0].par_total === 72 && cardHoles?.length === 18, 'save_course: a new card in one call, its tee and 18 holes', { cardErr })
  const { error: halfErr } = await A.sb.rpc('save_course', { p: { id: cardId, name: `RLS card ${rand}`, tees: [{ id: cardTees[0].id, name: 'Azul', holes: teeCard(5) }, { name: 'Mal capturado', holes: teeCard(9) }] } })
  const { data: afterHalf } = await A.sb.from('tees').select('name, par_total').eq('course_id', cardId)
  check(!!halfErr && afterHalf?.length === 1 && afterHalf[0].name === 'Azules' && afterHalf[0].par_total === 72, 'a card that fails on its second tee leaves the first as it was', { halfErr })
  const { error: outsiderCard } = await B.sb.rpc('save_course', { p: { id: cardId, name: 'Mío', tees: [] } })
  check(outsiderCard?.code === '42501', 'save_course: a Comité whose tournament doesn\'t play the course cannot edit it', { outsiderCard })
  await A.sb.rpc('delete_course', { p_course_id: cardId })

  console.log('identity: profiles, links, one account in two tournaments:')
  // A person with an account (U), a stranger (S) and a late account (W).
  async function account(tag, name) {
    const sb = client()
    const email = `rls-${tag}-${rand}@cardi-golf.test`
    const password = `Pw-${rand}-${tag}!`
    const { data: made, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } })
    if (error) throw error
    created.users.push(made.user.id)
    const { error: signInErr } = await sb.auth.signInWithPassword({ email, password })
    if (signInErr) throw signInErr
    return { sb, id: made.user.id }
  }
  const U = await account('u', 'Uriel Prueba')
  const S = await account('s', 'Sofía Extraña')
  const { data: uProfile, error: uProfileErr } = await U.sb.rpc('ensure_my_profile')
  check(!uProfileErr && /^uriel\.prueba\d*$/.test(uProfile?.handle ?? ''), 'an account gets a profile with a handle from its name', { uProfileErr: uProfileErr?.message, handle: uProfile?.handle })
  const { data: sProfile } = await S.sb.rpc('ensure_my_profile')
  const { error: anonProfile } = await dev2.rpc('ensure_my_profile')
  check(!!anonProfile, 'an anonymous device has no profile')
  // TRUST-08 (0058): a new profile starts out of search; U and S turn it on, as the toggle in Editar perfil does.
  const { data: uFresh } = await U.sb.from('profiles').select('discoverable').eq('id', U.id).single()
  check(uFresh?.discoverable === false, 'a new profile starts out of search (TRUST-08, 0058)', uFresh)
  await S.sb.from('profiles').update({ discoverable: true }).eq('id', S.id)
  const { error: bioErr } = await U.sb.from('profiles').update({ bio: 'Pego derecho', home_club: 'Club RLS', discoverable: true }).eq('id', U.id)
  const { error: indexErr } = await U.sb.from('profiles').update({ polo_index: 1.2 }).eq('id', U.id)
  check(!bioErr && !!indexErr, 'the owner edits the profile but not the computed index', { bioErr: bioErr?.message })
  const { data: sReadsU } = await S.sb.from('profiles').select('id').eq('id', U.id)
  check((sReadsU ?? []).length === 0, 'profiles are not readable from the table by others')

  // Two tournaments by two organizers, one live round each, U's player in a group with a mate.
  async function smallTournament(owner, tag) {
    const { data: t, error } = await owner.sb.rpc('create_tournament', { p_name: `RLS ${tag} ${rand}`, p_settings: settings })
    if (error) throw error
    created.tournaments.push(t.id)
    const { data: inserted, error: psErr } = await owner.sb.from('players').insert([0, 1].map((i) => ({ tournament_id: t.id, full_name: `${tag} ${i}`, display_name: `${tag}${i}`, sort_order: i }))).select('id, sort_order')
    if (psErr) throw psErr
    const ps = inserted.sort((a, b) => a.sort_order - b.sort_order)
    const { data: round } = await owner.sb.from('rounds').insert({ tournament_id: t.id, number: 1, holes: 18 }).select('id').single()
    await owner.sb.rpc('upsert_groups', { p_round_id: round.id, p_groups: [{ number: 1, tee_time: '09:00', start_hole: 1, player_ids: ps.map((p) => p.id) }] })
    await owner.sb.from('rounds').update({ status: 'live' }).eq('id', round.id)
    await owner.sb.rpc('set_player_pin', { p_player_id: ps[1].id, p_pin: '4321' })
    return { t, round, p0: ps[0].id, p1: ps[1].id }
  }
  const C = await smallTournament(A, 'c')
  const D = await smallTournament(B, 'd')

  const { error: forgeUpdate } = await A.sb.from('players').update({ profile_id: U.id, profile_status: 'confirmed' }).eq('id', C.p0)
  const { error: forgeInsert } = await A.sb.from('players').insert({ tournament_id: C.t.id, full_name: 'Forged', display_name: 'Forged', profile_id: U.id, profile_status: 'confirmed' })
  check(!!forgeUpdate && !!forgeInsert, 'an organizer cannot write a profile link straight into players')
  const { data: proposed } = await A.sb.rpc('comite_link_profile', { p_player_id: C.p0, p_handle: uProfile.handle })
  check(proposed?.ok === true && proposed.status === 'pending', 'the Comité proposes a profile for a player (pending)', proposed)
  const { data: pendingMembership } = await U.sb.rpc('my_membership', { tid: C.t.id })
  const { data: pendingReads } = await U.sb.from('players').select('id').eq('tournament_id', C.t.id)
  check(pendingMembership?.playerId === null && (pendingReads ?? []).length === 0, 'a pending link grants nothing yet', pendingMembership)
  const { data: uLookup } = await U.sb.rpc('lookup_tournament', { p_code: C.t.join_code })
  check(uLookup?.players.find((p) => p.id === C.p0)?.pendingMe === true && uLookup.players.every((p) => p.isMe === false), 'the face grid shows "¿Eres tú?" to that account')
  const { data: notYours } = await U.sb.rpc('link_my_profile', { p_player_id: C.p1 })
  check(notYours?.ok === false && notYours.reason === 'not_yours', 'an account cannot claim a player it has no PIN or proposal for')
  const { data: confirmC } = await U.sb.rpc('link_my_profile', { p_player_id: C.p0 })
  const { data: memberC } = await U.sb.rpc('my_membership', { tid: C.t.id })
  check(confirmC?.ok === true && memberC?.playerId === C.p0 && memberC.via === 'profile' && memberC.role === 'member', '"Soy yo" confirms the link and makes the account a member', { confirmC, memberC })
  await B.sb.rpc('comite_link_profile', { p_player_id: D.p0, p_handle: uProfile.handle })
  const { data: confirmD } = await U.sb.rpc('link_my_profile', { p_player_id: D.p0 })
  const { data: memberD } = await U.sb.rpc('my_membership', { tid: D.t.id })
  const { data: memberCAgain } = await U.sb.rpc('my_membership', { tid: C.t.id })
  check(confirmD?.ok === true && memberD?.playerId === D.p0 && memberCAgain?.playerId === C.p0, 'one account is a player in two tournaments at once')
  const score = (round, player) => ({ round_id: round.id, player_id: player, hole: 1, strokes: 5, putts: 2, picked_up: false, client_ts: new Date().toISOString() })
  const { error: scoreC } = await U.sb.from('scores').upsert({ ...score(C.round, C.p1), entered_by: C.p0 }, { onConflict: 'round_id,player_id,hole' })
  const { error: scoreD } = await U.sb.from('scores').upsert({ ...score(D.round, D.p1), entered_by: D.p0 }, { onConflict: 'round_id,player_id,hole' })
  check(!scoreC && !scoreD, 'and writes its group’s card in both live rounds', { scoreC: scoreC?.message, scoreD: scoreD?.message })
  const { data: uTournaments } = await U.sb.from('tournaments').select('id')
  check(uTournaments.length === 2 && [C.t.id, D.t.id].every((id) => uTournaments.some((x) => x.id === id)), 'and reads exactly those two tournaments')
  const { data: claimOther } = await U.sb.rpc('claim_player', { p_player_id: C.p1, p_pin: '4321' })
  check(claimOther?.ok === false && claimOther.reason === 'already_linked' && claimOther.playerId === C.p0, 'a PIN claim as another player of the same tournament is refused (already_linked)', claimOther)
  const { data: links } = await U.sb.rpc('my_links')
  check(Array.isArray(links) && links.length === 2 && links.every((l) => l.linkStatus === 'confirmed'), 'my_links lists both tournaments')

  console.log('identity: profile privacy:')
  const { data: strangerCard } = await S.sb.rpc('profile_card', { p_handle: uProfile.handle })
  check(strangerCard?.handle === uProfile.handle && strangerCard.related === false && strangerCard.bio === null && strangerCard.homeClub === 'Club RLS', 'a stranger with an account sees the card only (no bio)', strangerCard)
  const { data: mateCard } = await A.sb.rpc('profile_card', { p_handle: uProfile.handle })
  check(mateCard?.related === true && mateCard.bio === 'Pego derecho', 'the Comité of a shared tournament sees the full profile')
  const lurker = client()
  const { data: lurkerSession } = await lurker.auth.signInAnonymously()
  created.users.push(lurkerSession.user.id)
  const { data: lurkerCard } = await lurker.rpc('profile_card', { p_handle: uProfile.handle })
  const { data: lurkerSearch } = await lurker.rpc('search_profiles', { q: 'uriel' })
  check(lurkerCard === null && Array.isArray(lurkerSearch) && lurkerSearch.length === 0, 'an unrelated anonymous device sees no profile and cannot search')
  const { data: found } = await S.sb.rpc('search_profiles', { q: 'Uriel' })
  const { data: tooShort } = await S.sb.rpc('search_profiles', { q: 'Ur' })
  check((found ?? []).some((x) => x.handle === uProfile.handle && x.homeClub == null) && !(tooShort ?? []).some((x) => x.handle === uProfile.handle),
    'an account finds a discoverable stranger from three letters, with no club in the result (TRUST-08)')
  await U.sb.from('profiles').update({ discoverable: false }).eq('id', U.id)
  const { data: hiddenCard } = await S.sb.rpc('profile_card', { p_handle: uProfile.handle })
  const { data: hiddenSearch } = await S.sb.rpc('search_profiles', { q: 'uriel' })
  const { data: stillMate } = await A.sb.rpc('profile_card', { p_handle: uProfile.handle })
  check(hiddenCard === null && !(hiddenSearch ?? []).some((x) => x.handle === uProfile.handle) && stillMate?.related === true, 'a hidden profile disappears for strangers but not for tournament mates')
  const { data: proposeHidden } = await A.sb.rpc('comite_link_profile', { p_player_id: C.p1, p_handle: sProfile.handle })
  check(proposeHidden?.ok === true, 'the Comité can propose a discoverable stranger')
  await A.sb.rpc('comite_unlink_profile', { p_player_id: C.p1 })
  const { data: tpComite } = await A.sb.rpc('tournament_profiles', { tid: C.t.id })
  check((tpComite ?? []).length === 1 && tpComite[0].playerId === C.p0 && tpComite[0].handle === uProfile.handle, 'tournament_profiles maps players to handles for members')

  console.log('identity: link tokens (existing account signs in on a claimed device):')
  const phone = client()
  const { data: phoneSession } = await phone.auth.signInAnonymously()
  created.users.push(phoneSession.user.id)
  const { data: phoneClaim } = await phone.rpc('claim_player', { p_player_id: C.p1, p_pin: '4321' })
  const { data: token, error: tokenErr } = await phone.rpc('create_link_token')
  check(phoneClaim?.ok === true && !tokenErr && typeof token === 'string' && token.length === 48, 'a claimed device mints a one-use token')
  const W = await account('w', 'Walter Tarde')
  const { data: redeemed } = await W.sb.rpc('redeem_link_token', { p_token: token })
  const { data: memberW } = await W.sb.rpc('my_membership', { tid: C.t.id })
  check(redeemed?.ok === true && redeemed.playerId === C.p1 && memberW?.playerId === C.p1, 'the account that signs in redeems it and becomes that player', { redeemed, memberW })
  const { data: again } = await S.sb.rpc('redeem_link_token', { p_token: token })
  check(again?.ok === false && again.reason === 'expired', 'a token works once')
  const { data: token2 } = await phone.rpc('create_link_token')
  await admin.from('profile_link_tokens').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('created_by', phoneSession.user.id).is('used_at', null)
  const { data: late } = await S.sb.rpc('redeem_link_token', { p_token: token2 })
  check(late?.ok === false && late.reason === 'expired', 'an expired token is refused')
  const { error: anonRedeem } = await lurker.rpc('redeem_link_token', { p_token: 'x' })
  check(!!anonRedeem, 'an anonymous session cannot redeem')
  const { data: noMe } = await W.sb.rpc('unlink_my_profile', { p_player_id: C.p1 })
  const { data: memberWAfter } = await W.sb.rpc('my_membership', { tid: C.t.id })
  check(noMe === true && memberWAfter?.playerId === null, '"No soy yo" drops the link and the access with it')

  console.log('identity: duplicate, restore, storage:')
  const { data: copy, error: copyErr } = await A.sb.rpc('duplicate_tournament', { p_source_id: C.t.id, p_name: `RLS c copy ${rand}` })
  if (copy?.id) created.tournaments.push(copy.id)
  const { data: copyPlayers } = await A.sb.from('players').select('display_name, profile_id, profile_status').eq('tournament_id', copy?.id ?? '00000000-0000-0000-0000-000000000000')
  const copied = (copyPlayers ?? []).find((p) => p.display_name === 'c0')
  const { data: memberCopy } = await U.sb.rpc('my_membership', { tid: copy?.id })
  check(!copyErr && copied?.profile_id === U.id && copied.profile_status === 'pending' && memberCopy?.playerId === null, 'Duplicar torneo carries links as pending', { copyErr: copyErr?.message, copied })
  const cTables = {}
  for (const t of ['players', 'rounds']) cTables[t] = (await A.sb.from(t).select('*').eq('tournament_id', C.t.id)).data
  cTables.tournaments = (await A.sb.from('tournaments').select('*').eq('id', C.t.id)).data
  cTables.players = cTables.players.map((p) => (p.id === C.p1 ? { ...p, profile_id: S.id, profile_status: 'confirmed' } : p))
  const { error: cRestoreErr } = await A.sb.rpc('restore_tournament', { p_tournament_id: C.t.id, p_backup: { version: 1, exportedAt: new Date().toISOString(), tournamentId: C.t.id, slug: C.t.slug, tables: cTables } })
  const { data: afterForge } = await A.sb.from('players').select('id, profile_id, profile_status').eq('tournament_id', C.t.id).order('sort_order')
  check(!cRestoreErr && afterForge[1]?.profile_id === null && afterForge[0]?.profile_id === U.id && afterForge[0].profile_status === 'confirmed', 'restore ignores links in the backup and keeps the real ones', { cRestoreErr: cRestoreErr?.message, afterForge })
  const avatar = `profiles/${U.id}/avatar-${rand}.png`
  const { error: ownAvatar } = await U.sb.storage.from('tournament-assets').upload(avatar, png(), { contentType: 'image/png' })
  const { error: otherAvatar } = await U.sb.storage.from('tournament-assets').upload(`profiles/${S.id}/x-${rand}.png`, png(), { contentType: 'image/png' })
  const { error: anonAvatar } = await lurker.storage.from('tournament-assets').upload(`profiles/${lurkerSession.user.id}/x-${rand}.png`, png(), { contentType: 'image/png' })
  check(!ownAvatar && !!otherAvatar && !!anonAvatar, 'an account writes only its own profiles/ folder', { ownAvatar: ownAvatar?.message })
  // The app's uploads all upsert, which needs the read on the row it writes (0061): a new file and the same one again.
  const { error: upsertNew } = await U.sb.storage.from('tournament-assets').upload(`profiles/${U.id}/upsert-${rand}.png`, png(), { contentType: 'image/png', upsert: true })
  const { error: upsertAgain } = await U.sb.storage.from('tournament-assets').upload(`profiles/${U.id}/upsert-${rand}.png`, png(), { contentType: 'image/png', upsert: true })
  check(!upsertNew && !upsertAgain, 'an upload with upsert writes a new file and the same file again, as every upload of the app does', { upsertNew: upsertNew?.message, upsertAgain: upsertAgain?.message })
  await admin.storage.from('tournament-assets').remove([`profiles/${U.id}/upsert-${rand}.png`])
  // TRUST-07 (0061): the bucket is public by URL, but only its owner lists the folder.
  const { data: ownList } = await U.sb.storage.from('tournament-assets').list(`profiles/${U.id}`)
  const { data: strangerList } = await S.sb.storage.from('tournament-assets').list(`profiles/${U.id}`)
  const { data: anonList } = await client().storage.from('tournament-assets').list(`profiles/${U.id}`)
  check(
    (ownList ?? []).some((f) => avatar.endsWith(f.name)) && (strangerList ?? []).length === 0 && (anonList ?? []).length === 0,
    'only the owner lists his photo folder; a stranger and no session list nothing (TRUST-07, 0061)',
    { own: ownList?.length, stranger: strangerList?.length, anon: anonList?.length },
  )
  await admin.storage.from('tournament-assets').remove([avatar])

  console.log('results: WHS in SQL, round results, the Polo index, published results:')
  // SQL and TS agree on every shared case (src/engine/profile/cases/whs.json).
  const whs = JSON.parse(await readFile(path.join(root, 'src', 'engine', 'profile', 'cases', 'whs.json'), 'utf8'))
  const off = []
  for (const c of whs.diff) {
    const { data } = await A.sb.rpc('whs_diff10', { ags: c.ags, rating10: c.rating10, slope: c.slope })
    if (data !== c.expect10) off.push(['diff', c, data])
  }
  for (const c of whs.courseHcp) {
    const { data } = await A.sb.rpc('whs_course_hcp', { index10: c.index10, slope: c.slope, rating10: c.rating10, par: c.par })
    if (data !== c.expect) off.push(['courseHcp', c, data])
  }
  for (const c of whs.strokes) {
    const { data } = await A.sb.rpc('whs_strokes', { ch: c.ch, si: c.si })
    if (data !== c.expect) off.push(['strokes', c, data])
  }
  for (const c of whs.index) {
    const { data } = await A.sb.rpc('whs_index10', { diffs: c.diffs10 })
    if (data !== c.expect10) off.push(['index', c, data])
  }
  check(off.length === 0, 'the SQL WHS functions match the shared cases', off)

  // A rated par-72 course (SI = hole number), a tournament where U is a confirmed player, three rounds.
  const { data: rc } = await admin.from('courses').insert({ name: `RLS course ${rand} results` }).select('id').single()
  const { data: rtee } = await admin.from('tees').insert({ course_id: rc.id, name: 'Blancas', rating: 72.0, slope: 113, sort_order: 0 }).select('id').single()
  await admin.from('holes').insert(Array.from({ length: 18 }, (_, i) => ({ tee_id: rtee.id, number: i + 1, par: 4, stroke_index: i + 1 })))
  const R = await smallTournament(A, 'r')
  await A.sb.rpc('comite_link_profile', { p_player_id: R.p0, p_handle: uProfile.handle })
  await U.sb.rpc('link_my_profile', { p_player_id: R.p0 })
  const rRounds = [R.round.id]
  for (const n of [2, 3]) {
    const { data: rr } = await A.sb.from('rounds').insert({ tournament_id: R.t.id, number: n, holes: 18, course_id: rc.id, status: 'live' }).select('id').single()
    rRounds.push(rr.id)
  }
  await A.sb.from('rounds').update({ course_id: rc.id, status: 'live' }).eq('id', R.round.id)
  const card = (roundId, fn) => Array.from({ length: 18 }, (_, i) => ({ round_id: roundId, player_id: R.p0, hole: i + 1, ...fn(i + 1), client_ts: new Date().toISOString() }))
  const fives = () => ({ strokes: 5, putts: 2, picked_up: false })
  await A.sb.from('scores').insert(card(rRounds[0], fives))
  await A.sb.from('rounds').update({ status: 'finished' }).eq('id', rRounds[0])
  const { data: res1 } = await U.sb.from('round_results').select('gross, ags, differential, complete, course_hcp').eq('round_id', rRounds[0]).eq('player_id', R.p0).single()
  // Base 18 (manual) → course handicap 18 → net double bogey 7 on every par 4; 90 stands. (90 − 72.0) × 113 / 113 = 18.0.
  check(res1?.gross === 90 && res1.ags === 90 && Number(res1.differential) === 18 && res1.complete === true && res1.course_hcp === 18, 'finishing a round writes its results (gross, AGS, differential)', res1)
  await A.sb.from('scores').insert(card(rRounds[1], fives))
  await A.sb.from('rounds').update({ status: 'finished' }).eq('id', rRounds[1])
  const { data: twoRounds } = await U.sb.from('profiles').select('polo_index, polo_index_rounds').eq('id', U.id).single()
  check(twoRounds.polo_index === null && twoRounds.polo_index_rounds === 2, 'two rounds: no index yet', twoRounds)
  // Round 3: a 9 on hole 1 (capped at 7) and a pick-up on hole 2 (counts 7): AGS 7 + 7 + 16 × 5 = 94 → 22.0; no gross.
  await A.sb.from('scores').insert(card(rRounds[2], (h) => (h === 1 ? { strokes: 9, putts: 2, picked_up: false } : h === 2 ? { strokes: null, putts: null, picked_up: true } : fives())))
  await A.sb.from('rounds').update({ status: 'finished' }).eq('id', rRounds[2])
  const { data: res3 } = await U.sb.from('round_results').select('gross, ags, differential, pickups').eq('round_id', rRounds[2]).eq('player_id', R.p0).single()
  check(res3?.gross === null && res3.ags === 94 && Number(res3.differential) === 22 && res3.pickups === 1, 'net double bogey caps a big hole and fills a pick-up', res3)
  const idxOf = async () => (await U.sb.from('profiles').select('polo_index, polo_index_rounds').eq('id', U.id).single()).data
  let idx = await idxOf()
  // Three differentials (22.0, 18.0, 18.0): the lowest − 2.0 = 16.0.
  check(Number(idx.polo_index) === 16 && idx.polo_index_rounds === 3, 'three rounds give the Polo index (16.0)', idx)
  await A.sb.rpc('admin_save_score', { p_round_id: rRounds[0], p_player_id: R.p0, p_hole: 3, p_strokes: 4, p_putts: 2, p_picked_up: false })
  idx = await idxOf()
  check(Number(idx.polo_index) === 15, 'a correction in a finished round moves the index (89 → 17.0 → 15.0)', idx)
  await A.sb.from('rounds').update({ status: 'live' }).eq('id', rRounds[2])
  const { data: reopened } = await U.sb.from('round_results').select('round_id').eq('round_id', rRounds[2])
  idx = await idxOf()
  check((reopened ?? []).length === 0 && idx.polo_index === null && idx.polo_index_rounds === 2, 'reopening a round takes its results out of the index', idx)
  await A.sb.from('rounds').update({ status: 'finished' }).eq('id', rRounds[2])
  await A.sb.from('tournaments').update({ counts_for_stats: false }).eq('id', R.t.id)
  idx = await idxOf()
  check(idx.polo_index === null && idx.polo_index_rounds === 0, 'a practice tournament does not count', idx)
  await A.sb.from('tournaments').update({ counts_for_stats: true }).eq('id', R.t.id)
  idx = await idxOf()
  check(Number(idx.polo_index) === 15, 'and counts again when switched back', idx)

  const payload = [
    { playerId: R.p0, rank: 1, rankLabel: '1', points: 102, perRound: [34, 34, 34], awards: ['mostBirdies'], net: 500 },
    { playerId: R.p1, rank: 2, rankLabel: '2', points: 80, perRound: [27, 27, 26], awards: [], net: -500 },
  ]
  const { error: notFinished } = await A.sb.rpc('publish_tournament_results', { p_tournament_id: R.t.id, p_rows: payload, p_currency: 'MXN' })
  check(!!notFinished, 'results publish only once the tournament is finished')
  await A.sb.from('tournaments').update({ status: 'finished' }).eq('id', R.t.id)
  const { error: strangerPublish } = await S.sb.rpc('publish_tournament_results', { p_tournament_id: R.t.id, p_rows: payload, p_currency: 'MXN' })
  const { data: published, error: publishErr } = await A.sb.rpc('publish_tournament_results', { p_tournament_id: R.t.id, p_rows: payload, p_currency: 'MXN' })
  check(!!strangerPublish && !publishErr && published?.players === 2 && published.field === 2, 'the Comité publishes; nobody else can', { publishErr: publishErr?.message, published })
  const { data: myMoney } = await U.sb.rpc('my_money')
  const { data: sMoney } = await S.sb.from('tournament_money').select('net').eq('tournament_id', R.t.id)
  const { data: uMoneyRows } = await U.sb.from('tournament_money').select('player_id, net').eq('tournament_id', R.t.id)
  check(myMoney?.length === 1 && myMoney[0].net === 500 && (sMoney ?? []).length === 0 && uMoneyRows?.length === 1 && uMoneyRows[0].player_id === R.p0, 'money is private: its owner sees only their own net', { myMoney, uMoneyRows })
  const { data: uHist } = await U.sb.rpc('profile_rounds', { p_handle: uProfile.handle })
  const { data: sHist } = await S.sb.rpc('profile_rounds', { p_handle: uProfile.handle })
  const { data: uTours } = await U.sb.rpc('profile_tournaments', { p_handle: uProfile.handle })
  check(uHist?.length === 3 && (sHist ?? []).length === 0 && uTours?.find((x) => x.tournamentId === R.t.id)?.rankLabel === '1', 'history and finishes show to the owner and tournament mates, not strangers', { u: uHist?.length, s: sHist?.length })
  await A.sb.from('tournaments').update({ status: 'live' }).eq('id', R.t.id)
  const { data: gone } = await A.sb.from('tournament_results').select('player_id').eq('tournament_id', R.t.id)
  check((gone ?? []).length === 0, 'leaving "finished" withdraws the published results')

  console.log('social: friends, notifications, head to head, rivalries:')
  // U is hidden (discoverable off, above) and S shares nothing with U yet.
  const { data: tooEarly } = await S.sb.rpc('friend_request', { p_handle: uProfile.handle })
  check(tooEarly === 'not_found', 'a hidden profile cannot be friended by a stranger', tooEarly)
  // Tournament Q: U is q0, S is q1, both confirmed; three rounds on the rated course.
  const Q = await smallTournament(A, 'q')
  await A.sb.rpc('comite_link_profile', { p_player_id: Q.p0, p_handle: uProfile.handle })
  await A.sb.rpc('comite_link_profile', { p_player_id: Q.p1, p_handle: sProfile.handle })
  await U.sb.rpc('link_my_profile', { p_player_id: Q.p0 })
  await S.sb.rpc('link_my_profile', { p_player_id: Q.p1 })
  const { data: request } = await S.sb.rpc('friend_request', { p_handle: uProfile.handle })
  const { data: requestAgain } = await S.sb.rpc('friend_request', { p_handle: uProfile.handle })
  const { data: uFriends } = await U.sb.rpc('my_friends')
  check(request === 'pending' && requestAgain === 'pending' && uFriends?.incoming?.length === 1 && uFriends.incoming[0].handle === sProfile.handle, 'a tournament mate sends a request; U sees it as incoming', { request, uFriends })
  const inbox = async (who) => (await who.sb.rpc('my_notifications')).data ?? []
  let uInbox = await inbox(U)
  check(uInbox.filter((n) => n.kind === 'friend_request').length === 1 && uInbox.some((n) => n.kind === 'link_pending'), 'U hears about the request once, and about the Comité proposal', uInbox.map((n) => n.kind))
  const { data: unread } = await U.sb.rpc('unread_notifications')
  await U.sb.rpc('mark_notifications_read')
  const { data: unreadAfter } = await U.sb.rpc('unread_notifications')
  check(unread > 0 && unreadAfter === 0, 'marking read clears the count', { unread, unreadAfter })
  const { error: notifyDirect } = await U.sb.rpc('notify', { p_profile: S.id, p_kind: 'x', p_key: 'x', p_actor: U.id, p_data: {} })
  const { error: forgeNote } = await U.sb.from('notifications').insert({ profile_id: S.id, kind: 'x', key: 'x' })
  const { error: graph } = await S.sb.rpc('are_friends', { x: U.id, y: S.id })
  check(!!notifyDirect && !!forgeNote && !!graph, 'nobody writes notifications or reads the friend graph directly')
  const { data: accepted } = await U.sb.rpc('friend_respond', { p_handle: sProfile.handle, p_accept: true })
  const { data: fw } = await S.sb.rpc('friendship_with', { p_handle: uProfile.handle })
  const sInbox = await inbox(S)
  check(accepted === 'accepted' && fw === 'friends' && sInbox.some((n) => n.kind === 'friend_accepted'), 'U accepts; both are friends and S is told', { accepted, fw })

  // Rivalry: U proposes to receive 3 strokes; S accepts. Then three rounds.
  await W.sb.rpc('ensure_my_profile')
  const { error: notFriends } = await W.sb.rpc('rivalry_propose', { p_handle: uProfile.handle, p_strokes: 0 })
  check(!!notFriends, 'rivalries are only between friends')
  const { data: rivalryId, error: proposeErr } = await U.sb.rpc('rivalry_propose', { p_handle: sProfile.handle, p_strokes: 3 })
  const { error: proposeTwice } = await S.sb.rpc('rivalry_propose', { p_handle: uProfile.handle, p_strokes: 0 })
  const { error: respondOwn } = await U.sb.rpc('rivalry_respond', { p_id: rivalryId, p_accept: true })
  const { error: acceptErr } = await S.sb.rpc('rivalry_respond', { p_id: rivalryId, p_accept: true })
  check(!proposeErr && !!proposeTwice && !!respondOwn && !acceptErr, 'one open rivalry per pair; only the invited friend accepts', { proposeErr: proposeErr?.message, acceptErr: acceptErr?.message })
  const qRounds = [Q.round.id]
  for (const n of [2, 3]) {
    const { data: qr } = await A.sb.from('rounds').insert({ tournament_id: Q.t.id, number: n, holes: 18, course_id: rc.id, status: 'live' }).select('id').single()
    qRounds.push(qr.id)
  }
  await A.sb.from('rounds').update({ course_id: rc.id }).eq('id', Q.round.id)
  // A card of fives with `sixes` holes of 6 and `fours` holes of 4 (all within net double bogey).
  const qCard = (roundId, playerId, sixes, fours) =>
    Array.from({ length: 18 }, (_, i) => ({ round_id: roundId, player_id: playerId, hole: i + 1, strokes: i < sixes ? 6 : i >= 18 - fours ? 4 : 5, putts: 2, picked_up: false, client_ts: new Date().toISOString() }))
  const myStrokes = async () => (await U.sb.rpc('head_to_head', { p_handle: sProfile.handle })).data?.rivalry?.myStrokes
  const steps = []
  // U 92 − 3 = 89 vs S 88 → S wins, U gets one more: 4.
  // U 90 − 4 = 86 vs S 88 → U wins, U gives one back: 3.
  // U 91 − 3 = 88 vs S 88 → tie: 3.
  for (const [i, [uSix, sFour]] of [[2, 2], [0, 2], [1, 2]].entries()) {
    await A.sb.from('scores').insert([...qCard(qRounds[i], Q.p0, uSix, 0), ...qCard(qRounds[i], Q.p1, 0, sFour)])
    await A.sb.from('rounds').update({ status: 'finished' }).eq('id', qRounds[i])
    steps.push(await myStrokes())
  }
  check(steps.join(',') === '4,3,3', 'strokes slide after each shared round (3 → 4 → 3 → 3)', steps)
  // A correction on S's last card (hole 1: 5 → 4, 88 → 87) turns the tie into an S win: 4.
  await A.sb.rpc('admin_save_score', { p_round_id: qRounds[2], p_player_id: Q.p1, p_hole: 1, p_strokes: 4, p_putts: 2, p_picked_up: false })
  const { data: h2h } = await U.sb.rpc('head_to_head', { p_handle: sProfile.handle })
  const { data: h2hS } = await S.sb.rpc('head_to_head', { p_handle: uProfile.handle })
  check(h2h?.rivalry?.myStrokes === 4 && h2h.rivalry.history[0]?.result === 'lost' && h2hS?.rivalry?.myStrokes === -4, 'a correction replays the rivalry from scratch (last round now lost, 4 strokes)', h2h?.rivalry)
  check(h2h?.rounds?.length === 3 && h2h.rounds.every((r) => typeof r.myNet === 'number'), 'head to head lists our three shared rounds', h2h?.rounds?.length)
  uInbox = await inbox(U)
  check(uInbox.filter((n) => n.kind === 'rivalry_round').length === 3, 'each rivalry round notifies once, even after the replay')
  const { data: wH2h } = await W.sb.rpc('head_to_head', { p_handle: uProfile.handle })
  const { data: lurkerH2h } = await lurker.rpc('head_to_head', { p_handle: uProfile.handle })
  const { data: wRivals } = await W.sb.from('rivalries').select('id')
  check(wH2h === null && lurkerH2h === null && (wRivals ?? []).length === 0, 'strangers see no head to head and no rivalries')
  const { data: feed } = await U.sb.rpc('friends_feed')
  check((feed ?? []).filter((f) => f.kind === 'rivalry').length === 3, 'the feed carries the rivalry results', feed?.map((f) => f.kind))

  console.log('quick round: one call, friends pending, guests, groups, the rivalry line:')
  const quick = (players, who = U.sb) => who.rpc('create_quick_round', { p: { name: `RLS quick ${rand}`, settings, courseId: rc.id, teeId: rtee.id, date: new Date().toISOString().slice(0, 10), players } })
  const { error: anonQuick } = await quick([{ kind: 'me' }], lurker)
  const { error: strangerFriend } = await quick([{ kind: 'me' }, { kind: 'friend', handle: (await W.sb.rpc('ensure_my_profile')).data.handle }])
  const { error: withoutMe } = await quick([{ kind: 'guest', name: 'Solo Invitado' }])
  check(!!anonQuick && !!strangerFriend && !!withoutMe, 'a quick round needs an account, only friends as friends, and the creator in it')
  const { data: qr, error: qrErr } = await quick([{ kind: 'me' }, { kind: 'friend', handle: sProfile.handle }, { kind: 'guest', name: 'Invitado Prueba', index: 10.4 }])
  if (qr?.id) created.tournaments.push(qr.id)
  const { data: qt } = await U.sb.from('tournaments').select('status, quick, current_round_id, counts_for_stats').eq('id', qr?.id).single()
  const { data: qPlayers } = await U.sb.from('players').select('id, display_name, profile_id, profile_status, handicap_source, handicap_index, default_tee_id').eq('tournament_id', qr?.id).order('sort_order')
  const { data: qMember } = await U.sb.rpc('my_membership', { tid: qr?.id })
  check(
    !qrErr && qt?.status === 'live' && qt.quick === true && qt.counts_for_stats === true && qPlayers?.length === 3 && qMember?.playerId === qPlayers[0].id && qMember.isOrganizer === true,
    'it creates a live quick tournament where the creator is a confirmed player and the Comité',
    { qrErr: qrErr?.message, qt, qMember },
  )
  const guest = qPlayers?.[2]
  check(qPlayers?.[1]?.profile_id === S.id && qPlayers[1].profile_status === 'pending' && guest?.profile_id === null && guest.handicap_source === 'index' && Number(guest.handicap_index) === 10.4 && qPlayers.every((p) => p.default_tee_id === rtee.id), 'the friend is pending, the guest plays off the index typed, everyone on the chosen tee', qPlayers)
  const { data: qGroups } = await U.sb.from('group_members').select('player_id, groups!group_members_group_id_fkey!inner(round_id)').eq('groups.round_id', qt?.current_round_id)
  check((qGroups ?? []).length === 3, 'one group with the three of them')
  const sInvites = (await inbox(S)).filter((n) => n.kind === 'round_invite')
  check(sInvites.length === 1 && sInvites[0].data.slug, 'the friend hears about the round')
  await S.sb.rpc('link_my_profile', { p_player_id: qPlayers[1].id })
  const { data: line } = await U.sb.rpc('round_rivalries', { tid: qr?.id })
  const { data: lineS } = await S.sb.rpc('round_rivalries', { tid: qr?.id })
  check(line?.length === 1 && line[0].myStrokes === 4 && line[0].theirPlayerId === qPlayers[1].id && lineS?.[0]?.myStrokes === -4, 'once confirmed, both see their rivalry strokes for the Tarjeta', { line, lineS })
  const { data: wLine } = await W.sb.rpc('round_rivalries', { tid: qr?.id })
  check(Array.isArray(wLine) && wLine.length === 0, 'nobody else sees it')

  console.log('crews: create, join by code, privacy, outings and season results:')
  const { error: anonCrew } = await lurker.rpc('create_crew', { p_name: 'Nope' })
  const { data: crew, error: crewErr } = await U.sb.rpc('create_crew', { p_name: `RLS crew ${rand}` })
  check(!!anonCrew && !crewErr && crew?.joinCode?.length === 6, 'an account creates a crew; an anonymous device cannot', { crewErr: crewErr?.message })
  const { data: wBefore } = await W.sb.rpc('crew_page', { p_slug: crew.slug })
  const { data: wCrewRows } = await W.sb.from('crews').select('id').eq('id', crew.id)
  const { data: wCardBefore } = await W.sb.rpc('profile_card', { p_handle: uProfile.handle })
  check(wBefore === null && (wCrewRows ?? []).length === 0 && wCardBefore === null, 'outsiders see neither the crew nor its hidden members')
  const { data: preview } = await W.sb.rpc('crew_preview', { p_code: crew.joinCode.toLowerCase() })
  const { data: joined } = await W.sb.rpc('join_crew', { p_code: crew.joinCode })
  const { data: wPage } = await W.sb.rpc('crew_page', { p_slug: crew.slug })
  const { data: wCardAfter } = await W.sb.rpc('profile_card', { p_handle: uProfile.handle })
  check(preview?.name === `RLS crew ${rand}` && joined === crew.slug && wPage?.members?.length === 2 && wCardAfter?.related === true, 'the code joins; crew-mates see each other in full', { preview, joined })
  check((await inbox(U)).some((n) => n.kind === 'crew_join'), 'the owner hears that someone joined')
  const { error: wSetCrew } = await W.sb.rpc('set_tournament_crew', { p_tournament_id: qr.id, p_crew_id: crew.id })
  const { error: uSetCrew } = await U.sb.rpc('set_tournament_crew', { p_tournament_id: qr.id, p_crew_id: crew.id })
  check(!!wSetCrew && !uSetCrew, 'only the Comité (and a crew member) puts a tournament in the crew', { uSetCrew: uSetCrew?.message })
  // «Cerrar torneo» (0029): Terminado waits while the round is live; QuickFinish finishes it first.
  const { error: liveClose } = await U.sb.from('tournaments').update({ status: 'finished' }).eq('id', qr.id).select('id')
  check(liveClose?.code === '22023' && liveClose.message.startsWith('Todavía no se puede marcar Terminado. El día 1 sigue abierto'), 'the server refuses Terminado while the round is live', liveClose?.message)
  await U.sb.from('rounds').update({ status: 'finished' }).eq('id', qt.current_round_id)
  const { error: closeErr } = await U.sb.from('tournaments').update({ status: 'finished' }).eq('id', qr.id).select('id')
  check(!closeErr, 'its round finished, Terminado goes through', closeErr?.message)
  await U.sb.rpc('publish_tournament_results', {
    p_tournament_id: qr.id,
    p_rows: qPlayers.map((p, i) => ({ playerId: p.id, rank: i + 1, rankLabel: String(i + 1), points: 40 - i, perRound: [40 - i], awards: [], net: null })),
    p_currency: 'MXN',
  })
  const { data: page } = await W.sb.rpc('crew_page', { p_slug: crew.slug })
  check(page?.outings?.length === 1 && page.results?.length === 1 && page.results[0].handle === uProfile.handle && page.results[0].rank === 1 && page.results[0].tied === 1, 'the crew page lists the outing and only members’ results for the season', { outings: page?.outings?.length, results: page?.results })
  const { error: wRotate } = await W.sb.rpc('rotate_crew_code', { p_crew_id: crew.id })
  const { data: rotated } = await U.sb.rpc('rotate_crew_code', { p_crew_id: crew.id })
  const { data: oldPreview } = await S.sb.rpc('crew_preview', { p_code: crew.joinCode })
  check(!!wRotate && typeof rotated === 'string' && rotated !== crew.joinCode && oldPreview === null, 'only the owner rotates the code; the old one stops working')
  await W.sb.rpc('leave_crew', { p_crew_id: crew.id })
  const { data: wGone } = await W.sb.rpc('crew_page', { p_slug: crew.slug })
  const { data: wMine } = await W.sb.rpc('my_crews')
  check(wGone === null && Array.isArray(wMine) && wMine.length === 0, 'leaving takes the crew away')

  console.log('push: subscriptions, the prune secret:')
  const endpoint = `https://fcm.googleapis.com/fcm/send/rls-${rand}`
  const { error: anonSub } = await lurker.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: 'x', p_auth: 'y' })
  const { error: badSub } = await U.sb.rpc('save_push_subscription', { p_endpoint: 'http://insecure', p_p256dh: 'x', p_auth: 'y' })
  const { error: subErr } = await U.sb.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: 'x', p_auth: 'y', p_user_agent: 'rls' })
  const { error: offList } = await U.sb.rpc('save_push_subscription', { p_endpoint: `https://httpbin.org/anything/${rand}`, p_p256dh: 'x', p_auth: 'y' })
  check(!!anonSub && !!badSub && !subErr, 'an account saves an https subscription; anonymous devices cannot', { subErr: subErr?.message })
  check(offList?.code === '22023', 'an address off the browsers’ push services is refused (SEC-03, 0055)', { offList: offList?.code })
  const { data: uSubs } = await U.sb.from('push_subscriptions').select('endpoint')
  const { data: sSubs } = await S.sb.from('push_subscriptions').select('endpoint').eq('endpoint', endpoint)
  const { error: forgeSub } = await S.sb.from('push_subscriptions').insert({ profile_id: S.id, endpoint: `${endpoint}-2`, p256dh: 'x', auth: 'y' })
  check(uSubs?.some((x) => x.endpoint === endpoint) && (sSubs ?? []).length === 0 && !!forgeSub, 'subscriptions are private and written only through the RPC')
  const { error: secretRead } = await U.sb.rpc('push_secret', { p_name: 'push_dispatch_secret' })
  const { error: wrongPrune } = await lurker.rpc('push_prune', { p_secret: 'nope', p_endpoints: [endpoint] })
  check(!!secretRead && !!wrongPrune, 'nobody reads the Vault secret; a wrong secret cannot prune')
  if (process.env.PUSH_DISPATCH_SECRET) {
    const { data: pruned, error: pruneErr } = await lurker.rpc('push_prune', { p_secret: process.env.PUSH_DISPATCH_SECRET, p_endpoints: [endpoint] })
    const { data: after } = await U.sb.from('push_subscriptions').select('endpoint').eq('endpoint', endpoint)
    check(!pruneErr && pruned === 1 && (after ?? []).length === 0, 'the dispatch secret prunes a dead endpoint', { pruneErr: pruneErr?.message, pruned })
  }

  console.log('push: a PIN phone, for the player it holds (0052):')
  const pinPhone = client()
  const { data: pinSession } = await pinPhone.auth.signInAnonymously()
  created.users.push(pinSession.user.id)
  const pinEndpoint = `https://fcm.googleapis.com/fcm/send/rls-pin-${rand}`
  const pinArgs = { p_tournament_id: C.t.id, p_endpoint: pinEndpoint, p_p256dh: 'x', p_auth: 'y' }
  const { error: unclaimedSub } = await pinPhone.rpc('save_pin_push', pinArgs)
  const { data: pinClaim } = await pinPhone.rpc('claim_player', { p_player_id: C.p1, p_pin: '4321' })
  const { error: pinSubErr } = await pinPhone.rpc('save_pin_push', pinArgs)
  const { data: pinOn } = await pinPhone.rpc('pin_push_on', { p_tournament_id: C.t.id, p_endpoint: pinEndpoint })
  const { error: otherTournament } = await pinPhone.rpc('save_pin_push', { ...pinArgs, p_tournament_id: D.t.id, p_endpoint: `${pinEndpoint}-d` })
  check(!!unclaimedSub && pinClaim?.ok === true && !pinSubErr && pinOn === true && !!otherTournament, 'a PIN phone saves its address only for the player it holds, in his tournament', {
    unclaimed: unclaimedSub?.message,
    pinSubErr: pinSubErr?.message,
    pinOn,
    other: otherTournament?.message,
  })
  const { error: pinRead } = await pinPhone.from('pin_push_subscriptions').select('endpoint')
  const { error: noticesRead } = await pinPhone.from('player_notices').select('id')
  const { error: notifyCall } = await pinPhone.rpc('notify_player', { p_player_id: C.p1, p_kind: 'results', p_key: 'x', p_data: {} })
  check(!!pinRead && !!noticesRead && !!notifyCall, 'nobody reads the addresses or the notices directly, nor sends one')
  await pinPhone.rpc('release_device')
  const { data: pinOff } = await pinPhone.rpc('pin_push_on', { p_tournament_id: C.t.id, p_endpoint: pinEndpoint })
  const { data: pinRows } = await admin.from('pin_push_subscriptions').select('id').eq('endpoint', pinEndpoint)
  check(pinOff === false && (pinRows ?? []).length === 0, '«Cambiar de jugador» takes the address with the claim', { pinOff, rows: pinRows?.length })

  // Blocking ends it all.
  await U.sb.rpc('friend_block', { p_handle: sProfile.handle })
  const { data: blockedReq } = await S.sb.rpc('friend_request', { p_handle: uProfile.handle })
  const { data: sCardBlocked } = await S.sb.rpc('profile_card', { p_handle: uProfile.handle })
  const { data: ended } = await U.sb.from('rivalries').select('status').eq('id', rivalryId).single()
  check(blockedReq === 'not_found' && ended?.status === 'ended' && !sCardBlocked?.related, 'a block hides U from S, refuses requests and ends the rivalry', { blockedReq, ended, related: sCardBlocked?.related })
} catch (e) {
  console.error('ERROR', e.message ?? e)
  failures++
} finally {
  console.log('cleaning up…')
  for (const id of created.tournaments) await admin.from('tournaments').delete().eq('id', id)
  for (const id of created.users) await admin.auth.admin.deleteUser(id)
  // Leftovers of earlier interrupted runs (test data only: slugs rls-a-* / rls-b-*).
  const { data: stale } = await admin.from('tournaments').select('id, slug').like('slug', 'rls-%')
  for (const t of stale ?? []) if (/^rls-[ab]-[a-z0-9]{6}(-\d+)?$/.test(t.slug)) await admin.from('tournaments').delete().eq('id', t.id)
  const { data: staleCourses } = await admin.from('courses').select('id').like('name', 'RLS course %')
  for (const c of staleCourses ?? []) await admin.from('courses').delete().eq('id', c.id)
}
console.log(failures === 0 ? '\n✓ RLS isolation holds' : `\n✗ ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
