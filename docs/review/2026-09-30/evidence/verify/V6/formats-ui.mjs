// V6 (STRAT-03): the same contradictions as users see them, on the in-memory fixtures (my server :4206).
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const BASE = 'http://127.0.0.1:4206'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V6'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX' })
const page = await ctx.newPage()
const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ')
const log = {}
for (const fx of ['match8', 'stroke8', 'team8']) {
  const r = (log[fx] = {})
  // En vivo: board top rows + feed
  await page.goto(`${BASE}/t/_/${fx}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  const live = await text()
  r.liveFeed = (live.match(/Lo último \/ (.*)/)?.[1] ?? '').split(' / ').slice(0, 12)
  r.liveLeadLines = r.liveFeed.filter((l) => /Cambio de líder/.test(l))
  r.liveBoardHead = live.slice(0, 700)
  await page.screenshot({ path: `${OUT}/ui-${fx}-live-full.png`, fullPage: true })
  // Reglamento
  await page.goto(`${BASE}/t/_/${fx}/reglamento`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const rules = await text()
  r.rulesCut = rules.split(' / ').filter((l) => /Recorte|Desempate|último lugar|Stableford/i.test(l))
  // Ceremonia: start, then Siguiente until the champion step (max 30 taps)
  await page.goto(`${BASE}/t/_/${fx}/ceremonia`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const start = page.getByRole('button', { name: /Empezar la ceremonia/ })
  if (await start.count()) await start.click()
  let champ = null
  r.ceremonySteps = []
  for (let i = 0; i < 40 && !champ; i++) {
    await page.waitForTimeout(400)
    const reveal = page.getByRole('button', { name: /^Revelar$/ })
    if (await reveal.count()) {
      await reveal.first().click()
      await page.waitForTimeout(900)
    }
    const tx = await text()
    r.ceremonySteps.push(tx.replace(/^.*?(\d+ \/ \d+)?/, '').slice(0, 160))
    if (/Se lleva/.test(tx)) { champ = tx; break }
    const next = page.getByRole('button', { name: /^Siguiente/ })
    if (!(await next.count()) || !(await next.first().isEnabled())) break
    await next.first().click()
  }
  r.ceremonyChampion = champ ? champ.slice(0, 400) : null
  if (champ) await page.screenshot({ path: `${OUT}/ui-${fx}-ceremonia-champion.png` })
  // Estadísticas: race legend
  await page.goto(`${BASE}/t/_/${fx}/stats`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  r.statsLegend = await page.evaluate(() => [...document.querySelectorAll('.recharts-legend-item-text, .recharts-legend-item')].map((e) => e.textContent).slice(0, 12))
  r.statsLines = await page.evaluate(() => ({ paths: document.querySelectorAll('.recharts-line-curve').length, withD: [...document.querySelectorAll('.recharts-line-curve')].filter((p) => (p.getAttribute('d') || '').length > 10).length }))
  const stats = await text()
  r.statsPtsMentions = stats.split(' / ').filter((l) => /pts|puntos/i.test(l)).slice(0, 6)
  await page.screenshot({ path: `${OUT}/ui-${fx}-stats-full.png`, fullPage: true })
}
fs.writeFileSync(`${OUT}/formats-ui.json`, JSON.stringify(log, null, 2))
console.log(JSON.stringify(log, null, 2))
await browser.close()
