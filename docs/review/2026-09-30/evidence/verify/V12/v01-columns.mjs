// V12 / VIS-01: measure where the figure / button cells sit in each list row.
// Independent of the panelist's ragged.mjs: we look at the *trailing cells* of
// every row (all children after the first) and report their left/right x per row,
// the computed display/grid of the row, and the spread of x across rows.
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:4212'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V12'
const width = Number(process.env.W || 393)
const height = Number(process.env.H || 852)

const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-MX', timezoneId: 'America/Mazatlan', reducedMotion: 'reduce' })
const page = await ctx.newPage()

async function go(path) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
}
async function clickText(re) {
  const b = page.getByRole('button', { name: re }).first()
  if (await b.count()) await b.click()
  else await page.getByText(re).first().click()
  await page.waitForTimeout(500)
}

// Measure rows matching a selector (class substring) that are visible.
async function measure(clsSub) {
  return page.evaluate((clsSub) => {
    const rows = [...document.querySelectorAll(`[class*="${clsSub}"]`)].filter((r) => r.offsetParent && r.getBoundingClientRect().height > 0)
    return rows.map((r) => {
      const cs = getComputedStyle(r)
      const rb = r.getBoundingClientRect()
      const kids = [...r.children].filter((k) => k.getBoundingClientRect().width > 0)
      return {
        cls: r.className,
        display: cs.display,
        gtc: cs.gridTemplateColumns,
        rowLeft: Math.round(rb.left), rowRight: Math.round(rb.right), rowWidth: Math.round(rb.width),
        text: r.textContent.trim().replace(/\s+/g, ' ').slice(0, 70),
        cells: kids.map((k) => { const b = k.getBoundingClientRect(); return { tag: k.tagName, cls: String(k.className).slice(0, 40), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), txt: k.textContent.trim().replace(/\s+/g, ' ').slice(0, 30) } }),
      }
    })
  }, clsSub)
}

function summarize(label, rows) {
  const lines = [`## ${label}: ${rows.length} rows`]
  const displays = [...new Set(rows.map((r) => r.display))]
  lines.push(`   computed display: ${displays.join(', ')}; grid-template-columns: ${[...new Set(rows.map((r) => r.gtc))].join(' | ')}`)
  // trailing cells: index 1.. of each row
  const maxCells = Math.max(...rows.map((r) => r.cells.length))
  for (let i = 1; i < maxCells; i++) {
    const xs = rows.filter((r) => r.cells[i]).map((r) => ({ left: r.cells[i].left, right: r.cells[i].right, txt: r.cells[i].txt, rowRight: r.rowRight }))
    if (!xs.length) continue
    const lefts = xs.map((x) => x.left), rights = xs.map((x) => x.right)
    const gapToEdge = xs.map((x) => x.rowRight - x.right)
    lines.push(`   cell[${i}] n=${xs.length} left x: min ${Math.min(...lefts)} max ${Math.max(...lefts)} (spread ${Math.max(...lefts) - Math.min(...lefts)}); right x: min ${Math.min(...rights)} max ${Math.max(...rights)} (spread ${Math.max(...rights) - Math.min(...rights)}); gap to row right edge: ${Math.min(...gapToEdge)}..${Math.max(...gapToEdge)}`)
    lines.push(`      e.g. ${xs.slice(0, 6).map((x) => `"${x.txt}"@${x.left}-${x.right}`).join('  ')}`)
  }
  return lines.join('\n')
}

const report = []
const raw = {}

// 1) Juegos › La Calcutta
await go('/t/_/full12-live/juegos')
await clickText(/Calcutta/)
await page.screenshot({ path: `${OUT}/v01-juegos-calcutta-${width}.png`, fullPage: true })
raw.calcSlots = await measure('_rowLine_d3vna')
raw.calcOwners = await measure('_gameRow_d3vna')
report.push(summarize('Juegos › La Calcutta: slot rows (.rowLine)', raw.calcSlots))
report.push(summarize('Juegos › La Calcutta: owner rows (.gameRow button)', raw.calcOwners))

// 2) Juegos › Los Matrimonios
await go('/t/_/full12-live/juegos')
await clickText(/Matrimonios/)
await page.screenshot({ path: `${OUT}/v01-juegos-matrimonios-${width}.png`, fullPage: true })
raw.pairs = await measure('_rowLine_d3vna')
report.push(summarize('Juegos › Los Matrimonios: head-to-head rows (.rowLine)', raw.pairs))

// 3) Juegos overview (control)
await go('/t/_/full12-live/juegos')
raw.overview = await measure('_gameRow_d3vna')
report.push(summarize('Juegos overview (control): .gameRow', raw.overview))

// 4) Dinero › Liquidación
await go('/t/_/full12-live/dinero')
await clickText(/Liquidaci/)
await page.screenshot({ path: `${OUT}/v01-dinero-liquidacion-${width}.png`, fullPage: true })
raw.transfers = await measure('_transfer_')
// split: checklist rows (with Pagado button) vs settlement rows
report.push(summarize('Dinero › Liquidación: all .transfer rows', raw.transfers))
// Distinguish sections
const sections = await page.evaluate(() => [...document.querySelectorAll('[class*="_transfers_"]')].map((s) => s.querySelectorAll('[class*="_transfer_"]').length))
report.push(`   rows per .transfers section: ${JSON.stringify(sections)}`)

fs.writeFileSync(`${OUT}/v01-columns-${width}.json`, JSON.stringify(raw, null, 2))
console.log(report.join('\n'))
await browser.close()
