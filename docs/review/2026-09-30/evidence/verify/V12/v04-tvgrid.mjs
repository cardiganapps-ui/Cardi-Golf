// V12 / VIS-04: TV rows — grid tracks vs children, per board.
// Rotation sped up to 1.5 s by an init script (layout untouched). For every board
// we record: resolved grid-template-columns, #children, which track each child's
// box falls in, whether the name wraps (multi-line) or truncates (scrollWidth >
// clientWidth), and the gap between the figure's right edge and the row's.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:4212'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V12'
const fx = process.env.FIX || 'full12-live'
const [W, H] = (process.env.VP || '1920x1080').split('x').map(Number)
const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'es-MX', timezoneId: 'America/Mazatlan', reducedMotion: 'reduce' })
await ctx.addInitScript(() => { const si = window.setInterval; window.setInterval = (fn, ms, ...a) => si(fn, ms === 12000 ? 2000 : ms, ...a) })
const page = await ctx.newPage()
await page.goto(`${BASE}/t/_/${fx}/tv`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
const seen = new Map()
const t0 = Date.now()
while (Date.now() - t0 < 30000) {
  const s = await page.evaluate(() => {
    const sec = document.querySelector('section')
    const title = sec?.querySelector('h2')?.textContent?.trim() ?? ''
    const cs = sec ? getComputedStyle(sec) : null
    const settled = !!cs && cs.opacity === '1'
    const box = sec?.querySelector('[class*="_rows_"]')
    if (!box || !settled) return { title, settled }
    const rows = [...box.querySelectorAll(':scope > [class*="_row_"]')]
    const bb = box.getBoundingClientRect()
    const out = rows.map((r) => {
      const rc = getComputedStyle(r)
      const rb = r.getBoundingClientRect()
      const tracks = rc.gridTemplateColumns.split(' ').map(parseFloat)
      // track x-ranges
      let x = rb.left + parseFloat(rc.paddingLeft); const gap = parseFloat(rc.columnGap)
      const ranges = tracks.map((w) => { const a = x; x += w + gap; return [Math.round(a), Math.round(a + w)] })
      const kids = [...r.children].map((k) => {
        const b = k.getBoundingClientRect()
        const kc = getComputedStyle(k)
        const lh = parseFloat(kc.lineHeight) || parseFloat(kc.fontSize) * 1.2
        // which track contains the child's left edge
        const track = ranges.findIndex(([a, z]) => b.left >= a - 1 && b.left <= z + 1)
        // text lines of the child's own direct text
        let lines = 0
        for (const n of k.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); lines = Math.max(lines, rg.getClientRects().length) }
        const trunc = [...k.querySelectorAll('*'), k].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow === 'ellipsis').map((e) => e.textContent.trim().slice(0, 40))
        return { cls: String(k.className).replace(/_([a-z]+)_[a-z0-9]+_\d+/g, '$1').slice(0, 30) || k.tagName, text: k.textContent.trim().replace(/\s+/g, ' ').slice(0, 48), track, left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), textLines: lines, truncated: trunc, fs: Math.round(parseFloat(kc.fontSize)) }
      })
      const big = kids.at(-1)
      return { tracksPx: tracks.map(Math.round), children: kids.length, rowRight: Math.round(rb.right - parseFloat(rc.paddingRight)), figureGapToRight: Math.round(rb.right - parseFloat(rc.paddingRight) - big.right), rowH: Math.round(rb.height), fullyShown: rb.bottom <= Math.min(bb.bottom, innerHeight) + 0.5, kids }
    })
    return { title, settled, rows: out }
  })
  const key = s.title.replace(/[\d,$]+$/, '').trim()
  if (s.rows && !seen.has(key)) {
    seen.set(key, s)
    await page.screenshot({ path: `${OUT}/v04-${fx}-${W}x${H}-${key.replace(/[^a-z]/gi, '').toLowerCase()}.png` })
  }
  await page.waitForTimeout(250)
}
const summary = []
for (const [k, s] of seen) {
  const r0 = s.rows[0]
  summary.push(`## ${s.title}: ${s.rows.length} rows (${s.rows.filter((r) => r.fullyShown).length} fully shown), children/row ${[...new Set(s.rows.map((r) => r.children))]}, tracks px ${JSON.stringify(r0.tracksPx)}`)
  summary.push(`   figure gap to row right edge: ${Math.min(...s.rows.map((r) => r.figureGapToRight))}..${Math.max(...s.rows.map((r) => r.figureGapToRight))} px; row height ${[...new Set(s.rows.map((r) => r.rowH))].join('/')}`)
  for (const r of s.rows.slice(0, 3)) summary.push('   ' + r.kids.map((c) => `[t${c.track}] ${c.cls} "${c.text}" w${c.w}${c.textLines > 1 ? ` WRAPS ${c.textLines} lines` : ''}${c.truncated.length ? ` TRUNC ${JSON.stringify(c.truncated)}` : ''}`).join(' | '))
  const wraps = s.rows.filter((r) => r.kids.some((c) => c.textLines > 1)).length
  const truncs = s.rows.filter((r) => r.kids.some((c) => c.truncated.length)).length
  summary.push(`   rows with a wrapping name: ${wraps}/${s.rows.length}; rows with an ellipsis: ${truncs}/${s.rows.length}`)
}
console.log(summary.join('\n'))
fs.writeFileSync(`${OUT}/v04-tvgrid-${fx}-${W}x${H}.json`, JSON.stringify([...seen.values()], null, 1))
await browser.close()
