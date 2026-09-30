// Scratch-only: show which raw error strings reach a player on the real app path.
// No data is written: the RPCs are aborted inside the browser before they leave it.
// One anonymous sign-in at most; the storage state is reused on later runs.
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
const DIR = new URL('./', import.meta.url).pathname
const STATE = DIR + 'state.json'
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/'
const BASE = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX', timezoneId: 'America/Mazatlan',
  ...(existsSync(STATE) ? { storageState: STATE } : {}),
})
const page = await ctx.newPage()

// A) Entrar: PIN submit while the claim request fails at the network level (signal drops, phone still "online").
await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await ctx.storageState({ path: STATE })
const body0 = await page.evaluate(() => document.body.innerText)
console.log('ENTRAR first lines:', body0.split('\n').slice(0, 8).join(' | '))
await page.route('**/rest/v1/rpc/claim_player*', (r) => r.abort('internetdisconnected'))
// pick a player that is not Nico, so nothing about the smoke test's player changes
const tiles = page.locator('main button')
const names = await tiles.allInnerTexts()
console.log('tiles:', names.slice(0, 12).join(' / '))
const idx = names.findIndex((n) => n.trim() && !/nico/i.test(n) && !/buscar|organizador/i.test(n))
await tiles.nth(idx).click()
await page.waitForTimeout(500)
await page.keyboard.type('0000')
await page.waitForTimeout(1500)
const txtA = await page.evaluate(() => document.body.innerText)
console.log('ENTRAR after failed claim:', txtA.split('\n').filter((l) => l.trim()).slice(0, 20).join(' | '))
await page.screenshot({ path: SHOTS + 't_entrar-ensayo-15pro-light-copy-rawerror.png' })

// B) Gate: the lookup fails while online, on a device that never opened this tournament.
const ctx2 = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX', storageState: STATE })
const p2 = await ctx2.newPage()
await p2.route('**/rest/v1/rpc/lookup_tournament*', (r) => r.abort('connectionreset'))
await p2.goto(`${BASE}/t/ensayo-no-cache-${Date.now() % 1000}`, { waitUntil: 'networkidle' }).catch(() => {})
await p2.waitForTimeout(2500)
const txtB = await p2.evaluate(() => document.body.innerText)
console.log('GATE after failed lookup:', txtB.split('\n').filter((l) => l.trim()).slice(0, 12).join(' | '))
await p2.screenshot({ path: SHOTS + 't_gate-ensayo-15pro-light-copy-rawerror.png' })
await browser.close()
