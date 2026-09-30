// Dev server TV 1920x1080 on the individual board: a synthetic change that re-orders the top of the board.
import { launch, ctx } from './lib.mjs'
const DEVBASE = process.env.DEVBASE || 'http://127.0.0.1:4196'
const b = await launch()
const c = await ctx(b, 'tv')
const p = await c.newPage()
await p.goto(DEVBASE + '/t/_/full12-live/tv', { waitUntil: 'networkidle' })
await p.waitForTimeout(2000)
const before = await p.evaluate(async () => { const m = await import('/src/data/tournamentStore.ts'); window.__store = m.useTournament; return [...document.querySelectorAll('[class*="rows"] > div')].map((r) => r.querySelector('[class*="name"]')?.textContent).join(' | ') })
console.log('before', before)
await p.evaluate(() => { window.__r = []; const t0 = performance.now(); const f = () => { const rows = [...document.querySelectorAll('[class*="rows"] > div')]; window.__r.push([Math.round(performance.now() - t0), rows.map((r) => r.querySelector('[class*="name"]')?.textContent?.slice(0, 8)).join('|'), rows.filter((r) => getComputedStyle(r).transform !== 'none').length]); if (performance.now() - t0 < 800) requestAnimationFrame(f) }; requestAnimationFrame(f) })
await p.evaluate(() => { const rows = window.__store.getState().data.state.modules.individual.rows; const last = rows[rows.length - 1].playerId; window.__store.getState().patch((s) => { for (const sc of s.scores) if (sc.roundId === 'r2' && sc.playerId === last && sc.strokes != null) sc.strokes = 2 }) })
await p.waitForTimeout(900)
const r = await p.evaluate(() => window.__r)
const ch = r.filter((x, i) => i > 0 && x[1] !== r[i - 1][1])
console.log('order changed at', ch.map((x) => x[0] + 'ms').join(','), '| frames with a transformed row', r.filter((x) => x[2] > 0).length)
console.log('after', r[r.length - 1][1])
await b.close()
