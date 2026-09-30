// Interaction latency on the Tarjeta (fixture, instrumented build): stepper taps and "Guardar hoyo"
// with Event Timing (INP-like), click → next hole shown, and React commits/renders per interaction.
// usage: node tarjeta.mjs <fixture> [cpuRate=4] [saves=5] [base=http://127.0.0.1:4186]
import { writeFileSync } from 'node:fs'
import { launch, newPhone, sleep, load, cdpMetrics, diffMetrics, topN, E } from './perf-lib.mjs'

const fixture = process.argv[2] ?? 'full12-live'
const rate = Number(process.argv[3] ?? 4)
const SAVES = Number(process.argv[4] ?? 5)
const BASE = process.argv[5] ?? 'http://127.0.0.1:4186'
const b = await launch()
const ctx = await newPhone(b)
await ctx.route(/supabase\.co/, (r) => r.abort())
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
const cdp = await ctx.newCDPSession(page)
await cdp.send('Performance.enable')
await page.goto(`${BASE}/t/_/${fixture}/tarjeta`, { waitUntil: 'load' })
const save = page.getByRole('button', { name: /^Guardar (hoyo|y ver la tarjeta)$/ })
await save.waitFor({ timeout: 30000 })
await page.evaluate(() => {
  window.__ev = []
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__ev.push({ name: e.name, start: e.startTime, dur: e.duration, inputDelay: e.processingStart - e.startTime, processing: e.processingEnd - e.processingStart, presentation: e.startTime + e.duration - e.processingEnd, id: e.interactionId })
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
  window.__holeChanges = []
  const el = () => document.querySelector('[class*="holeNum"]')
  let last = el()?.textContent
  new MutationObserver(() => {
    const now = el()?.textContent
    if (now !== last) {
      window.__holeChanges.push({ t: performance.now(), from: last, to: now })
      last = now
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true })
})
await sleep(1500)
if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate })
const out = { fixture, cpuRate: rate, loadBefore: load(), steppers: [], saves: [] }

// Stepper taps: strokes +1 then -1 on the first player, 6 taps.
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => window.__RCreset())
  const n0 = await page.evaluate(() => window.__ev.length)
  const btn = page.locator(`button[aria-label="Golpes: ${i % 2 ? 'menos' : 'más'}"]`).first()
  await btn.click()
  await sleep(600)
  const r = await page.evaluate((n0) => ({ ev: window.__ev.slice(n0), rc: { commits: window.__RC.commits, rendered: window.__RC.nRendered, top: Object.entries(window.__RC.rendered).sort((a, b) => b[1] - a[1]).slice(0, 6) } }), n0)
  const click = r.ev.filter((e) => e.name === 'click' || e.name === 'pointerup' || e.name === 'pointerdown').sort((a, b) => b.dur - a.dur)[0]
  out.steppers.push({ maxEventMs: click ? Math.round(click.dur) : '<16', processingMs: click ? Math.round(click.processing) : null, commits: r.rc.commits, rendered: r.rc.rendered, top: r.rc.top })
}
console.log('steppers', JSON.stringify(out.steppers.map((s) => [s.maxEventMs, s.commits, s.rendered])))

for (let i = 0; i < SAVES; i++) {
  await page.evaluate(() => window.__RCreset())
  const n0 = await page.evaluate(() => ({ ev: window.__ev.length, holes: window.__holeChanges.length, hole: document.querySelector('[class*="holeNum"]')?.textContent }))
  const m0 = await cdpMetrics(cdp)
  await save.click()
  await page.waitForFunction((n) => window.__holeChanges.length > n, n0.holes, { timeout: 20000 }).catch(() => null)
  await sleep(1500)
  const m1 = await cdpMetrics(cdp)
  const r = await page.evaluate((n0) => {
    const ev = window.__ev.slice(n0.ev)
    const click = ev.filter((e) => e.name === 'click').sort((a, b) => b.dur - a.dur)[0]
    const pd = ev.filter((e) => e.name === 'pointerdown')[0]
    const hc = window.__holeChanges[n0.holes]
    const start = pd?.start ?? click?.start
    return {
      hole: n0.hole,
      eventTiming: ev.map((e) => ({ name: e.name, dur: Math.round(e.dur), inputDelay: Math.round(e.inputDelay), processing: Math.round(e.processing), presentation: Math.round(e.presentation) })),
      clickToNextHoleMs: hc && start != null ? Math.round(hc.t - start) : null,
      commits: window.__RC.commits,
      rendered: window.__RC.nRendered,
      top: Object.entries(window.__RC.rendered).sort((a, b) => b[1] - a[1]).slice(0, 8),
    }
  }, n0)
  r.cdp = diffMetrics(m0, m1)
  out.saves.push(r)
  console.log('save', i, 'hole', r.hole, 'click→nextHole', r.clickToNextHoleMs, 'ms; maxEvent', Math.max(0, ...r.eventTiming.map((e) => e.dur)), 'ms; commits', r.commits, 'rendered', r.rendered, 'script', r.cdp.ScriptDuration, 'task', r.cdp.TaskDuration)
}
out.outbox = await page.evaluate(() => window.__perfOutbox?.useOutbox.getState().pending)
out.loadAfter = load()
out.errors = errors
const f = `${E}/tarjeta-${fixture}-cpu${rate}-${Date.now()}.json`
writeFileSync(f, JSON.stringify(out, null, 2))
console.log('saved', f, 'load', out.loadBefore, '→', out.loadAfter, 'pending', out.outbox, 'errors', errors)
await b.close()
