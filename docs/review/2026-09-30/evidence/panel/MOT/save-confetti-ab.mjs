// A/B: Guardar hoyo at 4x CPU with confetti (Iván at par = net birdie) vs without (Iván +2 = no celebration)
import { launch, ctx, BASE, SAMPLER, load, throttle, summarize, median } from './lib.mjs'
import { writeFileSync } from 'node:fs'
const b = await launch()
const out = {}
for (const variant of ['confetti', 'none']) {
  const runs = []
  for (let i = 0; i < 5; i++) {
    const c = await ctx(b, '15pro')
    await c.addInitScript(SAMPLER)
    const p = await c.newPage()
    await p.goto(BASE + '/t/_/full12-live/tarjeta', { waitUntil: 'networkidle' })
    await p.waitForTimeout(1000)
    const row = p.locator('[class*="player_"]', { hasText: 'Iván' }).first()
    if (variant === 'none') { await row.getByRole('button', { name: 'Golpes: más' }).click(); await row.getByRole('button', { name: 'Golpes: más' }).click() }
    const pts = await row.locator('[class*="pts"]').textContent()
    await p.waitForTimeout(300)
    await throttle(p, 4)
    const L = load()
    await p.evaluate(() => window.__motStart())
    await p.getByRole('button', { name: /^Guardar hoyo/ }).click()
    await p.waitForTimeout(1000)
    const canvases = await p.evaluate(() => document.querySelectorAll('body > canvas').length)
    const r = await p.evaluate(() => window.__motStop())
    runs.push({ load: L, pts, canvases, ...summarize(r.deltas), loafSum: r.loafs.reduce((a, l) => a + l.d, 0) })
    await c.close()
  }
  out[variant] = runs
  const pick = (k) => median(runs.map((r) => r[k]))
  console.log(variant, 'pts', runs[0].pts, 'canvas', runs[0].canvases, JSON.stringify({ frames: pick('frames'), dropped: pick('dropped'), over25: pick('over25'), max: pick('max'), loafSum: pick('loafSum') }), 'loads', runs.map((r) => r.load.split(' ')[0]).join('/'))
}
writeFileSync('save-confetti-ab.json', JSON.stringify(out, null, 1))
await b.close()
