import { launch, phone, BASE, sleep } from './lib.mjs'
const b = await launch()
const { ctx, page } = await phone(b)
for (const url of ['/t/_/friends8/admin/torneo', '/t/_/friends8/admin/juegos', '/organizer/nuevo/_']) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' })
  await sleep(2000)
  const btns = await page.evaluate(() => [...document.querySelectorAll('button, [role=tab]')].map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 28)).filter(Boolean))
  console.log(url, JSON.stringify([...new Set(btns)].slice(0, 80)))
}
await b.close()
