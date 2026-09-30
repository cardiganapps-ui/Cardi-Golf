// V9 / REL-01 delivery check: with the same session claimed as Nico (Ensayo only), three channels
// (the app's exact 20-table channel, the same without teams/team_members, only scores) listen while ONE
// value-preserving upsert rewrites Nico's own round-2 hole-18 row with its current values
// (same strokes/putts/picked_up/entered_by/client_ts). Which channels receive the change?
// The row is read before and after (every column but updated_at must be equal); the claim is released at the end.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { WebSocket as UWS, ProxyAgent } from 'undici'

const V = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V9'
const env = readFileSync('/home/user/Cardi-Golf/.env.example', 'utf8')
const URL_ = /VITE_SUPABASE_URL=(\S+)/.exec(env)[1]
const ANON = /VITE_SUPABASE_ANON_KEY=(\S+)/.exec(env)[1]
const src = readFileSync('/home/user/Cardi-Golf/src/data/tournamentStore.ts', 'utf8')
const APP_TABLES = [.../const REALTIME_TABLES = \[([\s\S]*?)\]/.exec(src)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
const ENSAYO = '8b40f02b-e8be-4cd7-a93a-b42d450f5fda'
const NICO = '962ab37f-1f8e-43ea-b896-ede86866df40'
const R2 = 'a1852b80-3a0b-4148-8853-b630432dfd0e'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const agent = new ProxyAgent(process.env.HTTPS_PROXY)
class ProxiedWS extends UWS {
  constructor(url, protocols) {
    super(url, { protocols, dispatcher: agent })
  }
}
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a)

const sessFile = `${V}/anon-session.json`
let session = JSON.parse(readFileSync(sessFile, 'utf8'))
if (session.expires_at * 1000 < Date.now() + 120_000) {
  const sb0 = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb0.auth.refreshSession({ refresh_token: session.refresh_token })
  if (error) throw error
  session = data.session
  writeFileSync(sessFile, JSON.stringify(session))
  log('refreshed stored anonymous session')
}
const jwt = session.access_token
const H = { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }
const rpc = async (name, args) => {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: H, body: JSON.stringify(args ?? {}) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
const rowSel = `scores?round_id=eq.${R2}&player_id=eq.${NICO}&hole=eq.18&select=*`
const getRow = async () => (await (await fetch(`${URL_}/rest/v1/${rowSel}`, { headers: H })).json())[0]

log('membership before claim', JSON.stringify((await rpc('my_membership', { tid: ENSAYO })).body))
const claim = await rpc('claim_player', { p_player_id: NICO, p_pin: '1234' })
log('claim_player', claim.status, JSON.stringify({ ok: claim.body?.ok, reason: claim.body?.reason }))
if (!claim.body?.ok) process.exit(1)
const round = (await (await fetch(`${URL_}/rest/v1/rounds?id=eq.${R2}&select=number,status`, { headers: H })).json())[0]
log('round 2 status', round.status)
const before = await getRow()
const show = (r) => ({ strokes: r.strokes, putts: r.putts, picked_up: r.picked_up, entered_by: r.entered_by?.slice(0, 4), client_ts: r.client_ts, disputed: r.disputed, previous: r.previous, reason: r.reason, updated_at: r.updated_at })
log('row before', JSON.stringify(show(before)))
if (before.disputed || before.reason) throw new Error('row is not a clean row; aborting')

const variants = { app: APP_TABLES, appWithoutTeams: APP_TABLES.filter((t) => t !== 'teams' && t !== 'team_members'), onlyScores: ['scores'] }
const res = {}
const clients = []
for (const [name, tables] of Object.entries(variants)) {
  const sb = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ProxiedWS }, global: { headers: { Authorization: `Bearer ${jwt}` } } })
  sb.realtime.setAuth(jwt)
  const r = (res[name] = { status: [], system: [], events: [] })
  let ch = sb.channel(name === 'onlyScores' ? `probe-scores-${Date.now()}` : `tournament:${ENSAYO}`)
  for (const table of tables) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => r.events.push({ at: Date.now(), table: p.table, type: p.eventType }))
  ch = ch.on('system', {}, (p) => r.system.push(`${p?.status}: ${String(p?.message ?? '').slice(0, 90)}`))
  ch.subscribe((s) => r.status.push(s))
  clients.push(sb)
}
await sleep(6000)
const tWrite = Date.now()
const w = await fetch(`${URL_}/rest/v1/scores?on_conflict=round_id,player_id,hole`, {
  method: 'POST',
  headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ round_id: before.round_id, player_id: before.player_id, hole: before.hole, strokes: before.strokes, putts: before.putts, picked_up: before.picked_up, entered_by: before.entered_by, client_ts: before.client_ts }),
})
log('value-preserving upsert', w.status)
await sleep(8000)
for (const [name, r] of Object.entries(res)) log(name.padEnd(16), JSON.stringify({ status: r.status, system: r.system, events: r.events.map((e) => ({ ms: e.at - tWrite, table: e.table, type: e.type })) }))
const after = await getRow()
log('row after ', JSON.stringify(show(after)))
const same = ['strokes', 'putts', 'picked_up', 'entered_by', 'client_ts', 'disputed', 'previous', 'reason'].every((k) => JSON.stringify(before[k]) === JSON.stringify(after[k]))
log('every column but updated_at unchanged:', same)
for (const c of clients) await c.removeAllChannels()
const rel = await rpc('release_device', {})
log('release_device', rel.status, 'membership after', JSON.stringify((await rpc('my_membership', { tid: ENSAYO })).body))
writeFileSync(`${V}/rt-delivery-result.json`, JSON.stringify({ at: new Date().toISOString(), res, tWrite, before: show(before), after: show(after), same }, null, 1))
process.exit(0)
