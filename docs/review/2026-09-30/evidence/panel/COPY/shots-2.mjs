// Scratch-only: ceremony text walk, Tarjeta badge, longnames tie label (fixtures, no DB).
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const DIR = new URL('./', import.meta.url).pathname
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/'
const BASE = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX', timezoneId: 'America/Mazatlan' })
const page = await ctx.newPage()
const log = []

// Tarjeta: default values already claim "birdie neto" / "águila neto".
await page.goto(`${BASE}/t/_/full12-live/tarjeta`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.screenshot({ path: SHOTS + 't_tarjeta-full12-live-15pro-light-copy-aguilaneto.png' })

// longnames: expand people until a tie label shows.
await page.goto(`${BASE}/t/_/longnames/dinero`, { waitUntil: 'networkidle' })
const rows = page.locator('button[aria-expanded]')
const n = await rows.count()
for (let i = 0; i < n; i++) {
  await rows.nth(i).click()
  await page.waitForTimeout(150)
  const txt = await page.evaluate(() => document.body.innerText)
  const m = txt.match(/[^\n]*T\dº[^\n]*/)
  if (m) {
    log.push('longnames tie label: ' + m[0])
    await page.getByText(/T\dº/).first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: SHOTS + 't_dinero-longnames-15pro-light-copy-tie.png' })
    break
  }
  await rows.nth(i).click()
}

// Ceremony walk (TV size).
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${BASE}/t/_/full12-finished/ceremonia`, { waitUntil: 'networkidle' })
await page.getByText('Empezar la ceremonia').click()
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(350)
  const reveal = page.getByRole('button', { name: 'Revelar' })
  if (await reveal.count()) {
    await reveal.first().click().catch(() => {})
    await page.waitForTimeout(900)
  }
  const txt = await page.evaluate(() => document.body.innerText)
  log.push(`--- step ${i}\n${txt}`)
  if (/Se lleva el Putter/.test(txt)) await page.screenshot({ path: SHOTS + 't_ceremonia-full12-finished-laptop-light-copy-putter.png' })
  const next = page.getByRole('button', { name: 'Siguiente' })
  if (!(await next.count()) || (await next.first().isDisabled())) break
  await next.first().click()
}
writeFileSync(DIR + 'ceremony-walk.txt', log.join('\n'))
await browser.close()
console.log(log.slice(0, 2).join('\n'))
