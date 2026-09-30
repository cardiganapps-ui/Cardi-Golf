// Tab-switch latency in the tournament shell (fixture, instrumented build): Event Timing per click at 4x CPU,
// plus commits / renders / mounts per switch. usage: node tabs.mjs <fixture> [rate=4] [passes=2]
import { writeFileSync } from 'node:fs'
import { launch, newPhone, sleep, load, E } from './perf-lib.mjs'

const fixture = process.argv[2] ?? 'full12-live'
const rate = Number(process.argv[3] ?? 4)
const PASSES = Number(process.argv[4] ?? 2)
const BASE = 'http://127.0.0.1:4186'
const b = await launch()
const ctx = await newPhone(b)
await ctx.route(/supabase\.co/, (r) => r.abort())
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await page.goto(`${BASE}/t/_/${fixture}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__perfStore?.getState().data, null, { timeout: 30000 })
await sleep(2000)
await page.evaluate(() => {
  window.__ev = []
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ev.push({ name: e.name, dur: e.duration, start: e.startTime, proc: e.processingEnd - e.processingStart }) }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
})
await cdp.send('Emulation.setCPUThrottlingRate', { rate })
const tabs = await page.locator('nav[aria-label] a').allInnerTexts()
const out = { fixture, rate, load: load(), tabs, switches: [] }
for (let p = 0; p < PASSES; p++) {
  for (const name of [...tabs.slice(1), tabs[0]]) {
    await page.evaluate(() => { window.__RCreset(); window.__evMark = window.__ev.length })
    await page.locator('nav[aria-label] a', { hasText: name }).first().click()
    await sleep(1200)
    const r = await page.evaluate(() => {
      const ev = window.__ev.slice(window.__evMark).filter((e) => ['pointerdown', 'pointerup', 'click', 'mousedown', 'mouseup'].includes(e.name))
      return { maxEventMs: ev.length ? Math.round(Math.max(...ev.map((e) => e.dur))) : '<16', clickProcessingMs: Math.round(ev.find((e) => e.name === 'click')?.proc ?? 0), commits: window.__RC.commits, rendered: window.__RC.nRendered, mounted: window.__RC.nMounted, dom: document.getElementsByTagName('*').length }
    })
    out.switches.push({ pass: p, tab: name.trim(), ...r })
    console.log(p, name.trim().padEnd(10), JSON.stringify(r))
  }
}
out.loadAfter = load()
writeFileSync(`${E}/tabs-${fixture}-cpu${rate}-${Date.now()}.json`, JSON.stringify(out, null, 2))
await b.close()
