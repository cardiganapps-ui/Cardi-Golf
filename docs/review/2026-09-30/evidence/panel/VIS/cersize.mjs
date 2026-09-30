import { chromium } from 'playwright-core'
import { EXE, BASE } from './lib.mjs'
const H_MM = 55 * 25.4 * 9 / Math.hypot(16, 9), MM_PER_PX = H_MM / 1080
const arcmin = (mm) => (2 * Math.atan(mm / 2 / 4000)) * 180 / Math.PI * 60
const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'es-MX', timezoneId: 'America/Mazatlan', reducedMotion: 'reduce' })
const page = await ctx.newPage()
await page.goto(BASE + '/t/_/full12-finished/ceremonia', { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(700)
const measure = async (label, shot) => {
  const r = await page.evaluate(() => {
    const out = {}
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n
    while ((n = walker.nextNode())) { const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; const cs = getComputedStyle(el); const range = document.createRange(); range.selectNodeContents(n); const b = range.getBoundingClientRect(); if (!b.width || b.top >= innerHeight) continue; (out[cs.fontSize] ||= []).push(t.slice(0, 28)) }
    const main = document.querySelector('main') || document.body
    // content bounding box: union of visible text
    let minX = 1e9, maxX = 0, minY = 1e9, maxY = 0
    const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let m
    while ((m = w2.nextNode())) { if (!m.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(m); const b = rg.getBoundingClientRect(); if (!b.width) continue; minX = Math.min(minX, b.left); maxX = Math.max(maxX, b.right); minY = Math.min(minY, b.top); maxY = Math.max(maxY, b.bottom) }
    return { out, box: [Math.round(minX), Math.round(minY), Math.round(maxX), Math.round(maxY)] }
  })
  console.log(`— ${label}: text bbox x ${r.box[0]}–${r.box[2]} (of 1920), y ${r.box[1]}–${r.box[3]} (of 1080)`)
  for (const fs of Object.keys(r.out).sort((a, b) => parseFloat(a) - parseFloat(b))) { const px = parseFloat(fs); const cap = px * 0.686 * MM_PER_PX; console.log(`   ${fs.padStart(8)}  ${arcmin(cap).toFixed(1).padStart(5)}′  ${[...new Set(r.out[fs])].slice(0, 4).join(' / ')}`) }
  if (shot) await page.screenshot({ path: shot })
}
await measure('start', process.argv[2] ? process.argv[2] + '-start.png' : null)
await page.getByRole('button', { name: /Empezar/ }).first().click(); await page.waitForTimeout(800)
for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: /Siguiente/ }).first().click().catch(() => {}); await page.waitForTimeout(700) }
await measure('step 3', process.argv[2] ? process.argv[2] + '-step.png' : null)
for (let i = 0; i < 12; i++) { await page.getByRole('button', { name: /Siguiente/ }).first().click().catch(() => {}); await page.waitForTimeout(500) }
await measure('step 15')
await browser.close()
