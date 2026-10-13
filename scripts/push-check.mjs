#!/usr/bin/env node
// Web push end to end against the live deploy, both ways a notice goes out:
//   1. an account's (migration 0019): a throwaway account gets two
//      subscriptions with real P-256 keys whose endpoints are a test server
//      answering 201 (delivered) and 410 (gone). A notification for that
//      account must go trigger → pg_net → /api/push-dispatch → web-push; the
//      410 subscription is then pruned through push_prune and the 201 one stays.
//   2. a PIN phone's (0051, PWA-10): a throwaway tournament with one player, a
//      user holding him by PIN (device_sessions) and the same two endpoints
//      saved for that player. A notice for him must go player_notices → pg_net
//      → the route → web-push, and the gone endpoint is pruned from
//      pin_push_subscriptions the same way.
// Test setup uses the service key, like rls-test; the app never does.
//   node scripts/push-check.mjs
import { createClient } from '@supabase/supabase-js'
import { createECDH, randomBytes } from 'node:crypto'
import { loadEnv } from './lib/env.mjs'

loadEnv()
const URL_ = process.env.VITE_SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY
if (!URL_ || !SECRET) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SECRET_KEY')
  process.exit(1)
}
const admin = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const keys = () => {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return { p256dh: b64url(ecdh.getPublicKey()), auth: b64url(randomBytes(16)) }
}

let failed = 0
const check = (ok, label, detail) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`)
  if (!ok) {
    failed++
    if (detail !== undefined) console.log('    ', JSON.stringify(detail))
  }
}
/** The endpoints left in `table` for `col = id` once the route has had its time (a pruned one goes). */
async function settle(table, col, id) {
  let left = null
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500))
    const { data } = await admin.from(table).select('endpoint').eq(col, id)
    left = (data ?? []).map((x) => x.endpoint)
    if (left.length === 1) break
  }
  return left
}

const rand = Math.random().toString(36).slice(2, 8)
const users = []
let tournamentId = null
try {
  console.log('an account’s notice:')
  const { data: made, error } = await admin.auth.admin.createUser({ email: `push-${rand}@cardi-golf.test`, email_confirm: true, user_metadata: { display_name: 'Push Prueba' } })
  if (error) throw error
  const uid = made.user.id
  users.push(uid)
  await admin.from('profiles').insert({ id: uid, handle: `push${rand}`, display_name: 'Push Prueba' })
  const ok = `https://httpbin.org/status/201?polo=${rand}`
  const gone = `https://httpbin.org/status/410?polo=${rand}`
  await admin.from('push_subscriptions').insert([
    { profile_id: uid, endpoint: ok, ...keys() },
    { profile_id: uid, endpoint: gone, ...keys() },
  ])
  // What a friend request would write (notify() is internal; the service key stands in for it here).
  await admin.from('notifications').insert({ profile_id: uid, kind: 'friend_request', key: `push-check:${rand}`, data: {} })
  const left = await settle('push_subscriptions', 'profile_id', uid)
  check(left?.length === 1 && left[0] === ok, 'a notification reaches the dispatch route; the gone endpoint is pruned, the live one stays', left)

  console.log('a PIN phone’s notice (0051):')
  const { data: phone, error: phoneErr } = await admin.auth.admin.createUser({ email: `push-pin-${rand}@cardi-golf.test`, email_confirm: true })
  if (phoneErr) throw phoneErr
  users.push(phone.user.id)
  const slug = `push-check-${rand}`
  const code = Array.from(randomBytes(6), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')
  const { data: t, error: tErr } = await admin.from('tournaments').insert({ slug, name: 'Push check', join_code: code }).select('id').single()
  if (tErr) throw tErr
  tournamentId = t.id
  const { data: p, error: pErr } = await admin.from('players').insert({ tournament_id: t.id, full_name: 'Push Prueba', display_name: 'Push' }).select('id').single()
  if (pErr) throw pErr
  await admin.from('device_sessions').insert({ auth_user_id: phone.user.id, player_id: p.id, tournament_id: t.id })
  const pinOk = `https://httpbin.org/status/201?polo=pin-${rand}`
  const pinGone = `https://httpbin.org/status/410?polo=pin-${rand}`
  const { error: subErr } = await admin.from('pin_push_subscriptions').insert([
    { tournament_id: t.id, player_id: p.id, auth_user_id: phone.user.id, endpoint: pinOk, ...keys() },
    { tournament_id: t.id, player_id: p.id, auth_user_id: phone.user.id, endpoint: pinGone, ...keys() },
  ])
  if (subErr) throw subErr
  // What a day going live would write (notify_player is internal; the service key stands in for it here).
  const { error: nErr } = await admin.from('player_notices').insert({ tournament_id: t.id, player_id: p.id, kind: 'round_live', key: `push-check:${rand}`, data: { tournament: 'Push check', slug, round: 1 } })
  if (nErr) throw nErr
  const pinLeft = await settle('pin_push_subscriptions', 'player_id', p.id)
  check(pinLeft?.length === 1 && pinLeft[0] === pinOk, 'a player’s notice reaches the dispatch route; the gone endpoint is pruned, the live one stays', pinLeft)
} finally {
  if (tournamentId) await admin.from('tournaments').delete().eq('id', tournamentId)
  for (const id of users) await admin.auth.admin.deleteUser(id)
}
console.log(failed === 0 ? '\n✓ push chain works' : `\n✗ ${failed} failure(s)`)
process.exit(failed === 0 ? 0 : 1)
