// One burst: N phones refetch at once after a hole is saved -> N concurrent copies of the snapshot's scores query
// (anon key, Ensayo round ids, reads only; RLS returns [] but runs the per-row policy). Run once per N.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
const SB = 'https://gmohwledjejlhcwqjnhd.supabase.co'
const ANON = /VITE_SUPABASE_ANON_KEY=(\S+)/.exec(readFileSync('/home/user/Cardi-Golf/.env.example', 'utf8'))[1]
const B = JSON.parse(readFileSync('/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/baseline/e2e-smoke/backup2.json', 'utf8'))
const R = B.tables.rounds.map((r) => r.id)
const H = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Accept-Encoding': 'gzip, br' }
const path = `scores?select=*&round_id=in.(${R.join(',')})&order=id.asc&offset=0&limit=1000`
const N = Number(process.argv[2] ?? 12)
await fetch(`${SB}/rest/v1/rounds?select=id&id=eq.00000000-0000-0000-0000-000000000000`, { headers: H }).then((r) => r.arrayBuffer())
const load = execSync('cat /proc/loadavg').toString().trim()
const t0 = performance.now()
const res = await Promise.all(Array.from({ length: N }, async () => {
  const t = performance.now()
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H })
  const text = await r.text()
  const body = r.status === 200 ? '' : text.slice(0, 160)
  return { wall: performance.now() - t, up: Number(r.headers.get("x-envoy-upstream-service-time")), status: r.status, body }
}))
const wall = performance.now() - t0
const ups = res.map((r) => r.up).sort((a, b) => a - b)
const out = { N, load, burst_wall_ms: Math.round(wall), upstream_ms_sorted: ups, perRequest: res.map((r) => [r.status, r.up, r.body]).sort((a, b) => a[1] - b[1]) }
console.log(JSON.stringify(out))
writeFileSync(`/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V11/burst-${N}.json`, JSON.stringify(out, null, 1))
