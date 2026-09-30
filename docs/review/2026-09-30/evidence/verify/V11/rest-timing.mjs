// V11 / REL-11: time the pieces of the save→other-phone path that are REST calls, from Node to production,
// with the PUBLIC anon key only (no session: RLS returns [] for every Ensayo table, but PostgREST still plans,
// runs the RLS predicate and answers). Reads only. Prints timings and sizes, never row data.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
const SB = 'https://gmohwledjejlhcwqjnhd.supabase.co'
const ANON = /VITE_SUPABASE_ANON_KEY=(\S+)/.exec(readFileSync('/home/user/Cardi-Golf/.env.example', 'utf8'))[1]
const B = JSON.parse(readFileSync('/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/baseline/e2e-smoke/backup2.json', 'utf8'))
const T = B.tables
const tid = B.tournamentId
const roundIds = T.rounds.map((r) => r.id)
const lotIds = T.calcutta_lots.map((l) => l.id)
const courseIds = [...new Set(T.rounds.map((r) => r.course_id).filter(Boolean))]
const groupIds = T.groups.map((g) => g.id)
const teeIds = T.tees.map((t) => t.id)
const H = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Accept-Encoding': 'gzip, br', 'Accept-Profile': 'public' }
const page = 'offset=0&limit=1000'
const q = (table) => `${table}?select=*&tournament_id=eq.${tid}&order=id.asc&${page}`
const inl = (table, col, ids, order) => `${table}?select=*&${col}=in.(${ids.join(',')})&${order.map((c) => `order=${c}.asc`).join('&')}&${page}`
const stage1 = [
  ['tournaments', `tournaments?select=*&id=eq.${tid}`, { Accept: 'application/vnd.pgrst.object+json' }],
  ['players', q('players')], ['rounds', q('rounds')], ['pairs', q('pairs')], ['teams', q('teams')], ['calcutta_lots', q('calcutta_lots')], ['payments', q('payments')],
  ['game_entries', inl('game_entries', 'tournament_id', [tid], ['game_id', 'player_id'])], ['game_results', inl('game_results', 'tournament_id', [tid], ['game_id', 'player_id'])],
]
const stage2 = [
  ['groups', inl('groups', 'round_id', roundIds, ['id'])], ['round_tees', inl('round_tees', 'round_id', roundIds, ['round_id', 'player_id'])],
  ['scores', inl('scores', 'round_id', roundIds, ['id'])], ['snake_tiebreaks', inl('snake_tiebreaks', 'round_id', roundIds, ['round_id', 'group_id', 'hole'])],
  ['card_signatures', inl('card_signatures', 'round_id', roundIds, ['round_id', 'pair_id'])], ['handicap_overrides', inl('handicap_overrides', 'round_id', roundIds, ['round_id', 'player_id'])],
  ['calcutta_bids', inl('calcutta_bids', 'lot_id', lotIds, ['id'])], ['calcutta_buybacks', inl('calcutta_buybacks', 'lot_id', lotIds, ['lot_id'])],
  ['courses', inl('courses', 'id', courseIds, ['id'])], ['tees', inl('tees', 'course_id', courseIds, ['id'])], ['hole_awards', inl('hole_awards', 'round_id', roundIds, ['round_id', 'game_id', 'hole', 'player_id'])],
]
const stage3 = [['group_members', inl('group_members', 'group_id', groupIds, ['group_id', 'player_id'])], ['holes', inl('holes', 'tee_id', teeIds, ['tee_id', 'number'])]]

async function get(name, path, extra = {}) {
  const t0 = performance.now()
  const res = await fetch(`${SB}/rest/v1/${path}`, { headers: { ...H, ...extra } })
  const body = await res.arrayBuffer()
  const ms = performance.now() - t0
  return { name, status: res.status, ms, upstream: Number(res.headers.get('x-envoy-upstream-service-time') ?? NaN), bytes: body.byteLength, enc: res.headers.get('content-encoding') }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
const r1 = (x) => Math.round(x * 10) / 10
const out = { load: execSync('cat /proc/loadavg').toString().trim(), rtt: [], stages: [] }
// Warm the connection (TLS through the egress proxy), then a trivial request 20x = network RTT + gateway.
for (let i = 0; i < 3; i++) await get('warm', `rounds?select=id&id=eq.00000000-0000-0000-0000-000000000000`)
for (let i = 0; i < 20; i++) out.rtt.push(await get('trivial', `rounds?select=id&id=eq.00000000-0000-0000-0000-000000000000`))
// fetchSnapshot replay: three sequential stages of parallel requests, 10x.
for (let i = 0; i < 10; i++) {
  const t0 = performance.now()
  const s1 = await Promise.all(stage1.map(([n, p, x]) => get(n, p, x)))
  const t1 = performance.now()
  const s2 = await Promise.all(stage2.map(([n, p]) => get(n, p)))
  const t2 = performance.now()
  const s3 = await Promise.all(stage3.map(([n, p]) => get(n, p)))
  const t3 = performance.now()
  out.stages.push({ s1: t1 - t0, s2: t2 - t1, s3: t3 - t2, total: t3 - t0, requests: s1.length + s2.length + s3.length, maxUpstream: Math.max(...[...s1, ...s2, ...s3].map((r) => r.upstream)), statuses: [...new Set([...s1, ...s2, ...s3].map((r) => r.status))], upstreamByTable: Object.fromEntries([...s1, ...s2, ...s3].map((r) => [r.name, r.upstream])) })
}
out.loadAfter = execSync('cat /proc/loadavg').toString().trim()
const summary = {
  load: out.load, loadAfter: out.loadAfter,
  trivial_ms_median: r1(med(out.rtt.map((r) => r.ms))), trivial_ms_min: r1(Math.min(...out.rtt.map((r) => r.ms))), trivial_upstream_median: med(out.rtt.map((r) => r.upstream)),
  snapshot_total_ms_median: r1(med(out.stages.map((s) => s.total))), snapshot_total_ms_min: r1(Math.min(...out.stages.map((s) => s.total))),
  stage_ms_median: { s1: r1(med(out.stages.map((s) => s.s1))), s2: r1(med(out.stages.map((s) => s.s2))), s3: r1(med(out.stages.map((s) => s.s3))) },
  requests_per_snapshot: out.stages[0].requests, statuses: out.stages[0].statuses,
  upstream_median_by_table: Object.fromEntries(Object.keys(out.stages[0].upstreamByTable).map((k) => [k, med(out.stages.map((s) => s.upstreamByTable[k]))])),
}
console.log(JSON.stringify(summary, null, 1))
writeFileSync('/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V11/rest-timing.json', JSON.stringify({ summary, raw: out }, null, 1))
