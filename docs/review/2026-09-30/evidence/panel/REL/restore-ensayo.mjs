// Restore Ensayo's score rows to the recorded before-state (as Nico, an admin player = organizer by RLS).
// Rows whose id changed (deleted and re-created by the race tests) are deleted and re-inserted with their
// original id; the rest are upserted in place with their original values, entered_by and client_ts.
// Rounds are set back to the recorded statuses if they differ. Dry run unless --apply.
import { readFileSync } from 'node:fs'
import { E, SB_URL, ANON, STORAGE_KEY, rest } from './lib.mjs'

const apply = process.argv.includes('--apply')
const before = JSON.parse(readFileSync(`${E}/state/ensayo-before.json`, 'utf8'))
const now = JSON.parse(readFileSync(`${E}/state/${process.argv[2] ?? 'ensayo-after-restart.json'}`, 'utf8'))
const st = JSON.parse(readFileSync(`${E}/state/nico-A.json`, 'utf8'))
const jwt = JSON.parse(st.origins.find((o) => o.localStorage.some((x) => x.name === STORAGE_KEY)).localStorage.find((x) => x.name === STORAGE_KEY).value).access_token
const H = { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }
const key = (x) => `${x.round_id}:${x.player_id}:${x.hole}`
const B = new Map(before.scores.map((x) => [key(x), x]))
const N = new Map(now.scores.map((x) => [key(x), x]))
const fields = ['strokes', 'putts', 'picked_up', 'entered_by', 'client_ts', 'disputed', 'previous', 'reason']
const recreate = []
const upsert = []
const del = []
for (const [k, o] of B) {
  const x = N.get(k)
  if (!x) {
    recreate.push(o)
    continue
  }
  if (x.id !== o.id) {
    del.push(x)
    recreate.push(o)
  } else if (fields.some((f) => JSON.stringify(o[f]) !== JSON.stringify(x[f]))) upsert.push(o)
}
for (const [k, x] of N) if (!B.has(k)) del.push(x)
console.log('plan: delete', del.length, 're-insert with original id', recreate.length, 'upsert in place', upsert.length)
const disputedInUpsert = upsert.filter((o) => N.get(key(o)).disputed)
if (disputedInUpsert.length) console.log('WARNING: in-place rows currently disputed (an upsert cannot clear the flag):', disputedInUpsert.length)
const roundFix = before.rounds.filter((r) => now.rounds.find((x) => x.id === r.id)?.status !== r.status)
console.log('rounds to reset:', roundFix.map((r) => `${r.number}→${r.status}`).join(',') || 'none')
if (!apply) process.exit(0)

for (const r of roundFix) {
  const res = await fetch(`${SB_URL}/rest/v1/rounds?id=eq.${r.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ status: r.status }) })
  console.log('round', r.number, '→', r.status, res.status)
}
for (const x of del) {
  const res = await fetch(`${SB_URL}/rest/v1/scores?id=eq.${x.id}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } })
  if (res.status >= 300) console.log('delete failed', res.status, await res.text())
}
const pick = (o, withId) => ({ ...(withId ? { id: o.id } : {}), round_id: o.round_id, player_id: o.player_id, hole: o.hole, strokes: o.strokes, putts: o.putts, picked_up: o.picked_up, entered_by: o.entered_by, client_ts: o.client_ts })
if (recreate.length) {
  const res = await fetch(`${SB_URL}/rest/v1/scores`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(recreate.map((o) => pick(o, true))) })
  console.log('re-insert', recreate.length, res.status, res.status >= 300 ? await res.text() : '')
}
if (upsert.length) {
  const res = await fetch(`${SB_URL}/rest/v1/scores?on_conflict=round_id,player_id,hole`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(upsert.map((o) => pick(o, false))) })
  console.log('upsert', upsert.length, res.status, res.status >= 300 ? await res.text() : '')
}
const check = (await rest(`scores?round_id=eq.${before.rounds.find((r) => r.number === 2).id}&disputed=is.true&select=hole`, jwt)).body
console.log('disputed rows in round 2 after restore:', check.length)
