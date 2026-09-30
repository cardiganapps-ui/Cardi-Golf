// V8 / PWA-03 follow-up: (1) with the page idle for 15 s after load, a deploy is not noticed while open;
// (2) with a worker waiting, how often does a reload show the offer? (3) is a dropped offer a Toaster-mount race?
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const DIR = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V8'
const URL0 = process.argv[2] || 'http://127.0.0.1:4208/t/_/full12-live'
copyFileSync(`${DIR}/sw.orig.js`, `${DIR}/site/sw.js`)
const t0 = Date.now(); const T = () => ((Date.now() - t0) / 1000).toFixed(1) + 's'
const log = (...a) => console.log(T(), ...a)
const b = await chromium.launch({ executablePath: EXE })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => {
  window.__marks = { start: performance.now() }
  addEventListener('load', () => { window.__marks.load = Math.round(performance.now()) })
  const iv = setInterval(() => {
    if (!window.__marks.toast && [...document.querySelectorAll('[role=status]')].some((n) => /versi[oó]n nueva/i.test(n.textContent || ''))) window.__marks.toast = Math.round(performance.now())
    if (!window.__marks.shell && document.querySelector('main')) window.__marks.shell = Math.round(performance.now())
  }, 50)
  setTimeout(() => clearInterval(iv), 15000)
})
const swState = (p) => p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { controlled: !!navigator.serviceWorker.controller, waiting: r?.waiting?.state ?? null } })
const page = await ctx.newPage()
await page.goto(URL0, { waitUntil: 'networkidle' })
await page.evaluate(() => navigator.serviceWorker.ready)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(15000) // let the post-navigation soft update finish before deploying
log('1. controlled, idle 15 s:', JSON.stringify(await swState(page)))
writeFileSync(`${DIR}/site/sw.js`, readFileSync(`${DIR}/sw.orig.js`, 'utf8').replace('a25e7d6f615560f94fb45d905cab9cda', 'cafebabecafebabecafebabecafebabe'))
log('   deployed')
for (let i = 0; i < 6; i++) { await page.waitForTimeout(5000); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))) }
log('2. 30 s open after the deploy, no navigation:', JSON.stringify(await swState(page)), 'toast marks:', JSON.stringify(await page.evaluate(() => window.__marks)))
await page.reload({ waitUntil: 'networkidle' })
for (let i = 0; i < 40; i++) { if ((await swState(page)).waiting) break; await page.waitForTimeout(500) }
await page.waitForTimeout(2000)
log('3. reload #1 (finds the new worker):', JSON.stringify(await swState(page)), JSON.stringify(await page.evaluate(() => window.__marks)))
for (let i = 2; i <= 7; i++) {
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(4000)
  log(`4. reload #${i} with a worker waiting:`, JSON.stringify(await page.evaluate(() => window.__marks)))
}
await b.close()
copyFileSync(`${DIR}/sw.orig.js`, `${DIR}/site/sw.js`)
