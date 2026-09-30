import { chromium } from 'playwright-core'
const BASE = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, locale: 'es-MX' })
const page = await ctx.newPage()
for (const f of ['stroke8', 'match8', 'team8', 'full12-live']) {
  await page.goto(`${BASE}/t/_/${f}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(900)
  const txt = await page.evaluate(() => document.body.innerText)
  const lead = [...txt.matchAll(/Cambio de líder! ([^\n]+)/g)].map((m) => m[1])
  const board = txt.split('\n').slice(0, 40).join(' / ')
  console.log(`== ${f}\nleadChanges: ${JSON.stringify(lead.slice(0, 3))}\nboard: ${board.slice(0, 500)}\n`)
}
await browser.close()
