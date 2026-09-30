// V12 / VIS-03: does the TV Individual board ever show every player?
// An init script shortens ONLY the TV's 12 000 ms rotation interval to 1 500 ms
// (no layout change). We sample the page every 250 ms in real time; whenever the
// Individual board is settled (section opacity 1, no transform) we record which
// rows are in the DOM and which are fully visible inside the clipped `.rows` box
// and the viewport. Output: players never fully shown, per viewport × fixture.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:4212'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V12'
const fixtures = (process.env.FIX || 'full12-finished,full12-live,large60,longnames').split(',')
const vps = (process.env.VPS || '1920x1080x1,1280x720x1,1366x768x1,3840x2160x2').split(',').map((s) => { const [w, h, d] = s.split('x').map(Number); return { w, h, d } })
const CYCLES = Number(process.env.CYCLES || 6) // rotations through all boards

const browser = await chromium.launch({ executablePath: EXE })
const results = []
for (const vp of vps) {
  for (const fx of fixtures) {
    const ctx = await browser.newContext({ viewport: { width: vp.w / vp.d, height: vp.h / vp.d }, deviceScaleFactor: vp.d, locale: 'es-MX', timezoneId: 'America/Mazatlan', reducedMotion: 'reduce' })
    await ctx.addInitScript(() => {
      const si = window.setInterval
      // @ts-ignore
      window.setInterval = (fn, ms, ...a) => si(fn, ms === 12000 ? 1500 : ms, ...a)
    })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/t/_/${fx}/tv`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    const boards = new Set()
    const everInDom = new Set(), everShown = new Set()
    const perTitle = new Map()
    let shotTaken = false, geom = null
    const t0 = Date.now()
    // number of boards is discovered as we go; run long enough for CYCLES full rotations of the largest board list (≤ 12 boards)
    const maxMs = Number(process.env.MAXMS || 1500 * 12 * CYCLES)
    while (Date.now() - t0 < maxMs) {
      const s = await page.evaluate(() => {
        const sec = document.querySelector('section')
        const title = document.querySelector('section h2')?.textContent?.trim() ?? ''
        const cs = sec ? getComputedStyle(sec) : null
        const settled = !!cs && cs.opacity === '1' && (cs.transform === 'none' || cs.transform === 'matrix(1, 0, 0, 1, 0, 0)')
        const box = sec?.querySelector('[class*="_rows_"]')
        if (!box) return { title, settled }
        const bb = box.getBoundingClientRect()
        const rows = [...box.querySelectorAll(':scope > [class*="_row_"]')].map((r) => {
          const b = r.getBoundingClientRect()
          const nameEl = r.querySelector('[class*="_name_"]')
          const txt = (nameEl?.firstElementChild?.firstChild?.textContent || nameEl?.textContent || '').trim()
          return { name: txt, pos: r.querySelector('[class*="_pos_"]')?.textContent?.trim(), h: Math.round(b.height), shown: b.bottom <= Math.min(bb.bottom, innerHeight) + 0.5 }
        })
        return { title, settled, boxTop: Math.round(bb.top), boxBottom: Math.round(bb.bottom), rows }
      })
      if (s.title) boards.add(s.title.replace(/ \d+–\d+$/, ''))
      if (s.settled && /^Individual/.test(s.title) && s.rows) {
        const shown = s.rows.filter((r) => r.shown)
        perTitle.set(s.title, `${shown.length}/${s.rows.length} fully shown; last shown pos ${shown.at(-1)?.pos}; hidden: ${s.rows.filter((r) => !r.shown).map((r) => r.pos).join(',')}`)
        for (const r of s.rows) { everInDom.add(r.name); if (r.shown) everShown.add(r.name) }
        if (!geom) geom = { box: `${s.boxTop}..${s.boxBottom} (${s.boxBottom - s.boxTop}px)`, rowH: s.rows[0]?.h }
        if (!shotTaken) { await page.screenshot({ path: `${OUT}/v03-${fx}-${vp.w}x${vp.h}.png` }); shotTaken = true }
      }
      await page.waitForTimeout(250)
    }
    const never = [...everInDom].filter((n) => !everShown.has(n))
    const res = { viewport: `${vp.w}x${vp.h}@${vp.d}`, fixture: fx, boards: [...boards], rowsBox: geom?.box, rowHeight: geom?.rowH, individualPages: [...perTitle.entries()], playersInDom: everInDom.size, playersEverFullyShown: everShown.size, neverShownCount: never.length, neverShown: never }
    results.push(res)
    console.log(JSON.stringify(res))
    await ctx.close()
  }
}
fs.writeFileSync(`${OUT}/v03-tvpaging${process.env.TAG ? '-' + process.env.TAG : ''}.json`, JSON.stringify(results, null, 1))
await browser.close()
