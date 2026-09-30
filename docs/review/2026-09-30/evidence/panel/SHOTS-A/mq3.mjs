import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
const p = await ctx.newPage()
const q = async (label) => { await p.goto('http://127.0.0.1:4173/t/_/full12-live', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200); console.log(label, JSON.stringify(await p.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, hoverNone: matchMedia('(hover: none)').matches, touch: 'ontouchstart' in window, mtp: navigator.maxTouchPoints, iw: innerWidth, dpr: devicePixelRatio, btn: [...document.querySelectorAll('.btn--sm')].map(b => Math.round(b.getBoundingClientRect().height)) })))) }
await q('before')
await p.screenshot({ path: '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/SHOTS-A/_t.png', fullPage: true, clip: { x: 0, y: 0, width: 393, height: 1600 } })
await q('after fullPage+clip')
await b.close()
