import { chromium } from '/home/user/Cardi-Golf/node_modules/playwright-core/index.mjs'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 })).newPage()
await p.goto('http://127.0.0.1:4173/t/_/full12-finished/dinero', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
const texts = await p.locator('button').allInnerTexts()
console.log(texts.slice(0, 60).map((t) => t.replace(/\n/g, ' ')).join(' || '))
await b.close()
