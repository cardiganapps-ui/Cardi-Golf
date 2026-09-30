// Does an impatient second tap on "Guardar hoyo" save the NEXT hole with untouched defaults?
import { launch, phone, BASE, shot, sleep, log } from './lib.mjs'
const b = await launch()
const results = []
for (const gap of [120, 250, 400, 700]) {
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/t/_/full12-live/tarjeta`, { waitUntil: 'networkidle' })
  await p.locator('text=Guardar hoyo').waitFor()
  const holeNum = p.locator('[class*="holeNum"]')
  const before = await holeNum.textContent()
  const btn = p.getByRole('button', { name: /Guardar hoyo/ })
  const box = await btn.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  // Two taps at the same spot, `gap` ms apart (a thumb that taps twice).
  await p.touchscreen.tap(x, y)
  await sleep(gap)
  await p.touchscreen.tap(x, y)
  await sleep(1200)
  const after = await holeNum.textContent()
  // Open the grid and read which holes are now marked played for row 1.
  await p.getByRole('button', { name: 'Ver tarjeta' }).tap()
  await sleep(500)
  const played = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('table tbody tr')]
    return rows
      .map((r) => {
        const cells = [...r.querySelectorAll('td')]
        const hole = cells[0]?.textContent?.trim()
        const c = cells[3]?.textContent?.trim()
        return { hole, c }
      })
      .filter((r) => /^\d+$/.test(r.hole || ''))
  })
  const toasts = await p.locator('[aria-live="polite"]').allTextContents()
  if (gap === 250) await shot(p, 't_tarjeta-full12-live-15pro-light-ux-doubletap-grid.png', { fullPage: true })
  const r = { gap, before, after, played: played.filter((x) => ['12', '13', '14'].includes(x.hole)), toasts }
  results.push(r)
  log('doubletap', JSON.stringify(r))
  await ctx.close()
}
await b.close()
