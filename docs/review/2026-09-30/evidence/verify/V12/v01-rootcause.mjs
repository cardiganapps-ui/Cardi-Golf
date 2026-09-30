// V12 / VIS-01 root cause: (a) which rule supplies `display` on the rows, per the
// CSSOM order of the loaded stylesheets; (b) re-measure after forcing the grid the
// screens declare (and the pre-#54 transfer grid) with !important.
import { chromium } from 'playwright-core'
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:4212'
const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-MX', reducedMotion: 'reduce' })
const page = await ctx.newPage()
async function go(path, tab) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  if (tab) { const b = page.getByRole('button', { name: tab }).first(); if (await b.count()) await b.click(); else await page.getByText(tab).first().click(); await page.waitForTimeout(400) }
}
const cascade = () => {
  // every stylesheet rule whose selector is exactly one of the row's classes and sets display
  const r = document.querySelector('[class*="_rowLine_d3vna"]') || document.querySelector('[class*="_transfer_"]')
  const classes = [...r.classList]
  const hits = []
  let order = 0
  for (const sh of document.styleSheets) {
    let rules; try { rules = sh.cssRules } catch { continue }
    for (const rule of rules) {
      order++
      if (!rule.selectorText) continue
      for (const c of classes) if (rule.selectorText === '.' + c && rule.style.display) hits.push({ order, sheet: (sh.href || 'inline').split('/').pop(), selector: rule.selectorText, display: rule.style.display })
    }
  }
  return { classes, computed: getComputedStyle(r).display, hits }
}
const cols = (sel) => [...document.querySelectorAll(sel)].filter((r) => r.offsetParent).map((r) => {
  const rb = r.getBoundingClientRect(); const k = [...r.children].filter((c) => c.getBoundingClientRect().width > 0)
  const last = k[k.length - 1]?.getBoundingClientRect(); const fig = k[1]?.getBoundingClientRect()
  return { figRight: Math.round(fig?.right ?? 0), lastRight: Math.round(last?.right ?? 0), rowRight: Math.round(rb.right) }
})
const spread = (xs, f) => { const v = xs.map(f); return `${Math.min(...v)}..${Math.max(...v)} (spread ${Math.max(...v) - Math.min(...v)})` }

await go('/t/_/full12-live/juegos', /Calcutta/)
console.log('CASCADE Juegos row:', JSON.stringify(await page.evaluate(cascade), null, 1))
let a = await page.evaluate(cols, '[class*="_rowLine_d3vna"]')
let b = await page.evaluate(cols, '[class*="_gameRow_d3vna"]')
console.log('AS SHIPPED  slots fig right x', spread(a, (x) => x.figRight), '| owners fig right x', spread(b, (x) => x.figRight))
await page.addStyleTag({ content: '[class*="_rowLine_d3vna"],[class*="_gameRow_d3vna"]{display:grid !important}' })
await page.waitForTimeout(200)
a = await page.evaluate(cols, '[class*="_rowLine_d3vna"]'); b = await page.evaluate(cols, '[class*="_gameRow_d3vna"]')
console.log('GRID FORCED slots fig right x', spread(a, (x) => x.figRight), '| owners fig right x', spread(b, (x) => x.figRight), '| row right', a[0].rowRight)

await go('/t/_/full12-live/dinero', /Liquidaci/)
console.log('CASCADE Dinero row:', JSON.stringify(await page.evaluate(cascade), null, 1))
let c = await page.evaluate(cols, '[class*="_transfer_"]')
console.log('AS SHIPPED  amount right x', spread(c, (x) => x.figRight), '| last cell right x', spread(c, (x) => x.lastRight))
await page.addStyleTag({ content: '[class*="_transfer_"]{display:grid !important;grid-template-columns:minmax(0,1fr) auto auto}' })
await page.waitForTimeout(200)
c = await page.evaluate(cols, '[class*="_transfer_"]')
console.log('PRE-#54 GRID amount right x', spread(c, (x) => x.figRight), '| last cell right x', spread(c, (x) => x.lastRight))
await browser.close()
