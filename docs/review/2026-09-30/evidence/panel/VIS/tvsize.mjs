import { chromium } from 'playwright-core'
import { EXE, BASE } from './lib.mjs'
// 55" 16:9 panel at 1920x1080 CSS px, viewer at 4 m
const DIAG_IN = 55, DIST_MM = 4000
const H_MM = DIAG_IN * 25.4 * 9 / Math.hypot(16, 9)
const MM_PER_PX = H_MM / 1080
const arcmin = (mm) => (2 * Math.atan(mm / 2 / DIST_MM)) * 180 / Math.PI * 60
const CAP = 0.686 // Archivo cap height / em (src/design/logoMark.json)
const route = process.argv[2], waitMs = +(process.argv[3] || 800), shot = process.argv[4]
const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'es-MX', timezoneId: 'America/Mazatlan', reducedMotion: 'reduce' })
const page = await ctx.newPage()
await page.goto(BASE + route, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(waitMs)
const r = await page.evaluate(() => {
  const vis = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let n
  while ((n = walker.nextNode())) {
    const t = n.textContent.trim(); if (!t) continue
    const el = n.parentElement; const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue
    const range = document.createRange(); range.selectNodeContents(n); const b = range.getBoundingClientRect()
    if (b.width === 0 || b.bottom <= 0 || b.top >= innerHeight) continue
    vis.push({ t: t.slice(0, 40), fs: parseFloat(cs.fontSize), fw: cs.fontWeight, color: cs.color, clipped: b.bottom > innerHeight })
  }
  const rows = [...document.querySelectorAll('[class*="_row_"]')]
  const rowInfo = { dom: rows.length, fullyVisible: rows.filter(r => { const b = r.getBoundingClientRect(); const p = r.parentElement.getBoundingClientRect(); return b.bottom <= Math.min(innerHeight, p.bottom) + 1 }).length }
  return { vis, rowInfo, title: document.querySelector('h2')?.textContent }
})
const bySize = {}
for (const v of r.vis) (bySize[v.fs] ||= []).push(v.t)
console.log(`route ${route}  board «${r.title}»  rows in DOM ${r.rowInfo.dom}, fully visible ${r.rowInfo.fullyVisible}`)
console.log('font px | cap mm on 55" | arcmin @4m | examples')
for (const fs of Object.keys(bySize).map(Number).sort((a, b) => a - b)) {
  const capmm = fs * CAP * MM_PER_PX
  console.log(`${fs.toFixed(1).padStart(6)} | ${capmm.toFixed(1).padStart(5)} | ${arcmin(capmm).toFixed(1).padStart(5)} | ${[...new Set(bySize[fs])].slice(0, 5).join(' / ')}`)
}
if (shot) await page.screenshot({ path: shot })
await browser.close()
