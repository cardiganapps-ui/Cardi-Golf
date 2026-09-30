// Frame timing for: Stats race replay, Ceremonia champion reveal (3 confetti bursts), TV rotation — 1x and 4x CPU, 3 runs, median.
import { launch, ctx, BASE, SAMPLER, summarize, load, throttle, median } from './lib.mjs'
import { writeFileSync } from 'node:fs'
const b = await launch()
const out = {}
async function run(name, device, path, prep, trigger, windowMs) {
  for (const rate of [1, 4]) {
    const runs = []
    for (let i = 0; i < 3; i++) {
      const c = await ctx(b, device)
      await c.addInitScript(SAMPLER)
      const p = await c.newPage()
      await p.goto(BASE + path, { waitUntil: 'networkidle' })
      await p.waitForTimeout(900)
      if (prep) await prep(p)
      await throttle(p, rate)
      const L = load()
      await p.evaluate(() => window.__motStart())
      await trigger(p)
      await p.waitForTimeout(windowMs)
      const r = await p.evaluate(() => window.__motStop())
      runs.push({ load: L, ...summarize(r.deltas), loafs: r.loafs.length, loafMax: Math.max(0, ...r.loafs.map((l) => l.d)) })
      await c.close()
    }
    const pick = (k) => median(runs.map((r) => r[k]))
    out[`${name}@${rate}x`] = { frames: pick('frames'), expected: Math.round(windowMs / 16.67), dropped: pick('dropped'), over25: pick('over25'), over50: pick('over50'), max: pick('max'), loafs: pick('loafs'), loafMax: pick('loafMax'), loads: runs.map((r) => r.load.split(' ')[0]).join('/') }
    console.log(name, rate + 'x', JSON.stringify(out[`${name}@${rate}x`]))
  }
}
// Stats: race replay (36 holes x 250 ms = 9 s); sample 3 s
await run('stats-race', '15pro', '/t/_/full12-finished/stats', async (p) => { await p.getByRole('button', { name: 'Revivir' }).first().scrollIntoViewIfNeeded() }, (p) => p.getByRole('button', { name: 'Revivir' }).first().click(), 3000)
// Ceremonia: go to the champion step, then reveal (three confetti bursts)
await run('ceremony-champion', 'laptop', '/t/_/full12-finished/ceremonia', async (p) => {
  await p.getByRole('button', { name: 'Empezar la ceremonia' }).click(); await p.waitForTimeout(900)
  for (let k = 0; k < 20; k++) { const t = await p.evaluate(() => document.querySelector('h2')?.textContent || ''); if (/Campe/i.test(t)) break; await p.getByRole('button', { name: 'Siguiente' }).click(); await p.waitForTimeout(900) }
}, (p) => p.getByRole('button', { name: 'Revelar' }).click(), 3500)
// TV: rotation (trigger = wait until just before 12 s)
await run('tv-rotation', 'tv', '/t/_/full12-live/tv', async (p) => { await p.waitForTimeout(10600) }, async () => {}, 1500)
writeFileSync('frames-misc.json', JSON.stringify(out, null, 1))
await b.close()
