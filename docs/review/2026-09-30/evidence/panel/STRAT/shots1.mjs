import { chromium } from 'playwright-core'
const BASE = 'http://127.0.0.1:4173'
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX' })
const page = await ctx.newPage()
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(900) }
const saved = []
async function shot(name) { const p = `${SHOTS}/${name}`; await page.screenshot({ path: p }); saved.push(p) }
async function scrollToText(text) { const loc = page.getByText(text, { exact: false }).first(); await loc.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -120)); await page.waitForTimeout(400) }

// 1. Match play board speaks Stableford: header PUNTOS, feed "+4 pts"
await go('/t/_/match8')
await shot('t-match8-15pro-light-strat-points-header.png')
await scrollToText('Lo último')
await shot('t-match8-15pro-light-strat-feed-pts.png')
// 2. Match play rules page describes the Stableford day-2 cut, "máximo 0"
await go('/t/_/match8/reglamento')
await scrollToText('Recorte del día 2')
await shot('t_reglamento-match8-15pro-light-strat-cut.png')
// 3. Team stats race chart legend
await go('/t/_/team8/stats')
await scrollToText('Carrera de puntos')
await shot('t_stats-team8-15pro-light-strat-race-legend.png')
// 4. Match play ceremony: step through to the champion
await go('/t/_/match8/ceremonia')
await page.getByRole('button', { name: /Empezar/ }).click()
for (let i = 0; i < 12; i++) {
  const txt = await page.evaluate(() => document.body.innerText)
  if (/1\.º lugar|Campe/i.test(txt) && /puntos/.test(txt)) break
  const next = page.getByRole('button', { name: /Siguiente|Revelar/ }).first()
  if (!(await next.isEnabled().catch(() => false))) break
  await next.click(); await page.waitForTimeout(700)
}
await page.waitForTimeout(1500)
console.log((await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ').slice(0, 600))
await shot('t_ceremonia-match8-15pro-light-strat-champion.png')
console.log(saved.join('\n'))
await browser.close()
