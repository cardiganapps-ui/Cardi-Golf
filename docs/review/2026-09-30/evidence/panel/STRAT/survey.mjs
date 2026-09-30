// Survey: for each route, count visible interactive controls, page height, headings; viewport screenshot to scratch.
import { chromium } from 'playwright-core'
const BASE = 'http://127.0.0.1:4173'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/STRAT/walk'
const routes = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX', colorScheme: 'light' })
const page = await ctx.newPage()
const results = []
for (const r of routes) {
  await page.goto(BASE + r, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(800)
  const info = await page.evaluate(() => {
    const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0 }
    const q = (sel) => [...document.querySelectorAll(sel)].filter(vis)
    const controls = q('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio]')
    return {
      title: document.title,
      h1: q('h1').map((e) => e.textContent.trim()).slice(0, 2),
      h2: q('h2, h3, .label').map((e) => e.textContent.trim()).slice(0, 40),
      controls: controls.length,
      inputs: q('input:not([type=hidden]), select, textarea').length,
      buttons: q('button, [role=button]').length,
      links: q('a[href]').length,
      height: document.documentElement.scrollHeight,
      text: document.body.innerText.slice(0, 1500),
    }
  })
  const name = r.replace(/^\//, '').replace(/\//g, '_') || 'home'
  await page.screenshot({ path: `${OUT}/${name}.png` })
  results.push({ route: r, ...info })
}
console.log(JSON.stringify(results, null, 1))
await browser.close()
