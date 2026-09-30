// Scratch-only: screenshots of money copy in context (fixtures, no DB).
import { chromium } from 'playwright-core'
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/'
const BASE = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX', timezoneId: 'America/Mazatlan' })
const page = await ctx.newPage()
const out = []
async function shot(name, full = false) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: SHOTS + name, fullPage: full })
  out.push(name)
}

// 1. Finished tournament, Liquidación: unpaid rows carry a button that reads "Pagado".
await page.goto(`${BASE}/t/_/full12-finished/dinero`, { waitUntil: 'networkidle' })
await page.getByRole('tab', { name: 'Liquidación' }).click().catch(() => page.getByText('Liquidación', { exact: true }).click())
await page.getByText('Quién debe qué').scrollIntoViewIfNeeded()
await shot('t_dinero-full12-finished-15pro-light-copy-checklist.png')
// the bank list further down
await page.getByText('Vía banco', { exact: true }).first().scrollIntoViewIfNeeded()
await page.evaluate(() => window.scrollBy(0, 200))
await shot('t_dinero-full12-finished-15pro-light-copy-viabanco.png')

// 2. Live Dinero: "Pagó $…" on the person line; open a person and a prize explanation.
await page.goto(`${BASE}/t/_/full12-live/dinero`, { waitUntil: 'networkidle' })
await shot('t_dinero-full12-live-15pro-light-copy-pago.png')
await page.getByText('Camilo', { exact: true }).first().click()
await page.waitForTimeout(300)
await shot('t_dinero-full12-live-15pro-light-copy-breakdown.png')
// open the first "how" trigger on a prize amount (Individual 1º)
const how = page.locator('[class*="breakdown"] button').first()
await how.click().catch(() => {})
await shot('t_dinero-full12-live-15pro-light-copy-how.png')
const sheetText = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((d) => d.innerText).join('\n---\n'))
console.log('SHEET:', sheetText)

// 3. longnames: tie label "T3º" in the prize line.
await page.goto(`${BASE}/t/_/longnames/dinero`, { waitUntil: 'networkidle' })
const tRow = await page.evaluate(() => document.body.innerText)
console.log('LONGNAMES has T3º in page?', /T\dº/.test(tRow))
await browser.close()
console.log(out.join('\n'))
