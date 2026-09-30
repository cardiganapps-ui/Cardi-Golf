// V13 / ARCH-08 side claim: after leaving /t/ensayo client-side, a visibilitychange still refetches the whole tournament.
import { chromium } from 'playwright-core'
const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V13'
const STATE = `${E}/state-nico.json`
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: 'block', storageState: STATE })
const page = await ctx.newPage()
await page.goto('https://golf.cardigan.mx/t/ensayo', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('button[class*="leaderRow"]', { timeout: 60000 })
await new Promise((r) => setTimeout(r, 3000))
// Client-side navigation to the home route (React Router listens to popstate).
await page.evaluate(() => {
  history.pushState({}, '', '/')
  dispatchEvent(new PopStateEvent('popstate'))
})
await new Promise((r) => setTimeout(r, 3000))
const where = await page.evaluate(() => location.pathname + ' | ' + document.body.innerText.slice(0, 80).replace(/\n+/g, ' / '))
const rest = []
page.on('request', (r) => /supabase\.co\/rest\/v1\/[a-z_]+\?/.test(r.url()) && rest.push(r.url().replace(/^.*\/rest\/v1\//, '').replace(/\?.*$/, '')))
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
await new Promise((r) => setTimeout(r, 5000))
console.log('now at:', where)
console.log(`visibilitychange on the home screen → ${rest.length} REST selects: ${rest.join(', ')}`)
await ctx.storageState({ path: STATE })
await b.close()
