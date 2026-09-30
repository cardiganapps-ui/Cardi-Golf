// V9 / REL-01: does Supabase Realtime accept the app's exact postgres_changes channel?
// One anonymous session that claims nothing (plus one variant with the bare anon key, no session).
// Variants: the app's REALTIME_TABLES (parsed from the source), the same list without teams/team_members,
// only teams, only team_members. Records every subscribe() status and every `system` frame for ~35 s.
// usage: NODE_USE_ENV_PROXY=1 node rt-subscribe.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { WebSocket as UWS, ProxyAgent } from 'undici'

const V = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V9'
const env = readFileSync('/home/user/Cardi-Golf/.env.example', 'utf8')
const URL_ = /VITE_SUPABASE_URL=(\S+)/.exec(env)[1]
const ANON = /VITE_SUPABASE_ANON_KEY=(\S+)/.exec(env)[1]
const src = readFileSync('/home/user/Cardi-Golf/src/data/tournamentStore.ts', 'utf8')
const APP_TABLES = [.../const REALTIME_TABLES = \[([\s\S]*?)\]/.exec(src)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
const ENSAYO = '8b40f02b-e8be-4cd7-a93a-b42d450f5fda'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const agent = new ProxyAgent(process.env.HTTPS_PROXY)
const frames = []
function transportFor(tag) {
  return class ProxiedWS extends UWS {
    constructor(url, protocols) {
      super(url, { protocols, dispatcher: agent })
      this.addEventListener('message', (e) => {
        const s = typeof e.data === 'string' ? e.data : ''
        if (/"system"|phx_reply|phx_error|phx_close/.test(s)) frames.push({ tag, at: Date.now(), frame: s.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>').slice(0, 600) })
      })
    }
  }
}

// --- one anonymous session, reused across runs (never printed) ---
const sessFile = `${V}/anon-session.json`
let session
if (existsSync(sessFile)) {
  session = JSON.parse(readFileSync(sessFile, 'utf8'))
  if (session.expires_at * 1000 < Date.now() + 60_000) {
    const sb = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await sb.auth.refreshSession({ refresh_token: session.refresh_token })
    if (error) throw error
    session = data.session
    writeFileSync(sessFile, JSON.stringify(session))
    console.log('refreshed stored anonymous session')
  }
} else {
  const sb = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb.auth.signInAnonymously()
  if (error) throw error
  session = data.session
  writeFileSync(sessFile, JSON.stringify(session))
  console.log('signed in anonymously (one call)')
}
const jwt = session.access_token
console.log('session: anonymous', session.user?.is_anonymous, 'uid', session.user?.id?.slice(0, 8))
console.log('app REALTIME_TABLES', APP_TABLES.length, APP_TABLES.join(','))

const variants = {
  app: { tables: APP_TABLES, topic: `tournament:${ENSAYO}`, auth: true },
  appWithoutTeams: { tables: APP_TABLES.filter((t) => t !== 'teams' && t !== 'team_members'), topic: `tournament:${ENSAYO}`, auth: true },
  onlyTeams: { tables: ['teams'], topic: `probe-teams`, auth: true },
  onlyTeamMembers: { tables: ['team_members'], topic: `probe-team-members`, auth: true },
  onlyScores: { tables: ['scores'], topic: `probe-scores`, auth: true },
  appBareAnonKey: { tables: APP_TABLES, topic: `tournament:${ENSAYO}`, auth: false },
}
const results = {}
const clients = []
const t0 = Date.now()
for (const [name, v] of Object.entries(variants)) {
  const sb = createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: transportFor(name), params: { eventsPerSecond: 10 } },
    ...(v.auth ? { global: { headers: { Authorization: `Bearer ${jwt}` } } } : {}),
  })
  if (v.auth) sb.realtime.setAuth(jwt)
  const r = (results[name] = { tables: v.tables.length, status: [], system: [], channelStateAfter: null })
  let ch = sb.channel(v.topic)
  // Same shape as tournamentStore.subscribe(): one binding per table, event '*', schema public, no filter.
  for (const table of v.tables) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {})
  ch = ch.on('system', {}, (p) => r.system.push({ ms: Date.now() - t0, status: p?.status, extension: p?.extension, message: String(p?.message ?? '').slice(0, 220) }))
  ch.subscribe((s, err) => r.status.push({ ms: Date.now() - t0, s, err: err ? String(err.message ?? err) : undefined }))
  clients.push([name, sb, ch])
}
await sleep(35_000)
for (const [name, sb, ch] of clients) results[name].channelStateAfter = ch.state
console.log(JSON.stringify(results, null, 1))
writeFileSync(`${V}/rt-subscribe-result.json`, JSON.stringify({ at: new Date().toISOString(), appTables: APP_TABLES, results, frames }, null, 1))
for (const [, sb] of clients) await sb.removeAllChannels()
process.exit(0)
