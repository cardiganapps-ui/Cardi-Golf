import { chromium } from 'playwright-core'
const BASE = 'http://127.0.0.1:4173'
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX' })
const page = await ctx.newPage()
await page.goto(BASE + '/t/_/team8/stats', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
const y = await page.evaluate(() => {
  const el = [...document.querySelectorAll('h2,h3,span,p')].find((e) => e.textContent.trim() === 'Carrera de puntos')
  if (!el) return -1
  const r = el.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - 80); return window.scrollY
})
await page.waitForTimeout(3000)
console.log('scrolled to', y)
await page.screenshot({ path: `${SHOTS}/t_stats-team8-15pro-light-strat-race-legend.png` })
await browser.close()
