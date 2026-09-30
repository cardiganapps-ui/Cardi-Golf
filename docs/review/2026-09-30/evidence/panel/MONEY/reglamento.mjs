import { chromium } from '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/node_modules/playwright-core/index.mjs'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 393, height: 852 } })
const out = {}
for (const fx of ['minimal4-live', 'full12-finished', 'pairs8']) {
  await page.goto(`http://127.0.0.1:4173/t/_/${fx}/reglamento`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  out[fx] = await page.locator('main, body').first().innerText()
}
console.log(JSON.stringify(out, null, 1))
await browser.close()
