// Production preview: TV board rotation (every 12 s) on full12-live at 1920x1080: sample the board section.
import { launch, ctx, BASE, SAMPLER, summarize, load } from './lib.mjs'
const b = await launch()
const c = await ctx(b, 'tv')
await c.addInitScript(SAMPLER)
const p = await c.newPage()
await p.goto(BASE + '/t/_/full12-live/tv', { waitUntil: 'networkidle' })
const t0 = Date.now()
await p.waitForTimeout(11300 - (Date.now() - t0))
await p.evaluate(() => { window.__motStart(); window.__rot = []; const s0 = performance.now(); const f = () => { const secs = [...document.querySelectorAll('section')]; window.__rot.push([Math.round(performance.now() - s0), secs.map((s) => { const cs = getComputedStyle(s); const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform); return (s.querySelector('h2')?.textContent || '').slice(0, 14) + ' op=' + Math.round(parseFloat(cs.opacity) * 100) / 100 + ' y=' + Math.round(m.m42) }).join(' || ')]); if (performance.now() - s0 < 2000) requestAnimationFrame(f) }; requestAnimationFrame(f) })
await p.waitForTimeout(2100)
const fr = await p.evaluate(() => window.__motStop())
const rot = await p.evaluate(() => window.__rot)
let last = ''
for (const [t, s] of rot) { if (s !== last) { console.log(t + 'ms', s || '(no section)'); last = s } }
console.log('frames', JSON.stringify(summarize(fr.deltas)), 'load', load())
await b.close()
