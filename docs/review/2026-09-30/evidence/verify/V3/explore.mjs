import { launch, phone, BASE, sleep } from './lib.mjs'
const b = await launch()
const { ctx, page } = await phone(b)
for (const sec of ['handicaps', 'scores', 'rondas', 'jugadores', 'campos']) {
  await page.goto(`${BASE}/t/_/full12-live/admin/${sec}`, { waitUntil: 'domcontentloaded' })
  await sleep(1500)
  const btns = await page.evaluate(() => [...document.querySelectorAll('main button, main [role=button], button')].map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30)).filter(Boolean))
  const uniq = [...new Set(btns)]
  console.log(sec, uniq.length, JSON.stringify(uniq.slice(0, 60)))
}
await b.close()
