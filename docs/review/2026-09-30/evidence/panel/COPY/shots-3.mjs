// Scratch-only: Comité Torneo tabs text + Historial raw error screenshot (fixtures, no DB writes).
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const DIR = new URL('./', import.meta.url).pathname
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/'
const BASE = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX', timezoneId: 'America/Mazatlan' })
const page = await ctx.newPage()
const out = []
await page.goto(`${BASE}/t/_/full12-live/admin/historial`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: SHOTS + 't_admin_historial-full12-live-15pro-light-copy-rawerror.png' })

for (const fx of ['full12-live', 'friends8']) {
  await page.goto(`${BASE}/t/_/${fx}/admin/torneo`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  const tabs = await page.locator('[role="tab"], [role="radio"]').allInnerTexts()
  out.push(`== ${fx} tabs: ${tabs.join(' | ')}`)
  for (const name of tabs) {
    const tab = page.getByRole('tab', { name, exact: true }).or(page.getByRole('radio', { name, exact: true })).first()
    try {
      await tab.click({ timeout: 3000 })
      await page.waitForTimeout(400)
      // open every <details> so hidden help is read too
      await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
      const txt = await page.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText)
      out.push(`--- ${fx} / ${name}\n${txt}`)
    } catch (e) {
      out.push(`--- ${fx} / ${name}: click failed ${e.message.split('\n')[0]}`)
    }
  }
}
writeFileSync(DIR + 'text/comite-torneo-tabs.txt', out.join('\n'))
await browser.close()
console.log(out.filter((l) => l.startsWith('==')).join('\n'))
