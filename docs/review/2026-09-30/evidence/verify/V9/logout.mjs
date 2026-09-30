// Revoke this verifier's throwaway anonymous session and remove its token file.
import { readFileSync, unlinkSync } from 'node:fs'
const V = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V9'
const env = readFileSync('/home/user/Cardi-Golf/.env.example', 'utf8')
const URL_ = /VITE_SUPABASE_URL=(\S+)/.exec(env)[1]
const ANON = /VITE_SUPABASE_ANON_KEY=(\S+)/.exec(env)[1]
const s = JSON.parse(readFileSync(`${V}/anon-session.json`, 'utf8'))
const m = await fetch(`${URL_}/rest/v1/rpc/my_membership`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ tid: '8b40f02b-e8be-4cd7-a93a-b42d450f5fda' }) })
console.log('membership in Ensayo before logout:', JSON.stringify((await m.json()).playerId ?? null))
const r = await fetch(`${URL_}/auth/v1/logout?scope=global`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}` } })
console.log('logout', r.status)
const t = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) })
console.log('refresh after logout', t.status)
unlinkSync(`${V}/anon-session.json`)
console.log('token file removed')
