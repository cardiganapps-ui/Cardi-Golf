// Scratch-only: dump visible text of arbitrary routes (fixture and public pages; no writes).
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
const DIR = new URL('./', import.meta.url).pathname
const OUT = DIR + 'text/'
mkdirSync(OUT, { recursive: true })
const BASE = 'http://127.0.0.1:4173'
const paths = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: 'es-MX', timezoneId: 'America/Mazatlan', ...(existsSync(DIR + 'state.json') ? { storageState: DIR + 'state.json' } : {}) })
const page = await ctx.newPage()
for (const p of paths) {
  try {
    await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(800)
    const text = await page.evaluate(() => document.body.innerText)
    const name = 'r' + p.replaceAll('/', '_') + '.txt'
    writeFileSync(OUT + name, `URL ${BASE + p}\n\n${text}\n`)
    console.log('ok', name, text.length)
  } catch (e) {
    console.log('fail', p, e.message)
  }
}
await browser.close()
