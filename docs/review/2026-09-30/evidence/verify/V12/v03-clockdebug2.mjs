import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'es-MX', reducedMotion: 'reduce' })
const page = await ctx.newPage()
await page.clock.install({ time: new Date('2026-09-30T12:00:00Z') })
await page.goto('http://127.0.0.1:4212/t/_/full12-finished/tv', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('h2', { timeout: 20000 })
const h2 = () => page.evaluate(() => [...document.querySelectorAll('h2')].map(h => h.textContent.trim()).join(' | ') + ' @' + new Date().toISOString())
console.log('faked?', await page.evaluate(() => String(setInterval).slice(0, 60)))
console.log('t0', await h2())
for (let i = 1; i <= 4; i++) { await page.clock.fastForward(12100); await page.waitForTimeout(400); await page.clock.runFor(2000); await page.waitForTimeout(400); console.log('t' + i, await h2()) }
await browser.close()
