// Passive Realtime listener as the anon role (no sign-in, public key only).
// Subscribes to postgres_changes on the tables Polo's client subscribes to and
// logs table, event type and the KEY NAMES of the old/new record — never values.
import { createClient } from '@supabase/supabase-js'
const URL = 'https://gmohwledjejlhcwqjnhd.supabase.co'
const KEY = 'sb_publishable_AfdMuv4UnxfuskCeC-JCJw_iuEJB6sK'
const TABLES = ['tournaments','players','pairs','teams','team_members','rounds','groups','group_members','round_tees','scores','snake_tiebreaks','card_signatures','handicap_overrides','calcutta_lots','calcutta_bids','calcutta_buybacks','payments','game_entries','hole_awards','game_results']
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const counts = {}
let ch = sb.channel('db-panel-listen')
for (const table of TABLES) {
  ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
    const k = `${p.table}:${p.eventType}`
    counts[k] = (counts[k] ?? 0) + 1
    const oldKeys = Object.keys(p.old ?? {}).sort().join(',')
    const newKeys = Object.keys(p.new ?? {}).length
    console.log(JSON.stringify({ at: new Date().toISOString(), table: p.table, event: p.eventType, oldKeys, newKeyCount: newKeys, errors: p.errors ?? null }))
  })
}
ch.subscribe((status, err) => console.log(JSON.stringify({ at: new Date().toISOString(), status, err: err ? String(err.message ?? err) : null })))
setInterval(() => console.log(JSON.stringify({ at: new Date().toISOString(), heartbeat: counts })), 300000)
setTimeout(() => { console.log(JSON.stringify({ at: new Date().toISOString(), final: counts })); process.exit(0) }, Number(process.env.LISTEN_MS ?? 5400000))
