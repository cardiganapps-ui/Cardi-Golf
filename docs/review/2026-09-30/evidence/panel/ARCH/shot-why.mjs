import { chromium } from '/home/user/Cardi-Golf/node_modules/playwright-core/index.mjs'
const SH = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const p = await (await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, colorScheme: 'light' })).newPage()
await p.goto('http://127.0.0.1:4173/t/_/full12-finished/dinero', { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
await p.click('text=Si terminara ahora')
await p.waitForTimeout(600)
const rows = p.locator('button[aria-expanded]')
const n = await rows.count()
let done = false
for (let i = 0; i < n && !done; i++) {
  await rows.nth(i).click()
  await p.waitForTimeout(300)
  const btn = p.locator('button', { hasText: /^\+\$\d{1,2},\d{3}$/ }).first()
  if (await btn.count()) {
    console.log('row', i, 'clicking', await btn.innerText())
    await btn.scrollIntoViewIfNeeded()
    await btn.click()
    await p.waitForTimeout(900)
    const sheet = await p.locator('[role=dialog]').last().innerText().catch(() => '')
    console.log('SHEET:', sheet.replace(/\n/g, ' | ').slice(0, 300))
    await p.screenshot({ path: `${SH}/t_dinero-full12-finished-15pro-light-why-unformatted.png` })
    done = true
  } else await rows.nth(i).click()
}
await b.close()
