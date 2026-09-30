import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:4173/t/_/full12-live', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)
console.log(JSON.stringify(await p.evaluate(() => { const m = document.querySelector('main').getBoundingClientRect(); const nav = document.querySelector('nav[aria-label]').getBoundingClientRect(); return { main: [Math.round(m.left), Math.round(m.width)], nav: [Math.round(nav.left), Math.round(nav.width)], maxW: getComputedStyle(document.querySelector('main')).maxWidth } })))
await b.close()
