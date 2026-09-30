import { chromium } from 'playwright-core'
import sharp from 'sharp'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' })
const p = await ctx.newPage()
const state = () => p.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, mtp: navigator.maxTouchPoints, sh: document.scrollingElement.scrollHeight, ih: innerHeight, dpr: devicePixelRatio, btn: [...document.querySelectorAll('.btn--sm')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.top + scrollY), Math.round(r.height)] }) }))
await p.goto('http://127.0.0.1:4173/t/_/full12-live', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)
const s0 = await state(); console.log('before', JSON.stringify(s0))
const vp = await p.screenshot()
await p.setViewportSize({ width: 393, height: Math.min(s0.sh, 3200) })
await p.waitForTimeout(300)
console.log('resized', JSON.stringify(await state()))
const full = await p.screenshot()
await p.setViewportSize({ width: 393, height: 852 })
await p.waitForTimeout(300)
console.log('restored', JSON.stringify(await state()))
console.log('vp', JSON.stringify(await sharp(vp).metadata().then(m => [m.width, m.height])), 'full', JSON.stringify(await sharp(full).metadata().then(m => [m.width, m.height])))
// Compare the top 1500 device px (above the sticky bar) of both
const a = await sharp(vp).extract({ left: 0, top: 0, width: 786, height: 1500 }).raw().toBuffer()
const c = await sharp(full).extract({ left: 0, top: 0, width: 786, height: 1500 }).raw().toBuffer()
let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) diff++
console.log('differing bytes in top 1500 rows:', diff, 'of', a.length)
await b.close()
