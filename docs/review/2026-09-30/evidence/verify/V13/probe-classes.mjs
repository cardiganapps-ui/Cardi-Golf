import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
await p.goto('http://127.0.0.1:4213/t/_/full12-live/tv', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
console.log(await p.evaluate(() => [...new Set([...document.querySelectorAll('[class]')].flatMap((e) => [...e.classList]))].slice(0, 40).join(' ')))
await b.close()
