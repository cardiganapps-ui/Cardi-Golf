import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
for (const fx of ['pairs8', 'minimal4-live']) {
  await page.goto(`http://127.0.0.1:4173/t/_/${fx}/ceremonia`, { waitUntil: 'networkidle' })
  await page.getByText('Empezar la ceremonia').click()
  let found = false
  for (let i = 0; i < 20 && !found; i++) {
    await page.waitForTimeout(400)
    const r = page.getByRole('button', { name: 'Revelar' }); if (await r.count()) { await r.first().click().catch(() => {}); await page.waitForTimeout(900) }
    const txt = await page.evaluate(() => document.body.innerText)
    if (/Se lleva el Putter/.test(txt)) { found = true; console.log(fx, 'step', i, '→', txt.split('\n').filter((l) => /Putter|campeón|puntos/i.test(l)).join(' | ')) }
    const n = page.getByRole('button', { name: 'Siguiente' }); if (!(await n.count()) || (await n.first().isDisabled())) break; await n.first().click()
  }
  if (!found) console.log(fx, 'no Putter line found')
}
await browser.close()
