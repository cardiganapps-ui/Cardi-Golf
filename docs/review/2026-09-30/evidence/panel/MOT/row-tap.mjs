// Tap a leaderboard row: time from pointerdown to the first frame that paints the sheet, at 1x and 4x CPU (3 runs each)
import { launch, ctx, BASE, load, throttle, median } from './lib.mjs'
const b = await launch()
for (const rate of [1, 4]) {
  const res = []
  for (let i = 0; i < 3; i++) {
    const c = await ctx(b, '15pro')
    const p = await c.newPage()
    await p.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' })
    await p.waitForTimeout(1000)
    await throttle(p, rate)
    const L = load()
    await p.evaluate(() => {
      window.__tap = null
      document.addEventListener('pointerdown', () => { const t0 = performance.now(); window.__tap = { t0 }; const f = () => { if (document.querySelector('[role="dialog"]')) { window.__tap.dialogFrame = performance.now() - t0; return } requestAnimationFrame(f) }; requestAnimationFrame(f) }, { capture: true, once: true })
      window.__lo = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lo.push(Math.round(e.duration)) }).observe({ type: 'long-animation-frame' })
    })
    await p.locator('button[aria-label]').filter({ hasText: 'Leonel' }).first().click()
    await p.waitForTimeout(800)
    const r = await p.evaluate(() => ({ ...window.__tap, lo: window.__lo }))
    res.push({ L, ms: Math.round(r.dialogFrame), lo: r.lo })
    await c.close()
  }
  console.log('rate', rate, 'tap→first frame with the sheet (ms):', res.map((r) => r.ms).join('/'), 'median', median(res.map((r) => r.ms)), '| LoAFs', JSON.stringify(res.map((r) => r.lo)), '| loads', res.map((r) => r.L.split(' ')[0]).join('/'))
}
await b.close()
