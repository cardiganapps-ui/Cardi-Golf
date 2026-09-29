#!/usr/bin/env node
// Web push end to end against the live deploy (migration 0019): a throwaway
// account gets two subscriptions with real P-256 keys whose endpoints are a
// test server answering 201 (delivered) and 410 (gone). A notification for
// that account must go trigger → pg_net → /api/push-dispatch → web-push; the
// 410 subscription is then pruned through push_prune and the 201 one stays.
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

const rand = Math.random().toString(36).slice(2, 8)
const { data: made, error } = await admin.auth.admin.createUser({ email: `push-${rand}@cardi-golf.test`, email_confirm: true, user_metadata: { display_name: 'Push Prueba' } })
if (error) throw error
const uid = made.user.id
try {
  await admin.from('profiles').insert({ id: uid, handle: `push${rand}`, display_name: 'Push Prueba' })
  const ok = `https://httpbin.org/status/201?polo=${rand}`
  const gone = `https://httpbin.org/status/410?polo=${rand}`
  await admin.from('push_subscriptions').insert([
    { profile_id: uid, endpoint: ok, ...keys() },
    { profile_id: uid, endpoint: gone, ...keys() },
  ])
  // What a friend request would write (notify() is internal; the service key stands in for it here).
  await admin.from('notifications').insert({ profile_id: uid, kind: 'friend_request', key: `push-check:${rand}`, data: {} })
  let left = null
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500))
    const { data } = await admin.from('push_subscriptions').select('endpoint').eq('profile_id', uid)
    left = (data ?? []).map((x) => x.endpoint)
    if (left.length === 1) break
  }
  check(left?.length === 1 && left[0] === ok, 'a notification reaches the dispatch route; the gone endpoint is pruned, the live one stays', left)
} finally {
  await admin.auth.admin.deleteUser(uid)
}
console.log(failed === 0 ? '\n✓ push chain works' : `\n✗ ${failed} failure(s)`)
process.exit(failed === 0 ? 0 : 1)
