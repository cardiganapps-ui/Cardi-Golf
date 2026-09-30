// PWA-01 «Deshacer» variant: correcting two played holes in a row; the second save lands on the toast's action.
import { launch, phone, BASE, sleep, logTo } from './lib.mjs'
const log = logTo('tarjeta-taps.log')
const b = await launch()
for (const geo of [{ name: '15pro-standalone 393x852 insets 59/34', width: 393, height: 852, insets: { top: 59, bottom: 34, left: 0, right: 0 } }, { name: 'se 375x667', width: 375, height: 667, insets: null }]) {
  const writes = []
  const { ctx, page } = await phone(b, { width: geo.width, height: geo.height, insets: geo.insets, onSupabase: async (route) => {
    const req = route.request()
    if (/\/rest\/v1\/scores/.test(req.url()) && req.method() === 'POST') { for (const r of [].concat(JSON.parse(req.postData() || '[]'))) writes.push(`h${r.hole}:${r.player_id}=${r.strokes}`); return route.fulfill({ status: 201, body: '' }) }
    return route.abort()
  } })
  await page.goto(`${BASE}/t/_/full12-live/tarjeta?hoyo=5`, { waitUntil: 'domcontentloaded' })
  const btn = page.locator('[class*=saveBar] button').first()
  await btn.waitFor(); await sleep(800)
  const num = () => page.locator('[class*=holeNum]').first().textContent()
  const strokes1 = () => page.locator('[class*=player]').first().locator('[role=group]').first().textContent()
  const before5 = await strokes1()
  await page.getByRole('button', { name: /Golpes: más/ }).first().tap(); await sleep(150)
  let bb = await btn.boundingBox()
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2) // fix hole 5, save
  await sleep(700)
  const toastText = await page.locator('[role=status]').first().textContent().catch(() => null)
  const on6 = await num()
  await page.getByRole('button', { name: /Golpes: más/ }).first().tap(); await sleep(1200) // fix hole 6
  bb = await btn.boundingBox()
  const x = bb.x + bb.width * 0.65, y = bb.y + bb.height / 2
  const target = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); const b = el?.closest('button'); return `${b ? 'BUTTON' : el?.tagName} "${(b ?? el)?.textContent?.trim().slice(0, 20)}"` }, { x, y })
  await page.touchscreen.tap(x, y) // meant for «Guardar hoyo» on hole 6
  await sleep(1500)
  log('UNDO-HIT', JSON.stringify({ geo: geo.name, hole5Player1Before: before5, toastAfterFirstSave: toastText, then: on6, secondTapHit: target, nowOnHole: await num(), writes }))
  await ctx.close()
}
await b.close()
