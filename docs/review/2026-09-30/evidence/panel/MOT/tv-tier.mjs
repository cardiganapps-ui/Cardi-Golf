// Tier badge on the TV board surface: computed colors and contrast (production preview, TV individual board)
import { launch, ctx, BASE } from './lib.mjs'
const b = await launch()
const c = await ctx(b, 'tv')
const p = await c.newPage()
await p.goto(BASE + '/t/_/full12-live/tv', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
const r = await p.evaluate(() => {
  const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const [R, G, B] = m.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }); return 0.2126 * R + 0.7152 * G + 0.0722 * B }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100 }
  const bgOf = (el) => { while (el) { const bg = getComputedStyle(el).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg; el = el.parentElement } return 'rgb(255,255,255)' }
  const tb = document.querySelector('.tierBadge'); if (!tb) return null
  const cs = getComputedStyle(tb); const rect = tb.getBoundingClientRect()
  return { text: tb.textContent, color: cs.color, bg: bgOf(tb), border: cs.borderColor, fontSize: cs.fontSize, w: Math.round(rect.width), h: Math.round(rect.height), contrast: ratio(cs.color, bgOf(tb)) }
})
console.log(JSON.stringify(r))
await p.screenshot({ path: 'shots/tv-individual.png' })
await b.close()
