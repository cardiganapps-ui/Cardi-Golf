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
  const { error: lookupNoSession } = await noSession.rpc('lookup_tournament', { p_code: A.tournament.join_code })
  check(!!lookupNoSession, 'lookup_tournament without a session is refused')
  const { data: lookupMember } = await dev.rpc('lookup_tournament', { p_code: A.tournament.slug })
  const { data: lookupStranger } = await dev2.rpc('lookup_tournament', { p_code: B.tournament.slug })
  check(lookupMember?.joinCode === A.tournament.join_code && lookupStranger?.joinCode == null, 'the join code is returned to members only')
  const { data: newCode, error: rotateErr } = await A.sb.rpc('rotate_join_code', { p_tournament_id: A.tournament.id })
  const { error: rotateB } = await A.sb.rpc('rotate_join_code', { p_tournament_id: B.tournament.id })
  check(!rotateErr && /^[A-Z2-9]{6}$/.test(newCode) && newCode !== A.tournament.join_code && !!rotateB, 'rotate_join_code works for the owner and not across tournaments')

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
