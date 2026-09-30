// Scratch-only: walk the wizard demo (/organizer/nuevo/_, no DB) and dump each step's text.
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const DIR = new URL('./', import.meta.url).pathname
const BASE = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: 'es-MX' })
const page = await ctx.newPage()
const out = []
await page.goto(`${BASE}/organizer/nuevo/_`, { waitUntil: 'networkidle' })
await page.getByLabel('Nombre del torneo').fill('Copa de los Compadres').catch(() => {})
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(500)
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
  const txt = await page.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText)
  out.push(`--- step ${i}\n${txt}`)
  // turn money on when asked, to read the money step
  const yes = page.getByRole('radio', { name: /^Sí/ }).or(page.getByRole('button', { name: /^Con dinero|^Sí/ }))
  if (/¿Juegan por dinero\?/.test(txt) && (await yes.count())) await yes.first().click().catch(() => {})
  const next = page.getByRole('button', { name: /^Siguiente$/ })
  if (!(await next.count()) || (await next.first().isDisabled())) break
  await next.first().click()
}
writeFileSync(DIR + 'text/wizard.txt', out.join('\n'))
await browser.close()
console.log(out.length, 'steps captured')
