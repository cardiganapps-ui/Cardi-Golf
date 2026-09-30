// Calcutta night: the auctioneer console mid-lot (phone) and the TV board (1920x1080), on the scratch build (:4189)
// with fixture auction12 (lot 5 open, 3 bids). Writes fail (no backend), so this measures layout, reach and taps-per-action.
import { launch, phone, Journey, saveJson, shot, sleep, log, measureTargets, zone } from './lib.mjs'
const B2 = 'http://127.0.0.1:4189'
const b = await launch()
const out = {}
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${B2}/t/_/auction12/admin/calcutta`, { waitUntil: 'networkidle' })
  await sleep(600)
  await shot(p, 't_admin_calcutta-auction12-15pro-light-ux-console.png')
  await shot(p, 't_admin_calcutta-auction12-15pro-light-ux-console-full.png', { fullPage: true })
  out.text = (await p.evaluate(() => document.body.innerText)).slice(0, 1500)
  const targets = await measureTargets(p)
  saveJson('targets-calcutta-console', targets)
  // Where are the key controls (page coordinates) and in which thumb zone once scrolled to them?
  const where = async (loc, label) => {
    const el = loc.first()
    const box = await el.boundingBox().catch(() => null)
    const page = box ? await p.evaluate(() => window.scrollY) : 0
    return { label, y: box ? Math.round(box.y + page) : null, h: box ? Math.round(box.height) : null, w: box ? Math.round(box.width) : null }
  }
  out.layout = [
    await where(p.getByRole('radiogroup').first(), 'bidder tiles (start)'),
    await where(p.getByRole('button', { name: /\+\s*\$250|\$250/ }), '+$250'),
    await where(p.getByRole('button', { name: /Deshacer/ }), 'Deshacer puja'),
    await where(p.getByRole('button', { name: /Vendido/ }), '¡Vendido!'),
  ]
  out.scrollHeight = await p.evaluate(() => document.documentElement.scrollHeight)
  // A bid = pick a tile + an amount: does the pick survive the bid (so a forgotten re-pick raises the same bidder)?
  const tiles = p.getByRole('radiogroup').first().getByRole('radio')
  out.tiles = await tiles.count()
  const j = new Journey('calcutta-bid', p)
  await j.tap(tiles.nth(1), 'pick bidder')
  const inc = p.getByRole('button', { name: /250/ }).first()
  await j.tap(inc, '+$250 (write fails on the fixture)')
  await sleep(600)
  out.pickAfterBid = await tiles.nth(1).getAttribute('aria-checked')
  out.bidToast = await p.locator('[class*="toaster"]').allTextContents()
  // Hammer: does "¡Vendido!" ask before selling?
  const hammer = p.getByRole('button', { name: /Vendido/ }).first()
  await j.tap(hammer, '¡Vendido!')
  await sleep(500)
  out.hammerConfirm = await p.getByRole('dialog').isVisible().catch(() => false)
  out.hammerToast = await p.locator('[class*="toaster"]').allTextContents()
  out.bid = j.summary()
  log('calcutta', JSON.stringify({ layout: out.layout, scrollHeight: out.scrollHeight, tiles: out.tiles, pickAfterBid: out.pickAfterBid, hammerConfirm: out.hammerConfirm, hammerToast: out.hammerToast, bidToast: out.bidToast }))
  await ctx.close()
}
// TV board
{
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'es-MX' })
  await ctx.route(/supabase\.co/, (r) => r.abort())
  const p = await ctx.newPage()
  await p.goto(`${B2}/t/_/auction12/tv`, { waitUntil: 'networkidle' })
  await sleep(1500)
  await shot(p, 't_tv-auction12-tv-dark-ux-auction.png')
  out.tvText = (await p.evaluate(() => document.body.innerText)).slice(0, 1200)
  await ctx.close()
}
// Draw after the last lot (draw12: all sold, no pairs) on the phone.
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${B2}/t/_/draw12/admin/parejas`, { waitUntil: 'networkidle' })
  await sleep(600)
  await shot(p, 't_admin_parejas-draw12-15pro-light-ux.png')
  await shot(p, 't_admin_parejas-draw12-15pro-light-ux-full.png', { fullPage: true })
  out.drawText = (await p.evaluate(() => document.body.innerText)).slice(0, 1500)
  const t = await measureTargets(p)
  saveJson('targets-draw', t)
  await ctx.close()
}
saveJson('calcutta', out)
await b.close()
