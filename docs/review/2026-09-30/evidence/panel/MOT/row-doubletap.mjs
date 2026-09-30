// Re-tap a leaderboard row because nothing happened yet: at 4x CPU, second tap at +150/+250/+350 ms. Is the sheet open afterwards?
import { launch, ctx, BASE, load, throttle } from './lib.mjs'
const b = await launch()
for (const gap of [150, 250, 350]) for (const rate of [1, 4]) {
  const c = await ctx(b, '15pro')
  const p = await c.newPage()
  await p.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  await throttle(p, rate)
  const box = await p.locator('button[aria-label]').filter({ hasText: 'Leonel' }).first().boundingBox()
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await p.evaluate(() => { window.__ev = []; const t0 = performance.now(); new MutationObserver(() => { window.__ev.push([Math.round(performance.now() - t0), !!document.querySelector('[role="dialog"]')]) }).observe(document.body, { childList: true, subtree: true }) })
  await p.touchscreen.tap(x, y)
  await p.waitForTimeout(gap)
  await p.touchscreen.tap(x, y)
  await p.waitForTimeout(1200)
  const open = await p.evaluate(() => !!document.querySelector('[role="dialog"]'))
  const ev = await p.evaluate(() => window.__ev)
  const opens = ev.filter((e, i) => e[1] && (i === 0 || !ev[i - 1][1])).map((e) => e[0])
  const closes = ev.filter((e, i) => !e[1] && i > 0 && ev[i - 1][1]).map((e) => e[0])
  console.log(`rate ${rate}x gap ${gap}ms → sheet open at end: ${open} | opened at ${opens.join(',')} ms, closed at ${closes.join(',') || '-'} ms | load ${load().split(' ')[0]}`)
  await c.close()
}
await b.close()
