import { chromium } from 'playwright-core'
const BASE = 'http://127.0.0.1:4173'
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX' })
const page = await ctx.newPage()
await page.goto(BASE + '/t/_/team8/stats', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
const h = page.getByRole('heading', { name: /Carrera de puntos/ })
await h.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -40)); await page.waitForTimeout(3500)
await page.screenshot({ path: `${SHOTS}/t_stats-team8-15pro-light-strat-race-legend.png` })
const legend = await page.evaluate(() => [...document.querySelectorAll('.recharts-legend-item-text, .recharts-legend-item')].map(e => e.textContent))
console.log('legend items:', JSON.stringify(legend))
const svgText = await page.evaluate(() => [...document.querySelectorAll('svg text')].map(e => e.textContent).join('|'))
console.log('svg texts:', svgText.slice(0, 400))
await browser.close()
