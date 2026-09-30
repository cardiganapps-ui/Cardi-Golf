// Runs the queries src/data/tournamentStore.ts fetchSnapshot issues (PostgREST page 0..999, same
// filters and ORDER BY) as a PIN-claimed player, and sums server execution time per table.
import { execFileSync } from 'node:child_process'
const [tag, dev] = process.argv.slice(2)
const q = (sql) => execFileSync('psql', ['-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', '-X', '-At', '-d', 'db_db', '-c', sql], { encoding: 'utf8' })
const tid = q(`select md5('t:${tag}')::uuid`).trim()
const rounds = q(`select string_agg(quote_literal(id), ',') from public.rounds where tournament_id = '${tid}'`).trim()
const groups = q(`select string_agg(quote_literal(g.id), ',') from public.groups g join public.rounds r on r.id = g.round_id where r.tournament_id = '${tid}'`).trim()
const lots = q(`select coalesce(string_agg(quote_literal(id), ','), 'null') from public.calcutta_lots where tournament_id = '${tid}'`).trim()
const tees = q(`select string_agg(quote_literal(t.id), ',') from public.tees t where t.course_id in (select course_id from public.rounds where tournament_id = '${tid}')`).trim()
const courses = q(`select string_agg(distinct quote_literal(course_id), ',') from public.rounds where tournament_id = '${tid}'`).trim()
const Q = {
  tournaments: `select * from public.tournaments where id = '${tid}'`,
  players: `select * from public.players where tournament_id = '${tid}' order by id limit 1000`,
  rounds: `select * from public.rounds where tournament_id = '${tid}' order by id limit 1000`,
  pairs: `select * from public.pairs where tournament_id = '${tid}' order by id limit 1000`,
  teams: `select * from public.teams where tournament_id = '${tid}' order by id limit 1000`,
  calcutta_lots: `select * from public.calcutta_lots where tournament_id = '${tid}' order by id limit 1000`,
  payments: `select * from public.payments where tournament_id = '${tid}' order by id limit 1000`,
  game_entries: `select * from public.game_entries where tournament_id in ('${tid}') order by game_id, player_id limit 1000`,
  game_results: `select * from public.game_results where tournament_id in ('${tid}') order by game_id, player_id limit 1000`,
  groups: `select * from public.groups where round_id in (${rounds}) order by id limit 1000`,
  round_tees: `select * from public.round_tees where round_id in (${rounds}) order by round_id, player_id limit 1000`,
  scores: `select * from public.scores where round_id in (${rounds}) order by id limit 1000`,
  scores_page2: `select * from public.scores where round_id in (${rounds}) order by id limit 1000 offset 1000`,
  snake_tiebreaks: `select * from public.snake_tiebreaks where round_id in (${rounds}) order by round_id, group_id, hole limit 1000`,
  card_signatures: `select * from public.card_signatures where round_id in (${rounds}) order by round_id, pair_id limit 1000`,
  handicap_overrides: `select * from public.handicap_overrides where round_id in (${rounds}) order by round_id, player_id limit 1000`,
  calcutta_bids: `select * from public.calcutta_bids where lot_id in (${lots}) order by id limit 1000`,
  calcutta_buybacks: `select * from public.calcutta_buybacks where lot_id in (${lots}) order by lot_id limit 1000`,
  courses: `select * from public.courses where id in (${courses}) order by id limit 1000`,
  tees: `select * from public.tees where course_id in (${courses}) order by id limit 1000`,
  hole_awards: `select * from public.hole_awards where round_id in (${rounds}) order by round_id, game_id, hole, player_id limit 1000`,
  group_members: `select * from public.group_members where group_id in (${groups}) order by group_id, player_id limit 1000`,
  holes: `select * from public.holes where tee_id in (${tees}) order by tee_id, number limit 1000`,
  team_members: `select * from public.team_members where team_id in (select id from public.teams where false) order by team_id, player_id limit 1000`,
}
let total = 0
const rows = []
for (const [name, sql] of Object.entries(Q)) {
  const out = q(`begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', md5('${dev}')::uuid, 'role', 'authenticated', 'is_anonymous', true)::text, true); explain (analyze, costs off, summary on, format json) ${sql}; rollback;`)
  const lines = out.split('\n'); const start = lines.findIndex((l) => l.startsWith('[')); const json = JSON.parse(lines.slice(start).join('\n').replace(/\nROLLBACK[\s\S]*$/, ''))
  const ms = json[0]['Execution Time']
  const n = json[0].Plan['Actual Rows']
  total += ms
  rows.push(`${name.padEnd(20)} ${String(n).padStart(5)} rows ${ms.toFixed(1).padStart(9)} ms`)
}
console.log(rows.join('\n'))
console.log(`TOTAL server time for one reload (${tag}, player): ${total.toFixed(0)} ms`)
