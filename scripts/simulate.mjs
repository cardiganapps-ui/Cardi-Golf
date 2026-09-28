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

const t = must(await sb.from('tournaments').select('id, name, settings').eq('slug', slug).single(), 'tournament')
const S = t.settings
const rounds = must(await sb.from('rounds').select('*').eq('tournament_id', t.id).order('number'), 'rounds')
const round = roundNumber ? rounds.find((r) => r.number === roundNumber) : rounds.find((r) => r.status !== 'finished' && r.status !== 'cancelled')
if (!round) {
  console.error('No round to simulate')
  process.exit(1)
}
const players = must(await sb.from('players').select('id, display_name, base_hcp, default_tee_id').eq('tournament_id', t.id), 'players')
const groups = must(await sb.from('groups').select('id, number, start_hole, group_members(player_id)').eq('round_id', round.id).order('number'), 'groups')
if (!groups.length) {
  console.error('The round has no groups yet: build them in Comité › Grupos first.')
  process.exit(1)
}
const tees = round.course_id ? must(await sb.from('tees').select('id, name, holes(number, par, stroke_index)').eq('course_id', round.course_id), 'tees') : []
if (!tees.length) {
  console.error('The round has no course: load one in Comité › Campos and assign it in Rondas.')
  process.exit(1)
}
const roundTees = must(await sb.from('round_tees').select('player_id, tee_id').eq('round_id', round.id), 'round_tees')
const teeFor = (p) => tees.find((x) => x.id === (roundTees.find((rt) => rt.player_id === p.id)?.tee_id ?? p.default_tee_id)) ?? tees[0]

// Day-1 points for the anti-sandbag cut when simulating a later round.
const earlier = rounds.filter((r) => r.number < round.number && r.status !== 'cancelled')
const cutFor = new Map()
if (earlier.length) {
  const first = earlier[0]
  const prev = must(await sb.from('scores').select('player_id, hole, strokes, picked_up').eq('round_id', first.id), 'day1 scores')
  // Day-1 points are scored on the tee each player had that day (it may differ from today's).
  const firstTees = must(await sb.from('round_tees').select('player_id, tee_id').eq('round_id', first.id), 'day1 round_tees')
  const firstRound = rounds.find((r) => r.id === first.id)
  const firstCourseTees = firstRound?.course_id && firstRound.course_id !== round.course_id ? must(await sb.from('tees').select('id, holes(number, par, stroke_index)').eq('course_id', firstRound.course_id), 'day1 tees') : tees
  const firstTeeFor = (p) => firstCourseTees.find((x) => x.id === (firstTees.find((rt) => rt.player_id === p.id)?.tee_id ?? p.default_tee_id)) ?? firstCourseTees[0]
  for (const p of players) {
    const tee = firstTeeFor(p)
    const ph = playingHcp(p.base_hcp)
    let pts = 0
    for (const s of prev.filter((x) => x.player_id === p.id)) {
      const h = tee.holes.find((x) => x.number === s.hole)
      if (!h || s.picked_up || s.strokes == null) continue
      pts += Math.max(0, h.par + strokesReceived(ph, h.stroke_index) - s.strokes + 2)
    }
    const c = S.day2Cut
    cutFor.set(p.id, pts > c.threshold ? Math.min(c.maxStrokes, Math.floor((pts - c.threshold) / c.pointsPerStroke)) : 0)
  }
}
function playingHcp(base) {
  const x = S.handicap.allowance * Math.min(base, S.handicap.cap)
  return Math.floor(x + 0.5)
}
function strokesReceived(ph, si) {
  return Math.floor(ph / 18) + (si <= ph % 18 ? 1 : 0)
}

if (reset) {
  must(await sb.from('snake_tiebreaks').delete().eq('round_id', round.id).select('hole'), 'reset tiebreaks')
  must(await sb.from('card_signatures').delete().eq('round_id', round.id).select('pair_id'), 'reset signatures')
  must(await sb.from('scores').delete().eq('round_id', round.id).select('hole'), 'reset scores')
}
if (round.status === 'scheduled') must(await sb.from('rounds').update({ status: 'live' }).eq('id', round.id).select('id'), 'round live')

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
      const tee = teeFor(p)
      const h = tee.holes.find((x) => x.number === hole)
      if (!h) continue
      const ph = Math.max(0, playingHcp(p.base_hcp) - (cutFor.get(p.id) ?? 0))
      const sr = strokesReceived(ph, h.stroke_index)
      // Noise: harder holes (low SI) skew worse; better players skew better.
      const r = rng() + (h.stroke_index <= 6 ? 0.08 : 0) - (p.base_hcp < 10 ? 0.08 : 0)
      const noise = r < 0.12 ? -1 : r < 0.5 ? 0 : r < 0.78 ? 1 : r < 0.92 ? 2 : 3
      let strokes = Math.max(1, h.par + sr + noise)
      const r3 = rng()
      const putts = r3 < 0.05 + p.base_hcp / 200 ? 3 : r3 < 0.35 ? 1 : 2
      const pickedUp = noise >= 2 && rng() < 0.15
      if (pickedUp) strokes = null
      const saved = pickedUp ? null : Math.min(putts, strokes)
      rows.push({ round_id: round.id, player_id: p.id, hole, strokes, putts: saved, picked_up: pickedUp, entered_by: null, client_ts: new Date().toISOString() })
      // Only what was actually saved counts toward the snake (a 3-putt clamped to 2 by a 2-stroke hole is not one).
      if (saved != null && saved >= S.modules.snake.puttsThreshold) threePutters.push(p.id)
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
