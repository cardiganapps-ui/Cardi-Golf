// Tarjeta "Guardar hoyo" on full12-live (me = p9 Iván J.): what moves, when, and frames; with and without a birdie (confetti)
import { launch, ctx, BASE, SAMPLER, summarize, load, throttle, median } from './lib.mjs'
import { writeFileSync } from 'node:fs'
const WATCH = `
window.__ev = [];
window.__watch = () => { const t0 = performance.now(); window.__ev = [];
  const mark = (k, v) => window.__ev.push([Math.round(performance.now() - t0), k, v]);
  const num = () => document.querySelector('[class*="holeNum"]')?.textContent;
  let lastNum = num(); let lastToast = null; let lastCanvas = 0; let lastBtn = null;
  const f = () => { const n = num(); if (n !== lastNum) { mark('hole', n); lastNum = n }
    const toast = document.querySelector('[class*="toast"] span')?.textContent ?? null; if (toast !== lastToast) { mark('toast', toast); lastToast = toast }
    const c = document.querySelectorAll('body > canvas').length; if (c !== lastCanvas) { mark('canvas', c); lastCanvas = c }
    const btn = [...document.querySelectorAll('button')].find(b => /Guardar|Guardando/.test(b.textContent || ''));
    const bs = btn ? (btn.disabled ? 'disabled:' : 'enabled:') + btn.textContent : null; if (bs !== lastBtn) { mark('btn', bs); lastBtn = bs }
    const pl = document.querySelector('[class*="players"]'); const cs = pl ? getComputedStyle(pl) : null; if (cs && (cs.opacity !== '1' || cs.transform !== 'none')) mark('playersAnim', cs.opacity + ' ' + cs.transform);
    if (performance.now() - t0 < 3000) requestAnimationFrame(f) }; requestAnimationFrame(f) };
`
const b = await launch()
const results = []
for (const birdie of [false, true]) for (const rate of [1, 4]) {
  const runs = []
  for (let i = 0; i < 3; i++) {
    const c = await ctx(b, '15pro')
    await c.addInitScript(SAMPLER); await c.addInitScript(WATCH)
    const p = await c.newPage()
    await p.goto(BASE + '/t/_/full12-live/tarjeta', { waitUntil: 'networkidle' })
    await p.waitForTimeout(1200)
    if (birdie) {
      // Iván's row: find the player block containing his name, press "Golpes: menos" twice
      const row = p.locator('[class*="player_"]', { hasText: 'Iván' }).first()
      await row.getByRole('button', { name: 'Golpes: menos' }).click()
      await row.getByRole('button', { name: 'Golpes: menos' }).click()
      await p.waitForTimeout(300)
    }
    const pts = birdie ? await p.locator('[class*="player_"]', { hasText: 'Iván' }).first().locator('[class*="pts"]').textContent() : ''
    await throttle(p, rate)
    const L = load()
    await p.evaluate(() => { window.__motStart(); window.__watch() })
    await p.getByRole('button', { name: /^Guardar hoyo/ }).click()
    await p.waitForTimeout(3100)
    const r = await p.evaluate(() => window.__motStop())
    const ev = await p.evaluate(() => window.__ev)
    runs.push({ load: L, pts, ...summarize(r.deltas), loafs: r.loafs.length, loafMax: Math.max(0, ...r.loafs.map((l) => l.d)), loafSum: r.loafs.reduce((a, l) => a + l.d, 0), ev })
    await c.close()
  }
  const pick = (k) => median(runs.map((r) => r[k]))
  const row = { birdie, rate, median: { frames: pick('frames'), dropped: pick('dropped'), over25: pick('over25'), over50: pick('over50'), max: pick('max'), loafs: pick('loafs'), loafMax: pick('loafMax'), loafSum: pick('loafSum') }, runs }
  results.push(row)
  console.log('birdie', birdie, 'rate', rate, JSON.stringify(row.median), 'loads', runs.map((r) => r.load.split(' ')[0]).join('/'))
  console.log('  events run1:', JSON.stringify(runs[0].ev.filter(e=>e[1]!=='playersAnim').slice(0, 14)), 'pts', runs[0].pts, 'playersAnim frames', runs[0].ev.filter(e=>e[1]==='playersAnim').length)
}
await b.close()
writeFileSync('save.json', JSON.stringify(results, null, 1))
