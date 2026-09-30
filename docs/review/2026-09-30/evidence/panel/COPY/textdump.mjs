// Scratch-only: dump the visible text of fixture routes so copy can be read in context.
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = new URL('./text/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const BASE = 'http://127.0.0.1:4173'
const fixtures = (process.argv[2] ?? 'full12-live').split(',')
const routes = (process.argv[3] ?? ',/tarjeta,/juegos,/dinero,/stats,/reglamento,/mas,/tv,/ceremonia,/imprimir').split(',')

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, locale: 'es-MX', timezoneId: 'America/Mazatlan' })
const page = await ctx.newPage()
for (const fx of fixtures) {
  for (const r of routes) {
    const url = `${BASE}/t/_/${fx}${r}`
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(600)
      const text = await page.evaluate(() => document.body.innerText)
      const name = `${fx}${r.replaceAll('/', '_') || '_live'}.txt`
      writeFileSync(OUT + name, `URL ${url}\n\n${text}\n`)
      console.log('ok', name, text.length)
    } catch (e) {
      console.log('fail', url, e.message)
    }
  }
}
await browser.close()
