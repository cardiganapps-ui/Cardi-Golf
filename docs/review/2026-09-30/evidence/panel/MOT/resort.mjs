// Leaderboard re-sort (En vivo, full12-live): triggered by the Puntos/Gross toggle, which re-orders
// the same motion.div layout rows the realtime re-sort uses. Measures frames and the row transforms.
import { launch, ctx, BASE, SAMPLER, summarize, load, throttle, median } from './lib.mjs'
const TRACK = `
window.__trk = [];
window.__trkStart = (sel) => { window.__trk = []; const t0 = performance.now(); const f = () => { const els = [...document.querySelectorAll(sel)]; let mx = 0; let n = 0; for (const e of els) { const tr = e.style.transform; if (tr && tr !== 'none') { n++; const m = tr.match(/translateY\\((-?[\\d.]+)px\\)|translate3d\\([^,]+,\\s*(-?[\\d.]+)px/); const v = m ? Math.abs(parseFloat(m[1] ?? m[2])) : 0; if (v > mx) mx = v } } window.__trk.push([Math.round(performance.now() - t0), n, Math.round(mx)]); if (performance.now() - t0 < 900) requestAnimationFrame(f) }; requestAnimationFrame(f) };
`
const out = []
const b = await launch()
for (const reduce of ['no-preference', 'reduce']) {
  for (const rate of [1, 4]) {
    const runs = []
    for (let i = 0; i < 3; i++) {
      const c = await ctx(b, '15pro', { reducedMotion: reduce })
      await c.addInitScript(SAMPLER); await c.addInitScript(TRACK)
      const p = await c.newPage()
      await p.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' })
      await p.waitForTimeout(1200)
      await throttle(p, rate)
      const L = load()
      // the rows are the motion.div wrappers: direct children of the board container that hold a leaderRow button
      const sel = 'div:has(> button[aria-label])'
      const orderBefore = await p.$$eval('button[aria-label^="1"],button[aria-label]', (els) => els.length)
      await p.evaluate(() => window.__motStart())
      await p.evaluate((s) => window.__trkStart(s), sel)
      const t0 = Date.now()
      await p.getByRole('radio', { name: 'Gross' }).click()
      const clickMs = Date.now() - t0
      await p.waitForTimeout(900)
      const r = await p.evaluate(() => window.__motStop())
      const trk = await p.evaluate(() => window.__trk)
      const moving = trk.filter((x) => x[1] > 0)
      runs.push({ load: L, clickMs, ...summarize(r.deltas), loafs: r.loafs.length, loafMax: Math.max(0, ...r.loafs.map((l) => l.d)), animMs: moving.length ? moving[moving.length - 1][0] - moving[0][0] : 0, animFrames: moving.length, maxShift: Math.max(0, ...trk.map((x) => x[2])) })
      await c.close()
    }
    const pick = (k) => median(runs.map((r) => r[k]))
    out.push({ reduce, rate, median: { frames: pick('frames'), dropped: pick('dropped'), over25: pick('over25'), max: pick('max'), loafs: pick('loafs'), loafMax: pick('loafMax'), animMs: pick('animMs'), animFrames: pick('animFrames'), maxShift: pick('maxShift') }, runs })
    console.log(reduce, 'rate', rate, JSON.stringify(out[out.length - 1].median), 'loads', runs.map((r) => r.load.split(' ')[0]).join('/'))
  }
}
await b.close()
import { writeFileSync } from 'node:fs'
writeFileSync('resort.json', JSON.stringify(out, null, 1))
