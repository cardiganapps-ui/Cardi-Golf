import { launch } from './lib.mjs'
import sharp from 'sharp'
import fs from 'node:fs'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true })
const page = await ctx.newPage()
const reqs = []
page.on('requestfailed', (r) => reqs.push('FAILED ' + r.url().replace('http://127.0.0.1:4193', '').slice(0, 90)))
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') reqs.push('console.' + m.type() + ': ' + m.text().slice(0, 120)) })
await page.goto('http://127.0.0.1:4193/t/_/full12-live')
await page.evaluate(() => navigator.serviceWorker.ready)
await page.reload({ waitUntil: 'networkidle' })
console.log('controlled', await page.evaluate(() => !!navigator.serviceWorker.controller))
await ctx.setOffline(true)
console.log('offline; navigator.onLine =', await page.evaluate(() => navigator.onLine))
const t = Date.now()
const res = await Promise.race([
  page.waitForEvent('download', { timeout: 30000 }).then(async (dl) => { await dl.saveAs('cards/leaderboard-full12-OFFLINE.png'); return 'downloaded' }),
  page.getByText('No se pudo generar la imagen.').waitFor({ timeout: 30000 }).then(() => 'toast: No se pudo generar'),
  (async () => { await page.getByRole('button', { name: 'Compartir tabla' }).first().click(); await new Promise(r => setTimeout(r, 31000)); return 'timeout' })(),
])
console.log('result', res, Date.now() - t, 'ms')
console.log(reqs.slice(0, 15).join('\n'))
if (res === 'downloaded') {
  const m = await sharp('cards/leaderboard-full12-OFFLINE.png').metadata(); console.log('offline card', m.width + 'x' + m.height)
  // side-by-side crop of the header: online vs offline
  const on = await sharp('cards/leaderboard-full12.png').extract({ left: 0, top: 0, width: 1080, height: 420 }).toBuffer()
  const off = await sharp('cards/leaderboard-full12-OFFLINE.png').extract({ left: 0, top: 0, width: 1080, height: 420 }).toBuffer()
  await sharp({ create: { width: 1080, height: 860, channels: 3, background: '#d00' } }).composite([{ input: on, top: 0, left: 0 }, { input: off, top: 440, left: 0 }]).png().toFile('cards/online-vs-offline-header.png')
}
await b.close()
