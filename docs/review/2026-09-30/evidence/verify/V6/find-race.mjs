import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX' })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4206/t/_/team8/stats', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const h = page.getByRole('heading', { name: /Carrera de puntos/ })
await h.scrollIntoViewIfNeeded()
await page.evaluate(() => window.scrollTo(0, 0)); const box = await page.evaluate(() => { const e = [...document.querySelectorAll("h2,h3")].find((x) => /Carrera de puntos/.test(x.textContent || "")); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY } })
const info = await page.evaluate(() => {
  const head = [...document.querySelectorAll('h2,h3')].find((e) => /Carrera de puntos/.test(e.textContent || ''))
  let sec = head?.parentElement
  while (sec && sec.innerText.length < 60) sec = sec.parentElement
  return sec ? sec.innerText.replace(/\n+/g, ' / ').slice(0, 400) : null
})
console.log(JSON.stringify({ box, sectionText: info }))
await page.screenshot({ path: "ui-team8-stats-race.png", fullPage: true, clip: { x: 0, y: Math.max(0, box.y - 10), width: 393, height: 520 } })
await browser.close()
