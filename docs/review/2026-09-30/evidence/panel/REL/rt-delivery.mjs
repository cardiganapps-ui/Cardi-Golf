// Does a score write reach another phone over Realtime? Phone B (bridged socket) listens; Node writes
// one existing Ensayo score row back with its current values (no value change) using Nico's JWT.
import { readFileSync } from 'node:fs'
import { launch, newPhone, E, BASE, sleep, bridgeRealtime, sessionOf, SB_URL, ANON } from './lib.mjs'

const before = JSON.parse(readFileSync(`${E}/state/ensayo-before.json`, 'utf8'))
const r2 = before.rounds.find((r) => r.number === 2).id
const me = before.membership.playerId
const row = before.scores.find((s) => s.round_id === r2 && s.player_id === me && s.hole === 18)

const b = await launch()
const ctx = await newPhone(b, `${E}/state/nico-A.json`)
const log = []
await bridgeRealtime(ctx, { log: (x) => log.push(x) })
const page = await ctx.newPage()
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Individual', { timeout: 40000 })
await sleep(5000)
const jwt = (await sessionOf(page)).access_token
const reloads = []
page.on('request', (r) => {
  if (/rest\/v1\/tournaments\?/.test(r.url())) reloads.push(Date.now())
})
const tWrite = Date.now()
const res = await fetch(`${SB_URL}/rest/v1/scores?on_conflict=round_id,player_id,hole`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ round_id: row.round_id, player_id: row.player_id, hole: row.hole, strokes: row.strokes, putts: row.putts, picked_up: row.picked_up, entered_by: row.entered_by, client_ts: new Date().toISOString() }),
})
console.log('write status', res.status, 'at +0')
await sleep(8000)
const pc = log.filter(([t, d, s]) => d === 'recv' && /postgres_changes/.test(s))
const sys = log.filter(([t, d, s]) => d === 'recv' && /"system"/.test(s))
console.log('system msgs:', sys.map(([t, d, s]) => s.slice(0, 260)))
console.log('postgres_changes frames after write:', pc.filter(([t]) => t >= tWrite).map(([t, d, s]) => [t - tWrite, s.slice(0, 160)]))
console.log('snapshot reloads after write (ms):', reloads.map((t) => t - tWrite))
console.log('header:', JSON.stringify(await page.locator('header').first().innerText()))
await b.close()
