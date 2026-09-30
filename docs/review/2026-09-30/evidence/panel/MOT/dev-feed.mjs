// Dev server (:4196): a new birdie arrives while En vivo is open: how does the feed item enter, and what happens to the 10th?
import { launch, ctx } from './lib.mjs'
const DEVBASE = process.env.DEVBASE || 'http://127.0.0.1:4196'
const b = await launch()
const c = await ctx(b, '15pro')
const p = await c.newPage()
await p.goto(DEVBASE + '/t/_/full12-live', { waitUntil: 'networkidle' })
await p.waitForSelector('button[aria-label]', { timeout: 30000 })
await p.waitForTimeout(1500)
const info = await p.evaluate(async () => {
  const m = await import('/src/data/tournamentStore.ts'); window.__store = m.useTournament
  const d = m.useTournament.getState().data
  for (const pl of d.snapshot.players) {
    const pr = d.state.core.rounds.r2?.[pl.id]; if (!pr) continue
    const last = pr.holes.filter((h) => h.played).sort((a, b) => b.hole - a.hole)[0]
    if (last && last.points < 3 && !last.pickedUp) return { pid: pl.id, name: pl.displayName, hole: last.hole, par: last.par, feedLen: d.state.feed.length }
  }
})
console.log('change', JSON.stringify(info))
await p.evaluate(() => { window.__f = []; const t0 = performance.now(); const f = () => { const items = [...document.querySelectorAll('[class*="feed"] > div')]; window.__f.push([Math.round(performance.now() - t0), items.length, items.slice(0, 2).map((it) => it.textContent.slice(0, 28) + ' op' + (Math.round(parseFloat(getComputedStyle(it).opacity) * 100) / 100) + ' ty' + Math.round(new DOMMatrix(getComputedStyle(it).transform === 'none' ? undefined : getComputedStyle(it).transform).m42)).join(' || '), items.length ? (Math.round(parseFloat(getComputedStyle(items[items.length - 1]).opacity) * 100) / 100) : null, Math.round(document.querySelector('[class*="feed"] > div')?.parentElement.getBoundingClientRect().height ?? 0)]); if (performance.now() - t0 < 900) requestAnimationFrame(f) }; requestAnimationFrame(f) })
await p.evaluate(({ pid, hole, par }) => window.__store.getState().patch((s) => { for (const sc of s.scores) if (sc.roundId === 'r2' && sc.playerId === pid && sc.hole === hole) { sc.strokes = Math.max(1, par - 2); sc.pickedUp = false; sc.updatedAt = '2099-01-01T00:00:00Z' } }), info)
await p.waitForTimeout(1000)
const f = await p.evaluate(() => window.__f)
for (const x of f.filter((x, i) => i === 0 || JSON.stringify(x.slice(1)) !== JSON.stringify(f[i - 1].slice(1))).slice(0, 25)) console.log('  ', x[0] + 'ms', 'items', x[1], '| last item op', x[3], '| feed h', x[4], '|', x[2])
await b.close()
