// Diff two Ensayo state records: rounds, counts, and every score row that changed.
import { readFileSync } from 'node:fs'
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')))
const key = (x) => `${x.round_id}:${x.player_id}:${x.hole}`
console.log('rounds', a.rounds.map((r) => `${r.number}:${r.status}`).join(','), '->', b.rounds.map((r) => `${r.number}:${r.status}`).join(','))
console.log('current_round', a.tournament.current_round_id?.slice(0, 8), '->', b.tournament.current_round_id?.slice(0, 8), 'status', a.tournament.status, '->', b.tournament.status)
console.log('counts', JSON.stringify(a.counts), '\n   ->', JSON.stringify(b.counts))
const A = new Map(a.scores.map((x) => [key(x), x]))
const B = new Map(b.scores.map((x) => [key(x), x]))
const fields = ['strokes', 'putts', 'picked_up', 'entered_by', 'disputed', 'reason']
for (const [k, x] of B) {
  const o = A.get(k)
  if (!o) console.log('NEW', k.split(':').map((s) => s.slice(0, 8)).join(':'), fields.map((f) => `${f}=${x[f]}`).join(' '))
  else {
    const d = fields.filter((f) => JSON.stringify(o[f]) !== JSON.stringify(x[f]))
    const ts = o.client_ts !== x.client_ts
    if (d.length || ts) console.log('CHG', k.split(':').map((s) => s.slice(0, 8)).join(':'), d.map((f) => `${f}:${JSON.stringify(o[f])}->${JSON.stringify(x[f])}`).join(' '), ts ? '(client_ts changed)' : '')
  }
}
for (const k of A.keys()) if (!B.has(k)) console.log('GONE', k)
const tb = (s) => new Set(s.tiebreaks.map((t) => `${t.round_id}:${t.group_id}:${t.hole}:${t.last_holed_player_id}`))
const ta = tb(a), tbb = tb(b)
for (const x of tbb) if (!ta.has(x)) console.log('TB NEW', x)
for (const x of ta) if (!tbb.has(x)) console.log('TB GONE', x)
const aw = (s) => new Set(s.awards.map((t) => `${t.round_id}:${t.group_id}:${t.hole}:${t.game_id}:${t.player_id}`))
const wa = aw(a), wb = aw(b)
for (const x of wb) if (!wa.has(x)) console.log('AWARD NEW', x)
for (const x of wa) if (!wb.has(x)) console.log('AWARD GONE', x)
console.log('signatures', a.signatures.length, '->', b.signatures.length)
