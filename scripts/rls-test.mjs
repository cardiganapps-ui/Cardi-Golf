#!/usr/bin/env node
// Tenant-isolation test against the live Supabase project (CLAUDE.md §16 M2):
// two organizers, two tournaments, one claimed player device. Proves that a
// device linked to tournament A reads nothing from tournament B, and that
// organizer A cannot see tournament B. Cleans up after itself.
//   node scripts/rls-test.mjs
// Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SECRET_KEY (.env.local).
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
if (existsSync(path.join(root, '.env.local'))) {
  for (const line of (await readFile(path.join(root, '.env.local'), 'utf8')).split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
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
const check = (cond, label) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}
const settings = JSON.parse(await readFile(path.join(root, 'scripts', 'fixtures', 'settings-minimal.json'), 'utf8'))

async function organizer(tag) {
  const sb = client()
  const email = `rls-${tag}-${rand}@cardi-golf.test`
  const { data, error } = await sb.auth.signUp({ email, password: `Pw-${rand}-${tag}!`, options: { data: { display_name: tag } } })
  if (error) throw error
  if (!data.session) throw new Error('signUp returned no session (is mailer_autoconfirm on?)')
  created.users.push(data.user.id)
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

  console.log('lockout:')
  await dev.rpc('release_device')
  for (let i = 0; i < 5; i++) await dev.rpc('claim_player', { p_player_id: A.player.id, p_pin: '9999' })
  const { data: locked } = await dev.rpc('claim_player', { p_player_id: A.player.id, p_pin: '1234' })
  check(locked.ok === false && locked.reason === 'locked', 'five failures lock the PIN for 5 minutes')
} catch (e) {
  console.error('ERROR', e.message ?? e)
  failures++
} finally {
  console.log('cleaning up…')
  for (const id of created.tournaments) await admin.from('tournaments').delete().eq('id', id)
  for (const id of created.users) await admin.auth.admin.deleteUser(id)
}
console.log(failures === 0 ? '\n✓ RLS isolation holds' : `\n✗ ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
