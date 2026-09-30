import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' })
const p = await ctx.newPage()
const state = () => p.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, mtp: navigator.maxTouchPoints, sh: document.scrollingElement.scrollHeight, ih: innerHeight, btn: [...document.querySelectorAll('.btn--sm')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.top + scrollY), Math.round(r.height)] }) }))
await p.goto('http://127.0.0.1:4173/t/_/full12-live', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)
const s0 = await state(); console.log('before', JSON.stringify(s0))
const cdp = await ctx.newCDPSession(p)
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 393, height: s0.sh, scale: 1 } })
const buf = Buffer.from(data, 'base64'); writeFileSync('_cdp.png', buf)
console.log('img', JSON.stringify(await sharp(buf).metadata().then(m => [m.width, m.height])))
console.log('after', JSON.stringify(await state()))
await p.goto('http://127.0.0.1:4173/t/_/full12-live/tarjeta', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200)
console.log('next page', JSON.stringify(await state()))
await b.close()
