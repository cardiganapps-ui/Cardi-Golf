// V7 repro for COPY-04 (scratch only). Nothing reaches the server with a PIN:
// every claim_player request is aborted inside the browser (route installed
// before any tile is tapped), and the script asserts that no claim_player
// response was ever received. One anonymous sign-in, state reused.
import { chromium } from 'playwright-core'
import { existsSync, writeFileSync } from 'node:fs'

const V = new URL('./', import.meta.url).pathname
const STATE = V + 'state.json'
const BASE = 'http://127.0.0.1:4207'
const out = []
const log = (k, v) => { out.push({ k, v }); console.log(k + ':', typeof v === 'string' ? v : JSON.stringify(v)) }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const mk = () => browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX', timezoneId: 'America/Mazatlan', ...(existsSync(STATE) ? { storageState: STATE } : {}) })

// Guard: count claim_player requests that got a real response (must stay 0).
let claimResponses = 0
let claimAborted = 0
const guard = async (ctx) => {
  await ctx.route('**/rest/v1/rpc/claim_player**', (r) => { claimAborted++; return r.abort('internetdisconnected') })
  ctx.on('response', (res) => { if (res.url().includes('/rpc/claim_player')) claimResponses++ })
}

async function bodyLines(page) {
  return (await page.evaluate(() => document.body.innerText)).split('\n').map((l) => l.trim()).filter(Boolean)
}
async function pickNonNico(page) {
  const tiles = page.locator('main button')
  const names = (await tiles.allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim())
  const idx = names.findIndex((n) => n && !/nico/i.test(n) && !/buscar|organizador|entrar|cuenta/i.test(n))
  await tiles.nth(idx).click()
  return names[idx]
}

// A) PIN typed while the claim request fails at the network level, phone still "online" (lie-fi).
{
  const ctx = await mk(); await guard(ctx)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await ctx.storageState({ path: STATE })
  log('A.entrar.first', (await bodyLines(page)).slice(0, 6).join(' | '))
  const who = await pickNonNico(page)
  log('A.player', who)
  await page.waitForTimeout(400)
  await page.keyboard.type('0000')
  await page.waitForTimeout(1500)
  const lines = await bodyLines(page)
  log('A.after', lines.slice(0, 14).join(' | '))
  log('A.rawErrorShown', lines.some((l) => /TypeError|Failed to fetch/.test(l)))
  log('A.navigatorOnLine', await page.evaluate(() => navigator.onLine))
  await page.screenshot({ path: V + 'copy04-A-pin-liefi.png' })
  await ctx.close()
}

// B) PIN typed after the phone actually lost signal (navigator.onLine false).
{
  const ctx = await mk(); await guard(ctx)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const who = await pickNonNico(page)
  log('B.player', who)
  await page.waitForTimeout(400)
  await ctx.setOffline(true)
  await page.keyboard.type('0000')
  await page.waitForTimeout(1500)
  const lines = await bodyLines(page)
  log('B.after', lines.slice(0, 14).join(' | '))
  log('B.rawErrorShown', lines.some((l) => /TypeError|Failed to fetch/.test(l)))
  log('B.navigatorOnLine', await page.evaluate(() => navigator.onLine))
  await page.screenshot({ path: V + 'copy04-B-pin-offline.png' })
  await ctx.close()
}

// C) Gate, first open of a tournament on this device, lookup fails while "online" (lie-fi).
{
  const ctx = await mk(); await guard(ctx)
  await ctx.route('**/rest/v1/rpc/lookup_tournament**', (r) => r.abort('connectionreset'))
  const page = await ctx.newPage()
  await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2500)
  const lines = await bodyLines(page)
  log('C.gate', lines.slice(0, 10).join(' | '))
  log('C.rawErrorShown', lines.some((l) => /TypeError|Failed to fetch/.test(l)))
  await page.screenshot({ path: V + 'copy04-C-gate-liefi.png' })
  await ctx.close()
}

// D) Gate, first open, the phone goes offline as the lookup is sent (navigator.onLine false in the catch).
{
  const ctx = await mk(); await guard(ctx)
  await ctx.route('**/rest/v1/rpc/lookup_tournament**', async (r) => { await ctx.setOffline(true); await r.abort('internetdisconnected') })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2500)
  const lines = await bodyLines(page)
  log('D.gate', lines.slice(0, 10).join(' | '))
  log('D.rawErrorShown', lines.some((l) => /TypeError|Failed to fetch/.test(l)))
  await page.screenshot({ path: V + 'copy04-D-gate-offline.png' })
  await ctx.close()
}

log('guard.claimAborted', claimAborted)
log('guard.claimResponsesFromServer', claimResponses)
writeFileSync(V + 'copy04-repro.json', JSON.stringify(out, null, 1))
await browser.close()
if (claimResponses !== 0) { console.error('A claim_player response came back: STOP'); process.exit(2) }
