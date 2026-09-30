import { launch } from './lib.mjs'
import sharp from 'sharp'
import fs from 'node:fs'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
const logs = []
page.on('console', (m) => { if (/warn|error/.test(m.type())) logs.push(m.type() + ': ' + m.text().slice(0, 160)) })
async function grab(label, trigger, throttle = 1) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  const t = Date.now()
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), trigger()])
  const ms = Date.now() - t
  const out = `cards/${label}.png`
  await dl.saveAs(out)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const meta = await sharp(out).metadata()
  const kb = (fs.statSync(out).size / 1024).toFixed(0)
  console.log(label.padEnd(28), `${meta.width}x${meta.height}`, kb + ' KB', `render+share ${ms} ms @${throttle}x CPU`, 'suggested:', dl.suggestedFilename())
  return out
}
const base = 'http://127.0.0.1:4173/t/_/'
// 1) leaderboard (12)
await page.goto(base + 'full12-live', { waitUntil: 'networkidle' })
await grab('leaderboard-full12', () => page.getByRole('button', { name: 'Compartir tabla' }).first().click())
await grab('leaderboard-full12-cpu4', () => page.getByRole('button', { name: 'Compartir tabla' }).first().click(), 4)
// 2) player's round
await page.locator('button[aria-label]').filter({ hasText: /Camilo/ }).first().click().catch(async () => { await page.getByText('Camilo').first().click() })
await page.getByRole('button', { name: 'Compartir mi ronda' }).waitFor({ timeout: 10000 })
await grab('player-full12', () => page.getByRole('button', { name: 'Compartir mi ronda' }).click())
// 3) settlement
await page.goto(base + 'full12-finished/dinero', { waitUntil: 'networkidle' })
await grab('settlement-full12-finished', () => page.getByRole('button', { name: 'Compartir', exact: true }).first().click())
// 4) large field
await page.goto(base + 'large60', { waitUntil: 'networkidle' })
await grab('leaderboard-large60', () => page.getByRole('button', { name: 'Compartir tabla' }).first().click())
await grab('leaderboard-large60-cpu4', () => page.getByRole('button', { name: 'Compartir tabla' }).first().click(), 4)
// 5) long names
await page.goto(base + 'longnames', { waitUntil: 'networkidle' })
await grab('leaderboard-longnames', () => page.getByRole('button', { name: 'Compartir tabla' }).first().click())
console.log('console warnings/errors:', [...new Set(logs)].slice(0, 12))
await b.close()
