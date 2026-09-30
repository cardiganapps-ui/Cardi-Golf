// Keyboard-only walkthrough: focus order, visible focus, focus obscured by sticky bars (2.4.11), focus after view changes.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
const DIR = path.dirname(new URL(import.meta.url).pathname)
const BASE = 'http://127.0.0.1:4173'
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
// A phone with a hardware keyboard (iPad/Android + BT keyboard, or switch access): same layout.
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-MX' })
const page = await ctx.newPage()
const report = {}

const focusInfo = () =>
  page.evaluate(() => {
    const a = document.activeElement
    if (!a || a === document.body) return { tag: 'BODY' }
    const r = a.getBoundingClientRect()
    const cs = getComputedStyle(a)
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}` : null
    const shadow = cs.boxShadow !== 'none' ? cs.boxShadow.slice(0, 60) : null
    // What covers the element? Sample its centre and its top/bottom thirds.
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + r.width / 2, r.top + Math.min(4, r.height / 3)],
      [r.left + r.width / 2, r.bottom - Math.min(4, r.height / 3)],
    ]
    let covered = 0
    let coveredBy = null
    for (const [x, y] of pts) {
      if (y < 0 || y > innerHeight) {
        covered++
        coveredBy = 'offscreen'
        continue
      }
      const el = document.elementFromPoint(x, y)
      if (el && el !== a && !a.contains(el)) {
        covered++
        coveredBy = `${el.tagName}.${String(el.className).slice(0, 30)}`
      }
    }
    return { tag: a.tagName, name: (a.getAttribute('aria-label') ?? a.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50), top: Math.round(r.top), h: Math.round(r.height), outline, shadow, covered, coveredBy }
  })

async function walk(route, label, tabs, opts = {}) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  if (opts.before) await opts.before()
  const seq = []
  for (let i = 0; i < tabs; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(60)
    const f = await focusInfo()
    seq.push(f)
    if (opts.shotAt === i) await page.screenshot({ path: SHOTS + opts.shotName })
  }
  const noVisible = seq.filter((f) => f.tag !== 'BODY' && !f.outline && !f.shadow)
  const hidden = seq.filter((f) => f.covered === 3)
  const partly = seq.filter((f) => f.covered > 0 && f.covered < 3)
  report[label] = { route, tabs, noVisibleFocus: noVisible.length, fullyObscured: hidden.length, partlyObscured: partly.length, examplesNoVisible: noVisible.slice(0, 5), examplesObscured: hidden.slice(0, 6), seq: seq.map((f) => `${f.tag}:${f.name ?? ''}${f.covered ? ` [covered ${f.covered}/3 by ${f.coveredBy}]` : ''}${f.outline || f.shadow ? '' : ' [NO RING]'}`) }
  console.log(`${label}: tabs=${tabs} noRing=${noVisible.length} fullyObscured=${hidden.length} partly=${partly.length}`)
}

const F = '/t/_/full12-live'
await walk(F, 'En vivo', 30)
await walk(F + '/tarjeta', 'Tarjeta (hole)', 22)
await walk('/t/_/large60', 'En vivo large60', 40)
await walk(F + '/dinero', 'Dinero', 25)
await walk(F + '/stats', 'Stats', 30)
await walk(F + '/ceremonia', 'Ceremonia', 6)
await walk(F + '/admin/calcutta', 'Admin calcutta', 30)
await walk('/organizer/nuevo/_', 'Wizard step 1', 12)

// Focus after in-page view changes
await page.goto(BASE + F + '/juegos', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.locator('main h1 ~ div button').first().focus()
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
report.juegosAfterOpen = await focusInfo()
await page.getByRole('button', { name: 'Volver' }).focus().catch(() => undefined)
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
report.juegosAfterBack = await focusInfo()

await page.goto(BASE + F + '/tarjeta', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const nav = page.getByRole('button', { name: 'Hoyo siguiente' })
await nav.focus()
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
report.tarjetaAfterNext = await focusInfo()
// Go to the last hole: the "next" button disables under the keyboard focus.
for (let i = 0; i < 20; i++) {
  if (await nav.isDisabled()) break
  await page.keyboard.press('Enter')
  await page.waitForTimeout(80)
}
report.tarjetaAtLastHole = await focusInfo()

// Screenshot: keyboard focus on the Ceremonia "Siguiente" (board surface)
await page.goto(BASE + F + '/ceremonia', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Siguiente' }).focus()
await page.keyboard.press('Shift+Tab')
await page.keyboard.press('Tab')
await page.waitForTimeout(200)
report.ceremonyFocus = await focusInfo()
await page.screenshot({ path: SHOTS + 't_ceremonia-full12-live-15pro-light-a11y-focus.png' })

fs.writeFileSync(path.join(DIR, 'keyboard.json'), JSON.stringify(report, null, 1))
await browser.close()
console.log(JSON.stringify({ juegosAfterOpen: report.juegosAfterOpen, juegosAfterBack: report.juegosAfterBack, tarjetaAfterNext: report.tarjetaAfterNext, tarjetaAtLastHole: report.tarjetaAtLastHole, ceremonyFocus: report.ceremonyFocus }, null, 1))
