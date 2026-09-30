import { launch, ctx, BASE, SAMPLER, summarize, load, throttle, median } from './lib.mjs'
const b = await launch()
for (const fx of ['large60']) for (const rate of [1, 4]) {
  const runs = []
  for (let i = 0; i < 3; i++) {
    const c = await ctx(b, '15pro'); await c.addInitScript(SAMPLER)
    const p = await c.newPage()
    await p.goto(BASE + `/t/_/${fx}/stats`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(900)
    await throttle(p, rate)
    const L = load()
    await p.evaluate(() => window.__motStart())
    const t0 = Date.now()
    await p.getByRole('button', { name: 'Revivir' }).first().click()
    const clickMs = Date.now() - t0
    await p.waitForTimeout(3000)
    // how responsive is 'Parar' while it plays?
    const t1 = Date.now(); await p.getByRole('button', { name: 'Parar' }).first().click(); const stopMs = Date.now() - t1
    const r = await p.evaluate(() => window.__motStop())
    runs.push({ load: L, clickMs, stopMs, ...summarize(r.deltas), loafs: r.loafs.length, loafMax: Math.max(0, ...r.loafs.map((l) => l.d)), loafSum: r.loafs.reduce((a, l) => a + l.d, 0) })
    await c.close()
  }
  const pick = (k) => median(runs.map((r) => r[k]))
  console.log(fx, rate + 'x', JSON.stringify({ frames: pick('frames'), dropped: pick('dropped'), over50: pick('over50'), max: pick('max'), loafs: pick('loafs'), loafMax: pick('loafMax'), loafSum: pick('loafSum'), clickMs: pick('clickMs'), stopClickMs: pick('stopMs') }), 'loads', runs.map((r) => r.load.split(' ')[0]).join('/'))
}
await b.close()
