// Interleaved A/B at 4x CPU: Guardar hoyo with the birdie confetti vs without, 3.2 s window split 0-1 s / 1-3.2 s.
import { launch, ctx, BASE, SAMPLER, load, throttle, median } from './lib.mjs'
import { writeFileSync } from 'node:fs'
const b = await launch()
const res = { confetti: [], none: [] }
const win = (deltas, a, z) => { let t = 0, dropped = 0, over25 = 0, max = 0; for (const d of deltas) { t += d; if (t >= a && t < z) { dropped += Math.max(0, Math.round(d / 16.67) - 1); if (d > 25) over25++; if (d > max) max = d } } return { dropped, over25, max: Math.round(max) } }
for (let i = 0; i < 6; i++) for (const variant of i % 2 ? ['none', 'confetti'] : ['confetti', 'none']) {
  const c = await ctx(b, '15pro')
  await c.addInitScript(SAMPLER)
  const p = await c.newPage()
  await p.goto(BASE + '/t/_/full12-live/tarjeta', { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  const row = p.locator('[class*="player_"]', { hasText: 'Iván' }).first()
  if (variant === 'none') { await row.getByRole('button', { name: 'Golpes: más' }).click(); await row.getByRole('button', { name: 'Golpes: más' }).click() }
  await p.waitForTimeout(250)
  await throttle(p, 4)
  const L = load()
  await p.evaluate(() => window.__motStart())
  await p.getByRole('button', { name: /^Guardar hoyo/ }).click()
  await p.waitForTimeout(3200)
  const r = await p.evaluate(() => window.__motStop())
  res[variant].push({ load: L, first: win(r.deltas, 0, 1000), rest: win(r.deltas, 1000, 3200) })
  await c.close()
}
await b.close()
for (const k of ['confetti', 'none']) {
  const rs = res[k]
  console.log(k.padEnd(9), '0–1 s: dropped', median(rs.map((r) => r.first.dropped)), 'over25', median(rs.map((r) => r.first.over25)), 'max', median(rs.map((r) => r.first.max)), '| 1–3.2 s: dropped', median(rs.map((r) => r.rest.dropped)), 'over25', median(rs.map((r) => r.rest.over25)), 'max', median(rs.map((r) => r.rest.max)), '| loads', rs.map((r) => r.load.split(' ')[0]).join('/'))
}
writeFileSync('save-ab2.json', JSON.stringify(res, null, 1))
