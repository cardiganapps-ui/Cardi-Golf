// V6 (ARCH-10): inject one render fault in one screen and see how much of the app it takes down,
// and whether anything leaves the device. Fixture route (in-memory), same route tree as /t/:slug.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const BASE = 'http://127.0.0.1:4206'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V6'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX' })
const page = await ctx.newPage()
const requests = []
const consoleErrors = []
page.on('request', (r) => requests.push({ t: Date.now(), method: r.method(), url: r.url() }))
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
await page.addInitScript(() => {
  window.__v6Throw = false
  const d = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, 'format')
  Object.defineProperty(Intl.NumberFormat.prototype, 'format', {
    configurable: true,
    get() {
      if (window.__v6Throw && this.resolvedOptions().style === 'currency') throw new TypeError('V6 injected render fault (currency format)')
      return d.get.call(this)
    },
  })
})
const tabBar = () => page.evaluate(() => {
  const labels = ['En vivo', 'Tarjeta', 'Juegos', 'Dinero', 'Más']
  const links = [...document.querySelectorAll('a')].map((a) => a.textContent?.trim())
  return labels.filter((l) => links.some((x) => x && x.startsWith(l)))
})
await page.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const log = { before: { url: page.url(), tabBar: await tabBar(), heading: await page.evaluate(() => document.querySelector('h1,h2')?.textContent) } }
await page.screenshot({ path: `${OUT}/fault-before-393.png` })
const mark = Date.now()
await page.evaluate(() => { window.__v6Throw = true })
await page.getByRole('link', { name: /^Dinero/ }).first().click()
await page.waitForTimeout(1500)
log.after = {
  url: page.url(),
  tabBar: await tabBar(),
  text: (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ').slice(0, 600),
  roleAlert: await page.evaluate(() => document.querySelector('[role=alert]')?.textContent?.slice(0, 300) ?? null),
  detailShown: await page.evaluate(() => document.body.innerText.includes('V6 injected')),
}
log.requestsAfterFault = requests.filter((r) => r.t >= mark).map((r) => `${r.method} ${r.url}`)
log.consoleErrors = consoleErrors
await page.screenshot({ path: `${OUT}/fault-after-393.png` })
fs.writeFileSync(`${OUT}/fault-inject.json`, JSON.stringify(log, null, 2))
console.log(JSON.stringify(log, null, 2))
await browser.close()
