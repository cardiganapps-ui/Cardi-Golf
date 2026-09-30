import { launch, ctx, BASE, SAMPLER, load, throttle } from './lib.mjs'
const b = await launch()
for (const rate of [4]) for (let i = 0; i < 3; i++) {
  const c = await ctx(b, '15pro')
  await c.addInitScript(SAMPLER)
  const p = await c.newPage()
  await p.goto(BASE + '/t/_/full12-live/tarjeta', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  await throttle(p, rate)
  const L = load()
  await p.evaluate(() => window.__motStart())
  await p.getByRole('button', { name: /^Guardar hoyo/ }).click()
  await p.waitForTimeout(3100)
  const r = await p.evaluate(() => window.__motStop())
  let t = 0; const longs = []
  for (const d of r.deltas) { t += d; if (d > 25) longs.push(`${Math.round(t)}ms:+${Math.round(d)}`) }
  console.log('rate', rate, 'load', L, 'long frames (at t since click-start):', longs.join(' '), '| loafs', JSON.stringify(r.loafs))
  await c.close()
}
await b.close()
