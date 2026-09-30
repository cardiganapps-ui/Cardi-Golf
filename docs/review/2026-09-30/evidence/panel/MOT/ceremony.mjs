// Ceremonia (full12-finished, laptop 1440x900): sample the transform/opacity of the stage's children every frame
// through: start -> step 1 enters -> reveal -> next (exit + enter). Shows default springs (overshoot) and the blank gap.
import { launch, ctx, BASE, SAMPLER, summarize, load, throttle } from './lib.mjs'
import { writeFileSync } from 'node:fs'
const TRK = `
window.__cer = []; window.__cerStart = (ms) => { const t0 = performance.now(); window.__cer = [];
  const f = () => { const body = document.querySelector('[class*="body"]'); const kids = body ? [...body.children] : [];
    const rows = kids.map((k) => { const cs = getComputedStyle(k); const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform); return { cls: (k.className || '').toString().split(' ')[0].slice(0, 18), y: Math.round(m.m42 * 10) / 10, sc: Math.round(m.a * 1000) / 1000, op: Math.round(parseFloat(cs.opacity) * 100) / 100, txt: (k.textContent || '').slice(0, 22) } });
    const rev = document.querySelector('[class*="reveal"]'); let rv = null; if (rev) { const cs = getComputedStyle(rev); const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform); rv = { sc: Math.round(m.a * 1000) / 1000, op: Math.round(parseFloat(cs.opacity) * 100) / 100 } }
    window.__cer.push([Math.round(performance.now() - t0), rows, rv]); if (performance.now() - t0 < ms) requestAnimationFrame(f) }; requestAnimationFrame(f) };
`
const b = await launch()
const c = await ctx(b, 'laptop')
await c.addInitScript(SAMPLER); await c.addInitScript(TRK)
const p = await c.newPage()
await p.goto(BASE + '/t/_/full12-finished/ceremonia', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
const phases = {}
async function phase(name, action, ms = 1200) {
  await p.evaluate((m) => { window.__motStart(); window.__cerStart(m) }, ms)
  await action()
  await p.waitForTimeout(ms + 100)
  const fr = await p.evaluate(() => window.__motStop())
  phases[name] = { load: load(), frames: summarize(fr.deltas), trace: await p.evaluate(() => window.__cer) }
}
await phase('start', () => p.getByRole('button', { name: 'Empezar la ceremonia' }).click())
await phase('reveal1', () => p.getByRole('button', { name: 'Revelar' }).click())
await phase('next', () => p.getByRole('button', { name: 'Siguiente' }).click())
writeFileSync('ceremony.json', JSON.stringify(phases, null, 1))
for (const [k, v] of Object.entries(phases)) {
  const ys = v.trace.map((t) => t[1].map((r) => r.y)).flat()
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  // time when the stage has no visible child (all opacity 0 or no children)
  const blank = v.trace.filter((t) => t[1].length === 0 || t[1].every((r) => r.op === 0)).map((t) => t[0])
  const settle = v.trace.filter((t) => t[1].some((r) => Math.abs(r.y) > 0.5 || (r.op > 0 && r.op < 1))).map((t) => t[0])
  const rv = v.trace.map((t) => t[2]).filter(Boolean).map((r) => r.sc)
  console.log(k, 'frames', JSON.stringify(v.frames), '| y range', minY, maxY, '| blank frames', blank.length, blank.length ? `${blank[0]}-${blank[blank.length - 1]}ms` : '', '| moving until', settle.length ? settle[settle.length - 1] + 'ms' : '-', '| reveal scale min/max', rv.length ? Math.min(...rv) + '/' + Math.max(...rv) : '-')
}
await b.close()
