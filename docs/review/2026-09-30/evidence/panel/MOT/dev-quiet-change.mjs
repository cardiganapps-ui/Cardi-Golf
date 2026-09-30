// Dev server (:4196): a live change that does NOT reorder the board (one player's latest hole +1 point). What marks it?
// Also: a birdie that creates a feed event — how does the feed item arrive?
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
  const rows = d.state.modules.individual.rows
  // the leader: +1 point keeps him first
  const pid = rows[0].playerId
  const holes = d.snapshot.scores.filter((s) => s.roundId === 'r2' && s.playerId === pid && s.strokes != null).sort((a, b) => b.hole - a.hole)
  return { pid, hole: holes[0].hole, strokes: holes[0].strokes, total: rows[0].total }
})
console.log('change', JSON.stringify(info))
// watch every figure cell of the first row + the feed's first item, per frame
await p.evaluate(() => { window.__q = []; const t0 = performance.now(); const f = () => { const row = document.querySelector('button[aria-label]'); const figs = row ? [...row.querySelectorAll('span')].map((s) => { const cs = getComputedStyle(s); return s.children.length ? null : s.textContent + '@' + cs.color + '/' + cs.backgroundColor + '/' + cs.opacity + '/' + cs.transform }).filter(Boolean).join(' ; ') : ''; const feed = document.querySelector('[class*="feed"] > div'); const fcs = feed ? getComputedStyle(feed) : null; window.__q.push([Math.round(performance.now() - t0), figs, feed ? feed.textContent.slice(0, 40) + '@op' + fcs.opacity + '/' + fcs.transform : '']); if (performance.now() - t0 < 1200) requestAnimationFrame(f) }; requestAnimationFrame(f) })
await p.evaluate(({ pid, hole }) => window.__store.getState().patch((s) => { for (const sc of s.scores) if (sc.roundId === 'r2' && sc.playerId === pid && sc.hole === hole) sc.strokes = Math.max(1, sc.strokes - 1) }), info)
await p.waitForTimeout(1300)
const q = await p.evaluate(() => window.__q)
const figChanges = q.filter((x, i) => i > 0 && x[1] !== q[i - 1][1])
console.log('row cell states over time (changes only):')
for (const x of [q[0], ...figChanges].slice(0, 8)) console.log('  ', x[0] + 'ms', x[1].replace(/rgba?\([^)]*\)/g, (m) => m.replace(/\s/g, '')).slice(0, 400))
const feedChanges = q.filter((x, i) => i > 0 && x[2] !== q[i - 1][2])
console.log('feed first item over time:')
for (const x of [q[0], ...feedChanges].slice(0, 14)) console.log('  ', x[0] + 'ms', x[2])
await b.close()
