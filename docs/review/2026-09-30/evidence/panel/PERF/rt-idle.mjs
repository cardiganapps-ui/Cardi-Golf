// Idle cost of the app's Realtime channel: frames and bytes per minute, heartbeat cadence, join size.
// Same channel shape as tournamentStore.subscribe() (20 postgres_changes bindings), Nico's JWT, through the egress proxy.
// usage: NODE_USE_ENV_PROXY=1 node rt-idle.mjs [seconds=130]
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { WebSocket as UWS, ProxyAgent } from 'undici'
import { E, load } from './perf-lib.mjs'

const SECS = Number(process.argv[2] ?? 130)
const SB_URL = 'https://gmohwledjejlhcwqjnhd.supabase.co'
const ANON = /VITE_SUPABASE_ANON_KEY=(\S+)/.exec(readFileSync('/home/user/Cardi-Golf/.env.example', 'utf8'))[1]
const st = JSON.parse(readFileSync(`${E}/state/nico-perf-golf_cardigan_mx.json`, 'utf8'))
const ls = st.origins.find((o) => o.origin === 'https://golf.cardigan.mx').localStorage.find((x) => x.name === 'cardi-golf-auth')
const jwt = JSON.parse(ls.value).access_token
const frames = []
const t0 = Date.now()
const agent = new ProxyAgent(process.env.HTTPS_PROXY)
class CountingWS extends UWS {
  constructor(url, protocols) {
    super(url, { protocols, dispatcher: agent })
    this.addEventListener('message', (m) => frames.push({ t: Date.now() - t0, dir: 'in', bytes: Buffer.byteLength(typeof m.data === 'string' ? m.data : Buffer.from(m.data)), head: String(m.data).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>').slice(0, 90) }))
  }
  send(d) {
    frames.push({ t: Date.now() - t0, dir: 'out', bytes: Buffer.byteLength(d), head: String(d).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>').slice(0, 90) })
    return super.send(d)
  }
}
const TABLES = ['tournaments', 'players', 'pairs', 'teams', 'team_members', 'rounds', 'groups', 'group_members', 'round_tees', 'scores', 'snake_tiebreaks', 'card_signatures', 'handicap_overrides', 'calcutta_lots', 'calcutta_bids', 'calcutta_buybacks', 'payments', 'game_entries', 'hole_awards', 'game_results']
const sb = createClient(SB_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: CountingWS, params: { eventsPerSecond: 10 } }, global: { headers: { Authorization: `Bearer ${jwt}` } } })
sb.realtime.setAuth(jwt)
const tid = (await (await fetch(`${SB_URL}/rest/v1/tournaments?slug=eq.ensayo&select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } })).json())[0].id
let ch = sb.channel(`tournament:${tid}`)
for (const table of TABLES) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {})
const statuses = []
ch.subscribe((s) => statuses.push([Date.now() - t0, s]))
await new Promise((r) => setTimeout(r, SECS * 1000))
await sb.removeAllChannels()
const inF = frames.filter((f) => f.dir === 'in')
const outF = frames.filter((f) => f.dir === 'out')
const hb = outF.filter((f) => f.head.includes('heartbeat')).map((f) => f.t)
const res = {
  seconds: SECS,
  load: load(),
  statuses,
  join: outF.find((f) => f.head.includes('phx_join')),
  joinReplyBytes: inF.find((f) => f.head.includes('phx_reply'))?.bytes,
  heartbeatsSent: hb.length,
  heartbeatGapsMs: hb.slice(1).map((t, i) => t - hb[i]),
  framesIn: inF.length,
  framesOut: outF.length,
  bytesIn: inF.reduce((a, f) => a + f.bytes, 0),
  bytesOut: outF.reduce((a, f) => a + f.bytes, 0),
  frames: frames.map((f) => `${f.t}ms ${f.dir} ${f.bytes}B ${f.head}`),
}
const idle = frames.filter((f) => f.t > 10000)
res.idlePerMinute = { frames: +((idle.length / (SECS - 10)) * 60).toFixed(1), bytes: Math.round((idle.reduce((a, f) => a + f.bytes, 0) / (SECS - 10)) * 60) }
writeFileSync(`${E}/rt-idle-${Date.now()}.json`, JSON.stringify(res, null, 2))
console.log(JSON.stringify({ ...res, frames: res.frames.slice(0, 12) }, null, 1))
process.exit(0)
