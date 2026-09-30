import { launch } from './lib.mjs'
import sharp from 'sharp'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4193/t/_/full12-live')
await page.evaluate(() => navigator.serviceWorker.ready)
await page.reload({ waitUntil: 'networkidle' })
await ctx.setOffline(true)
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Compartir tabla' }).first().click()])
await dl.saveAs('cards/fixcheck-offline-nocachebust.png')
const a = await sharp('cards/fixcheck-offline-nocachebust.png').raw().toBuffer({ resolveWithObject: true })
const o = await sharp('cards/leaderboard-full12.png').raw().toBuffer({ resolveWithObject: true })
let diff = 0
if (a.info.width === o.info.width && a.info.height === o.info.height) { for (let i = 0; i < a.data.length; i++) if (Math.abs(a.data[i] - o.data[i]) > 24) diff++ }
console.log('offline (cacheBust off)', a.info.width + 'x' + a.info.height, 'vs online original', o.info.width + 'x' + o.info.height, '| differing channel values:', diff, `(${(100 * diff / a.data.length).toFixed(3)}%)`)
await b.close()
