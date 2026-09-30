// Control experiment: the same JWT subscribes to postgres_changes with (a) only `scores`, (b) the app's full
// REALTIME_TABLES list (incl. `teams`, `team_members`, which are not in the supabase_realtime publication).
// Then one no-op score upsert. Which channel receives the change?
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { WebSocket as UWS, ProxyAgent } from 'undici'
import { E, SB_URL, ANON, sleep } from './lib.mjs'

const agent = new ProxyAgent(process.env.HTTPS_PROXY)
class ProxiedWS extends UWS {
  constructor(url, protocols) {
    super(url, { protocols, dispatcher: agent })
  }
}
const st = JSON.parse(readFileSync(`${E}/state/nico-A.json`, 'utf8'))
const ls = st.origins.find((o) => o.origin === 'http://127.0.0.1:4173').localStorage.find((x) => x.name === 'cardi-golf-auth')
const sess = JSON.parse(ls.value)
const jwt = sess.access_token
const before = JSON.parse(readFileSync(`${E}/state/ensayo-before.json`, 'utf8'))
const r2 = before.rounds.find((r) => r.number === 2).id
const me = before.membership.playerId
const row = before.scores.find((s) => s.round_id === r2 && s.player_id === me && s.hole === 18)

const APP_TABLES = ['tournaments', 'players', 'pairs', 'teams', 'team_members', 'rounds', 'groups', 'group_members', 'round_tees', 'scores', 'snake_tiebreaks', 'card_signatures', 'handicap_overrides', 'calcutta_lots', 'calcutta_bids', 'calcutta_buybacks', 'payments', 'game_entries', 'hole_awards', 'game_results']
const variants = { onlyScores: ['scores'], appList: APP_TABLES, appListWithoutTeams: APP_TABLES.filter((t) => t !== 'teams' && t !== 'team_members') }
const results = {}
const clients = []
for (const [name, tables] of Object.entries(variants)) {
  const sb = createClient(SB_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ProxiedWS }, global: { headers: { Authorization: `Bearer ${jwt}` } } })
  sb.realtime.setAuth(jwt)
  results[name] = { status: [], events: [], system: [] }
  let ch = sb.channel(`probe-${name}-${Date.now()}`)
  for (const table of tables) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => results[name].events.push({ at: Date.now(), table: p.table, type: p.eventType }))
  ch = ch.on('system', {}, (p) => results[name].system.push(String(p?.message ?? JSON.stringify(p)).slice(0, 140)))
  ch.subscribe((s) => results[name].status.push(s))
  clients.push(sb)
}
await sleep(6000)
const tWrite = Date.now()
const res = await fetch(`${SB_URL}/rest/v1/scores?on_conflict=round_id,player_id,hole`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ round_id: row.round_id, player_id: row.player_id, hole: row.hole, strokes: row.strokes, putts: row.putts, picked_up: row.picked_up, entered_by: row.entered_by, client_ts: row.client_ts }),
})
console.log('no-op upsert status', res.status)
await sleep(7000)
for (const [name, r] of Object.entries(results)) console.log(name, JSON.stringify({ status: r.status, system: r.system, events: r.events.map((e) => ({ ms: e.at - tWrite, table: e.table, type: e.type })) }))
for (const c of clients) await c.removeAllChannels()
process.exit(0)
