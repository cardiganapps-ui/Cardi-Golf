import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'es-MX', reducedMotion: 'reduce' })
const page = await ctx.newPage()
const mode = process.argv[2] || 'install'
if (mode === 'install') await page.clock.install()
await page.goto('http://127.0.0.1:4212/t/_/full12-finished/tv', { waitUntil: 'networkidle' })
const h2 = () => page.evaluate(() => [...document.querySelectorAll('h2')].map(h => h.textContent.trim()).join(' | '))
console.log('t0', await h2())
for (let i = 1; i <= (mode === "install" ? 7 : 2); i++) {
  if (mode === 'install') { await page.clock.runFor(12000); await page.waitForTimeout(300); await page.clock.runFor(1000); await page.waitForTimeout(300) }
  else { await page.waitForTimeout(12500) }
  console.log('t' + i, await h2())
}
await browser.close()
