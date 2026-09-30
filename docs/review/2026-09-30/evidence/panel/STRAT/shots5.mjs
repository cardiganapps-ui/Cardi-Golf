import { chromium } from 'playwright-core'
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX' })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4173/t/_/match8', { waitUntil: 'networkidle' }); await page.waitForTimeout(1200)
const y = await page.evaluate(() => {
  const el = [...document.querySelectorAll('h2,h3')].find((e) => e.textContent.trim() === 'Lo último')
  if (!el) return -1
  window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 90); return window.scrollY
})
await page.waitForTimeout(700)
console.log('scrolled', y)
await page.screenshot({ path: `${SHOTS}/t-match8-15pro-light-strat-feed-pts.png` })
await browser.close()
