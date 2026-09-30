// Release my own device claim (deletes only my anon user's device_sessions row), then confirm membership is gone.
import { readFileSync } from 'node:fs'
import { ANON, E } from './v10lib.mjs'
const SB = 'https://gmohwledjejlhcwqjnhd.supabase.co'
let s = JSON.parse(readFileSync(`${E}/state/session.json`, 'utf8'))
if (s.expires_at * 1000 < Date.now() + 60000) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) })
  console.log('refresh', r.status)
  s = await r.json()
}
const h = { apikey: ANON, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
const lk = await fetch(`${SB}/rest/v1/rpc/lookup_tournament`, { method: 'POST', headers: h, body: JSON.stringify({ p_code: 'ensayo' }) }).then((r) => r.json())
const before = await fetch(`${SB}/rest/v1/rpc/my_membership`, { method: 'POST', headers: h, body: JSON.stringify({ tid: lk.id }) }).then((r) => r.json())
console.log('before: playerId set =', !!before.playerId, 'via', before.via)
const rel = await fetch(`${SB}/rest/v1/rpc/release_device`, { method: 'POST', headers: h, body: '{}' })
console.log('release_device', rel.status)
const after = await fetch(`${SB}/rest/v1/rpc/my_membership`, { method: 'POST', headers: h, body: JSON.stringify({ tid: lk.id }) }).then((r) => r.json())
console.log('after: playerId set =', !!after.playerId, 'via', after.via)
