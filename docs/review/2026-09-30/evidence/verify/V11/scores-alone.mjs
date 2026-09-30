// Standalone (no concurrency) timing of the snapshot's scores query and a few controls, anon key, reads only.
import { readFileSync, writeFileSync } from 'node:fs'
const SB = 'https://gmohwledjejlhcwqjnhd.supabase.co'
const ANON = /VITE_SUPABASE_ANON_KEY=(\S+)/.exec(readFileSync('/home/user/Cardi-Golf/.env.example', 'utf8'))[1]
const B = JSON.parse(readFileSync('/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/baseline/e2e-smoke/backup2.json', 'utf8'))
const R = B.tables.rounds.map((r) => r.id)
const H = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Accept-Encoding': 'gzip, br' }
const variants = {
  'scores, both rounds (the app query)': `scores?select=*&round_id=in.(${R.join(',')})&order=id.asc&offset=0&limit=1000`,
  'scores, round 1 only': `scores?select=*&round_id=eq.${R[0]}&order=id.asc&offset=0&limit=1000`,
  'scores, round 2 only': `scores?select=*&round_id=eq.${R[1]}&order=id.asc&offset=0&limit=1000`,
  'scores, one hole of round 2': `scores?select=*&round_id=eq.${R[1]}&hole=eq.12&order=id.asc`,
  'group_members (24 rows)': `group_members?select=*&group_id=in.(${B.tables.groups.map((g) => g.id).join(',')})&order=group_id.asc&order=player_id.asc`,
  'trivial (no row)': `rounds?select=id&id=eq.00000000-0000-0000-0000-000000000000`,
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)] }
const out = {}
for (let rep = 0; rep < 2; rep++) await fetch(`${SB}/rest/v1/${variants['trivial (no row)']}`, { headers: H }).then((r) => r.arrayBuffer())
for (const [name, path] of Object.entries(variants)) {
  const up = [], wall = []
  for (let i = 0; i < 8; i++) {
    const t0 = performance.now()
    const res = await fetch(`${SB}/rest/v1/${path}`, { headers: H })
    await res.arrayBuffer()
    wall.push(performance.now() - t0)
    up.push(Number(res.headers.get('x-envoy-upstream-service-time')))
  }
  out[name] = { upstream_median_ms: med(up), upstream_min_ms: Math.min(...up), upstream_max_ms: Math.max(...up), wall_median_ms: Math.round(med(wall)) }
}
console.log(JSON.stringify(out, null, 1))
writeFileSync('/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V11/scores-alone.json', JSON.stringify(out, null, 1))
