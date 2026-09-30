import { launch, ctx } from './lib.mjs'
const DEVBASE = process.env.DEVBASE || 'http://127.0.0.1:4196'
const b = await launch()
const c = await ctx(b, 'tv')
const p = await c.newPage()
await p.goto(DEVBASE + '/t/_/full12-live/tv', { waitUntil: 'networkidle' })
await p.waitForTimeout(2000)
await p.evaluate(async () => {
  const m = await import('/src/data/tournamentStore.ts'); window.__store = m.useTournament
  window.__store.getState().patch((s) => { s.tournament.status = 'auction'; s.scores = []; s.calcuttaBuybacks = []; s.calcuttaLots.sort((a, b) => a.lotNumber - b.lotNumber); s.calcuttaLots.forEach((l, i) => { if (i >= 6) { l.status = i === 6 ? 'open' : 'pending'; l.price = null; l.ownerId = null; l.soldAt = null } }); s.calcuttaBids = s.calcuttaBids.filter((bd) => s.calcuttaLots.findIndex((l) => l.id === bd.lotId) < 6) })
})
await p.waitForTimeout(800)
const r = await p.evaluate(() => {
  const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const [R, G, B] = m.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }); return 0.2126 * R + 0.7152 * G + 0.0722 * B }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100 }
  const tb = document.querySelector('[class*="lotMeta"] .tierBadge'); if (!tb) return 'none'
  const cs = getComputedStyle(tb); const rect = tb.getBoundingClientRect()
  return { text: tb.textContent, color: cs.color, bg: cs.backgroundColor, fontSize: cs.fontSize, w: Math.round(rect.width), h: Math.round(rect.height), contrastOnOwnBg: /rgba\(0, 0, 0, 0\)/.test(cs.backgroundColor) ? null : ratio(cs.color, cs.backgroundColor), metaFont: getComputedStyle(tb.parentElement).fontSize }
})
console.log(JSON.stringify(r))
await p.locator('[class*="lotMeta"]').screenshot({ path: 'shots/tv-lotmeta.png' })
await b.close()
