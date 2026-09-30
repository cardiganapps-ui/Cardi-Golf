// V9 / REL-16, fully local: what the app's supabase-js (same package, same options as src/lib/supabase.ts)
// does when the stored session's access token is expired and the refresh is refused (400), then the outbox pushes.
// A local fake server plays GoTrue + PostgREST; nothing reaches Supabase.
import http from 'node:http'
import { createClient } from '@supabase/supabase-js'

const ANON = 'anon-key-placeholder'
const seen = []
let refreshStatus = 400
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const auth = req.headers.authorization ?? ''
    seen.push(`${req.method} ${req.url.split('?')[0]}${req.url.includes('grant_type') ? '?grant_type=refresh_token' : ''} auth=${auth === `Bearer ${ANON}` ? 'ANON KEY' : auth ? 'user JWT' : 'none'}`)
    if (req.url.startsWith('/auth/v1/token')) {
      if (refreshStatus === 400) {
        res.writeHead(400, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ code: 400, error_code: 'refresh_token_already_used', msg: 'Invalid Refresh Token: Already Used' }))
      }
      if (refreshStatus === 200) {
        const now = Math.floor(Date.now() / 1000)
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '11111111-1111-4111-8111-111111111111', role: 'authenticated', is_anonymous: true, exp: now + 3600 })}.sig`, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'rt-new', user: stored.user }))
      }
      res.writeHead(502)
      return res.end('bad gateway')
    }
    if (req.url.startsWith('/rest/v1/scores')) {
      // PostgREST's answer to a role without rights under RLS (harness: anon gets 42501 on this upsert)
      res.writeHead(auth === `Bearer ${ANON}` ? 401 : 201, { 'content-type': 'application/json' })
      return res.end(auth === `Bearer ${ANON}` ? JSON.stringify({ code: '42501', details: null, hint: null, message: 'new row violates row-level security policy for table "scores"' }) : '')
    }
    res.writeHead(404)
    res.end()
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${server.address().port}`

function b64(o) {
  return Buffer.from(JSON.stringify(o)).toString('base64url')
}
const past = Math.floor(Date.now() / 1000) - 120
const fakeJwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '11111111-1111-4111-8111-111111111111', role: 'authenticated', is_anonymous: true, exp: past })}.sig`
const stored = { access_token: fakeJwt, refresh_token: 'rt-rotated-away', token_type: 'bearer', expires_in: 3600, expires_at: past, user: { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }

async function run(label) {
  seen.length = 0
  const mem = new Map([['cardi-golf-auth', JSON.stringify(stored)]])
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) }
  const events = []
  const sb = createClient(url, ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'cardi-golf-auth', storage } })
  sb.auth.onAuthStateChange((e, s) => events.push(`${e}:${s ? 'session' : 'null'}`))
  const { data, error } = await sb.auth.getSession()
  const up = await sb.from('scores').upsert({ round_id: 'r', player_id: 'p', hole: 16, strokes: 5, putts: 2, picked_up: false, entered_by: 'p', client_ts: 'now' }, { onConflict: 'round_id,player_id,hole' })
  console.log(label)
  console.log('  getSession ->', data.session ? 'session' : 'null', error ? `error ${error.message}` : '')
  console.log('  auth events', JSON.stringify(events), '| stored session left:', mem.has('cardi-golf-auth'))
  console.log('  requests', JSON.stringify(seen))
  console.log('  upsert error.message ->', JSON.stringify(up.error?.message ?? null))
  sb.auth.stopAutoRefresh()
  await sb.removeAllChannels()
}
refreshStatus = 400
await run('A) refresh refused (400 refresh_token_already_used):')
refreshStatus = 502
await run('B) refresh only hits 502s (retryable, ~25 s of retries):')

// C) same client: the refresh fails (502) ... then the network/auth is back, and the outbox pushes again 5 s later.
{
  seen.length = 0
  const mem = new Map([['cardi-golf-auth', JSON.stringify(stored)]])
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) }
  const sb = createClient(url, ANON, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'cardi-golf-auth', storage } })
  refreshStatus = 502
  const t0 = Date.now()
  await sb.from('scores').upsert({ round_id: 'r', player_id: 'p', hole: 16, strokes: 5, putts: 2, picked_up: false, entered_by: 'p', client_ts: 'now' }, { onConflict: 'round_id,player_id,hole' })
  const tFail = Date.now()
  refreshStatus = 200 // auth reachable again
  await new Promise((r) => setTimeout(r, 5000))
  const n0 = seen.length
  const up2 = await sb.from('scores').upsert({ round_id: 'r', player_id: 'p', hole: 17, strokes: 4, putts: 2, picked_up: false, entered_by: 'p', client_ts: 'now' }, { onConflict: 'round_id,player_id,hole' })
  console.log('C) same client, refresh 502s for', Math.round((tFail - t0) / 1000), 's, then auth is back; push again 5 s later:')
  console.log('  requests after auth came back', JSON.stringify(seen.slice(n0)))
  console.log('  second upsert error.message ->', JSON.stringify(up2.error?.message ?? null))
  sb.auth.stopAutoRefresh()
}
server.close()
process.exit(0)
