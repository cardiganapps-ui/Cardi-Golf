import { launch, ctx, BASE, SAMPLER, summarize, load, throttle } from './lib.mjs'
const b = await launch()
const c = await ctx(b, '15pro')
await c.addInitScript(SAMPLER)
const p = await c.newPage()
await p.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
for (const rate of [1, 4]) {
  await throttle(p, rate)
  await p.evaluate(() => window.__motStart())
  await p.waitForTimeout(1000)
  const r = await p.evaluate(() => window.__motStop())
  console.log('rate', rate, 'load', load(), JSON.stringify(summarize(r.deltas)), 'loafErr', r.loafErr ?? '-')
}
await b.close()
