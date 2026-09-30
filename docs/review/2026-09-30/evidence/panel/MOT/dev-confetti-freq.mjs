// How often would the Tarjeta's confetti fire (my net birdie or better = >= 3 Stableford points), and on what gross scores?
import { launch, ctx } from './lib.mjs'
const DEVBASE = process.env.DEVBASE || 'http://127.0.0.1:4196'
const b = await launch()
const c = await ctx(b, '15pro')
const p = await c.newPage()
await p.goto(DEVBASE + '/t/_/full12-finished', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
const r = await p.evaluate(async () => {
  const m = await import('/src/data/tournamentStore.ts')
  const d = m.useTournament.getState().data
  const out = []
  for (const pl of d.snapshot.players) {
    let fires = 0, grossBogeyOrWorse = 0, holes = 0
    for (const rid of d.state.core.roundIds) for (const h of d.state.core.rounds[rid]?.[pl.id]?.holes ?? []) {
      if (!h.played) continue; holes++
      if (!h.pickedUp && h.points >= 3) { fires++; if (h.gross - h.par >= 1) grossBogeyOrWorse++ }
    }
    out.push({ name: pl.displayName, base: pl.baseHcp, holes, fires, grossBogeyOrWorse })
  }
  return out.sort((a, b) => a.base - b.base)
})
for (const x of r) console.log(`${x.name.padEnd(10)} base ${String(x.base).padStart(4)}  holes ${x.holes}  confetti ${String(x.fires).padStart(2)}  (on a gross bogey or worse: ${x.grossBogeyOrWorse})`)
const tot = r.reduce((a, x) => a + x.fires, 0), holes = r.reduce((a, x) => a + x.holes, 0), bog = r.reduce((a, x) => a + x.grossBogeyOrWorse, 0)
console.log(`TOTAL confetti ${tot} over ${holes} player-holes = ${(tot / holes * 18).toFixed(1)} per player per round; ${bog} of them on a gross bogey or worse`)
await b.close()
