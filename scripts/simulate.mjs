#!/usr/bin/env node
// Simulator (CLAUDE.md §17): generates realistic rounds for a REHEARSAL
// tournament from each player's handicap. Gross over par scales with the
// handicap and the stroke index plus noise, the 3-putt chance rises with the
// handicap, pick-ups happen occasionally, and snake tiebreaks are answered.
// It can play in real time (one hole every N seconds per group) so everyone
// can watch the live boards move.
//
//   node scripts/simulate.mjs [--slug ensayo] [--round 1] [--interval 20] [--holes 18] [--reset] [--seed 7]
//
// Refuses any tournament whose slug does not start with "ensayo" (§0.1: never
// touch real tournament data). Rows are exactly what the Tarjeta screen writes.
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './lib/env.mjs'

loadEnv()
const URL_ = process.env.VITE_SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY
if (!URL_ || !SECRET) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SECRET_KEY')
  process.exit(1)
}
const args = process.argv.slice(2)
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const slug = arg('--slug', 'ensayo')
if (!slug.startsWith('ensayo')) {
  console.error('Refusing to simulate on a non-rehearsal tournament:', slug)
  process.exit(1)
}
const roundNumber = Number(arg('--round', '0'))
const interval = Number(arg('--interval', '0'))
const maxHoles = Number(arg('--holes', '18'))
const reset = args.includes('--reset')
let seed = Number(arg('--seed', Date.now() % 100000))
const rng = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const sb = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })
const must = (r, ctx) => {
  if (r.error) {
    console.error(ctx, r.error.message)
    process.exit(1)
  }
  return r.data
}

const t = must(await sb.from('tournaments').select('*').eq('slug', slug).single(), 'tournament')
const rounds = must(await sb.from('rounds').select('*').eq('tournament_id', t.id).order('number'), 'rounds')
const round = roundNumber ? rounds.find((r) => r.number === roundNumber) : rounds.find((r) => r.status !== 'finished' && r.status !== 'cancelled')
if (!round) {
  console.error('No round to simulate')
  process.exit(1)
}
// A closed day takes no hole from a phone (0026, REL-09), and the simulator writes what the Tarjeta writes.
// Its scores are the day's results: --reset would delete them behind the Comité's back.
if (round.status === 'finished' || round.status === 'cancelled') {
  console.error(
    `Day ${round.number} is ${round.status}: no phone can write a hole into it, so the simulator won't either${reset ? ', and --reset would delete the scores its results stand on' : ''}. ` +
      'Reopen it first in Comité › Rondas («Reabrir»), then run this again.',
  )
  process.exit(1)
}
const players = must(await sb.from('players').select('*').eq('tournament_id', t.id), 'players')
const groups = must(await sb.from('groups').select('id, number, start_hole, group_members!group_members_group_id_fkey(player_id)').eq('round_id', round.id).order('number'), 'groups')
if (!groups.length) {
  console.error('The round has no groups yet: build them in Comité › Grupos first.')
  process.exit(1)
}
if (!round.course_id) {
  console.error('The round has no course: load one in Comité › Campos and assign it in Rondas.')
  process.exit(1)
}
// ARCH-16: each player's strokes on each hole are the engine's own (src/data/testing/simulation.ts, loaded through
// Vite): his tee, the course handicap, the allowance, the day 2 cut and any override, as the boards will score them.
// The script used to work them out again in JS.
const roundIds = rounds.map((r) => r.id)
const courseIds = [...new Set(rounds.map((r) => r.course_id).filter(Boolean))]
const courses = must(await sb.from('courses').select('*').in('id', courseIds), 'courses')
const tees = must(await sb.from('tees').select('*').in('course_id', courseIds), 'tees')
const holes = tees.length ? must(await sb.from('holes').select('*').in('tee_id', tees.map((x) => x.id)), 'holes') : []
if (!tees.some((x) => x.course_id === round.course_id)) {
  console.error('The round has no course: load one in Comité › Campos and assign it in Rondas.')
  process.exit(1)
}
/**
 * Every row of the tournament's days, page by page in its primary key's order: a response holds at most the
 * project's «Max rows» (DB-20), and 60 players' days hold more. It ends on an empty page, never a short one.
 */
async function every(table, key) {
  const rows = []
  for (;;) {
    let q = sb.from(table).select('*').in('round_id', roundIds)
    for (const c of key) q = q.order(c)
    const page = must(await q.range(rows.length, rows.length + 999), table)
    if (!page.length) return rows
    rows.push(...page)
  }
}
const roundTees = await every('round_tees', ['round_id', 'player_id'])
const scores = await every('scores', ['id'])
const overrides = await every('handicap_overrides', ['round_id', 'player_id'])
const { runnerImport } = await import('vite')
const { module: simulation } = await runnerImport(new URL('../src/data/testing/simulation.ts', import.meta.url).pathname, { configFile: false, logLevel: 'error' })
const day = simulation.dayStrokes({ tournament: t, players, rounds, courses, tees, holes, roundTees, scores, overrides }, round.id)

if (reset) {
  must(await sb.from('snake_tiebreaks').delete().eq('round_id', round.id).select('hole'), 'reset tiebreaks')
  must(await sb.from('card_signatures').delete().eq('round_id', round.id).select('pair_id'), 'reset signatures')
  must(await sb.from('scores').delete().eq('round_id', round.id).select('hole'), 'reset scores')
}
if (round.status === 'scheduled') {
  must(await sb.from('rounds').update({ status: 'live' }).eq('id', round.id).select('id'), 'round live')
  // As «Iniciar ronda» does: the Tarjeta names the day the tournament is on (REL-08's verifier saw «día 1» over a day-2 round).
  must(await sb.from('tournaments').update({ current_round_id: round.id }).eq('id', t.id).select('id'), 'current round')
}

const holesPerRound = round.holes ?? 18
const order = (start) => Array.from({ length: holesPerRound }, (_, i) => ((start - 1 + i) % 18) + 1)
console.log(`${t.name} · día ${round.number} · ${groups.length} grupos · ${interval ? `${interval}s por hoyo` : 'de golpe'}`)

for (let i = 0; i < Math.min(maxHoles, holesPerRound); i++) {
  for (const g of groups) {
    const hole = order(g.start_hole ?? 1)[i]
    const rows = []
    const threePutters = []
    for (const gm of g.group_members) {
      const p = players.find((x) => x.id === gm.player_id)
      if (!p) continue
      const h = day.holes.get(p.id)?.get(hole)
      if (!h) continue
      const sr = h.strokesReceived
      // Noise: harder holes (low SI) skew worse; better players skew better.
      const r = rng() + (h.strokeIndex <= 6 ? 0.08 : 0) - (p.base_hcp < 10 ? 0.08 : 0)
      const noise = r < 0.12 ? -1 : r < 0.5 ? 0 : r < 0.78 ? 1 : r < 0.92 ? 2 : 3
      let strokes = Math.max(1, h.par + sr + noise)
      const r3 = rng()
      const putts = r3 < 0.05 + p.base_hcp / 200 ? 3 : r3 < 0.35 ? 1 : 2
      const pickedUp = noise >= 2 && rng() < 0.15
      if (pickedUp) strokes = null
      const saved = pickedUp ? null : Math.min(putts, strokes)
      rows.push({ round_id: round.id, player_id: p.id, hole, strokes, putts: saved, picked_up: pickedUp, entered_by: null, client_ts: new Date().toISOString() })
      // Only what was actually saved counts toward the snake (a 3-putt clamped to 2 by a 2-stroke hole is not one).
      if (saved != null && saved >= day.settings.modules.snake.puttsThreshold) threePutters.push(p.id)
    }
    if (rows.length) must(await sb.from('scores').upsert(rows, { onConflict: 'round_id,player_id,hole' }).select('hole'), `scores g${g.number} h${hole}`)
    if (threePutters.length >= 2) {
      const last = threePutters[Math.floor(rng() * threePutters.length)]
      must(await sb.from('snake_tiebreaks').upsert({ round_id: round.id, group_id: g.id, hole, last_holed_player_id: last, decided_by: null }, { onConflict: 'round_id,group_id,hole' }).select('hole'), 'tiebreak')
    }
    if (interval) console.log(`  grupo ${g.number} · hoyo ${hole}${threePutters.length >= 2 ? ' · víbora: ¿quién embocó al último? (resuelto)' : ''}`)
  }
  if (interval && i < Math.min(maxHoles, holesPerRound) - 1) await sleep(interval * 1000)
}
console.log('done')
